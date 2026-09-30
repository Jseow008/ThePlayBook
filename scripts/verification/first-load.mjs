#!/usr/bin/env node
// Read-only browser comparison; never submits forms or calls AI endpoints.
// BASELINE_URL and CANDIDATE_URL must identify immutable builds with equal envs.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseline = new URL(process.env.BASELINE_URL);
const candidate = new URL(process.env.CANDIDATE_URL);
const output = process.env.FIRST_LOAD_OUTPUT || '/tmp/netflux-first-load-evidence';
const routes = JSON.parse(process.env.FIRST_LOAD_ROUTES || '["/","/browse"]');
const repetitions = Number(process.env.FIRST_LOAD_RUNS || 3);
assert(Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 5);
assert(routes.every(p => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')));
assert(baseline.origin !== candidate.origin, 'Use distinct immutable deployment URLs');
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
await fs.mkdir(output, { recursive: true });
const result = {
  baseline: { origin: baseline.origin, commit: process.env.BASELINE_SHA || null },
  candidate: { origin: candidate.origin, commit: process.env.CANDIDATE_SHA || null },
  conditions: { viewport: '390x844', dpr: 1, downloadBytesPerSecond: 200000,
    latencyMs: 150, cpuSlowdown: 4, repetitions, tour: 'dismissed',
    cache: 'cold context, then same-context warm reload',
    note: 'Synthetic sequential samples, not field percentiles. No production writes or AI calls.' },
  cases: [],
};
const browser = await chromium.launch();
try {
  for (let run = 0; run < repetitions; run++) {
    for (const route of routes) {
      for (const target of run % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
        const origin = target === 'baseline' ? baseline.origin : candidate.origin;
        const context = await browser.newContext({ viewport: { width: 390, height: 844 },
          isMobile: true, deviceScaleFactor: 1 });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        let imageRequests = [];
        cdp.on('Network.requestWillBeSent', event => {
          if (event.type === 'Image') imageRequests.push({ priority: event.request.initialPriority,
            path: new URL(event.request.url).pathname });
        });
        await cdp.send('Network.enable');
        // CDP interception preserves the cache for the warm pass. Playwright
        // context.route would disable it, making a "warm" comparison misleading.
        if (bypass) {
          await cdp.send('Fetch.enable', { patterns: [{ urlPattern: origin + '/*', requestStage: 'Request' }] });
          cdp.on('Fetch.requestPaused', async event => {
            const headers = Object.entries(event.request.headers).map(([name, value]) => ({ name, value: String(value) }));
            if (new URL(event.request.url).origin === origin) {
              headers.push({ name: 'x-vercel-protection-bypass', value: bypass });
            }
            await cdp.send('Fetch.continueRequest', { requestId: event.requestId, headers }).catch(() => {});
          });
        }
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
          downloadThroughput: 200000, uploadThroughput: 93750 });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.addInitScript(() => {
          localStorage.setItem('netflux_guest_onboarding_v1', JSON.stringify({ status: 'dismissed',
            updated_at: new Date().toISOString(), version: 'v1' }));
          window.__firstLoad = { lcp: [], longTasks: [] };
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) window.__firstLoad.lcp.push({ at: entry.startTime, tag: entry.element?.tagName });
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) window.__firstLoad.longTasks.push({ at: entry.startTime, duration: entry.duration });
          }).observe({ type: 'longtask', buffered: true });
        });
        for (const cache of ['cold', 'warm']) {
          imageRequests = [];
          const response = await page.goto(origin + route, { waitUntil: 'load', timeout: 60000 });
          assert.equal(response.status(), 200);
          await page.waitForTimeout(2000);
          const data = await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            return {
              ttfb: nav.responseStart, htmlBytes: nav.transferSize, htmlDecodedBytes: nav.decodedBodySize,
              domInteractive: nav.domInteractive, load: nav.loadEventEnd,
              fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
              ...window.__firstLoad,
              stylesheetLinks: document.querySelectorAll('link[rel="stylesheet"]').length,
              inlineStyles: document.querySelectorAll('style[data-precedence]').length,
              highPriorityImages: document.querySelectorAll('img[fetchpriority="high"]').length,
              overflow: document.documentElement.scrollWidth > innerWidth,
              resources: performance.getEntriesByType('resource').map(e => ({
                path: new URL(e.name).pathname, type: e.initiatorType, start: e.startTime,
                end: e.responseEnd, transfer: e.transferSize, decoded: e.decodedBodySize,
              })),
            };
          });
          assert(Number.isFinite(data.fcp), 'Content must paint');
          assert(!data.overflow, 'No horizontal overflow');
          if (target === 'candidate') {
            assert(data.inlineStyles > 0, 'Built candidate must include critical CSS in HTML');
            assert.equal(data.stylesheetLinks, 0, 'Hard loads must not depend on an external stylesheet');
          }
          if (target === 'candidate' && route === '/browse') {
            assert(data.highPriorityImages > 0, 'Initial hero must have explicit fetch priority');
          }
          result.cases.push({ run, route, target, cache, imageRequests, ...data });
          await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
          console.log(JSON.stringify({ run, route, target, cache, fcp: data.fcp, lcp: data.lcp.at(-1)?.at,
            ttfb: data.ttfb, htmlBytes: data.htmlBytes, cssLinks: data.stylesheetLinks }));
          if (run === 0 && cache === 'cold') await page.screenshot({ path: path.join(output,
            target + '-' + (route === '/' ? 'home' : route.split('/')[1]) + '.png') });
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
