// Production-build smoke; synthetic errors are intercepted locally, never sent.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';

const origin = new URL(process.env.FIRST_LOAD_ORIGIN || 'http://localhost:3219');
assert(['localhost', '127.0.0.1'].includes(origin.hostname), 'Synthetic error proof is local-only');
const browser = await chromium.launch();
const result = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width === 390 });
    let capturedError = false;
    let sentTransaction = false;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/error-monitoring' || url.hostname.endsWith('sentry.io')) {
        const body = route.request().postData() || '';
        capturedError ||= body.includes('netflux-first-load-error-proof');
        sentTransaction ||= body.includes('"type":"transaction"');
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      } else if (url.pathname.startsWith('/flux/') || url.hostname.endsWith('posthog.com')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      } else await route.continue();
    });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('netflux_guest_onboarding_v1', JSON.stringify({
      status: 'dismissed', updated_at: new Date().toISOString(), version: 'v1',
    })));
    await page.goto(origin.href);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByRole('link', { name: 'Explore a Summary', exact: true }).click();
    await page.waitForURL('**/browse');
    await page.locator('img[fetchpriority="high"]').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('link', { name: /^Preview / }).first().click();
    await page.waitForURL('**/preview/**');
    await page.getByRole('heading', { level: 1 }).waitFor();
    // A real uncaught browser error must still pass through the built SDK.
    await page.evaluate(() => setTimeout(() => { throw new Error('netflux-first-load-error-proof'); }, 0));
    for (let attempt = 0; attempt < 30 && !capturedError; attempt++) await page.waitForTimeout(100);
    assert(capturedError, 'Built Sentry error capture must remain operational');
    assert(!sentTransaction, 'Disabled performance tracing must remain disabled');
    result.push({ width, navigation: 'Home → Browse → Preview', overflow: false,
      errorCaptureIntercepted: capturedError, sentTransaction });
    await context.close();
  }
} finally {
  await browser.close();
}
const output = process.env.FIRST_LOAD_RUNTIME_OUTPUT || '/tmp/netflux-first-load-runtime.json';
await fs.writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
