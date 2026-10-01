import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { getCssDeliveryMode } from './css-delivery-mode.mjs';

// Inspect real production output, not the config flag. No scripts or resources
// execute while parsing. Client navigation may still use cached external CSS.
export function assertCriticalCss(html) {
  const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
  try {
    const document = dom.window.document;
    const external = document.querySelectorAll('link[rel="stylesheet"]');
    if (external.length) throw new Error('First paint depends on an external stylesheet');
    const styles = [...document.querySelectorAll('style[data-precedence]')];
    // Current generated styles are approximately 256 KB before compression.
    // Allow headroom, but fail a large increase before it reaches production.
    const cssBytes = styles.reduce((sum, style) => sum + Buffer.byteLength(style.textContent), 0);
    if (cssBytes > 320 * 1024) throw new Error('Critical CSS exceeds the 320 KiB build budget');
    if (!styles.some(style => style.textContent.includes('--background:'))) {
      throw new Error('Initial HTML is missing the application stylesheet');
    }
  } finally {
    dom.window.close();
  }
}

// The experiment checks actual emitted assets, not merely the feature flag.
export function assertExternalCss(html, readStylesheet) {
  const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
  try {
    const document = dom.window.document;
    if (document.querySelector('style[data-precedence]')) {
      throw new Error('External CSS experiment unexpectedly contains inline application styles');
    }
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    if (!links.length) throw new Error('External CSS experiment is missing stylesheets');
    const sheets = [...new Set(links.map(link => link.getAttribute('href')))];
    const css = sheets.map(href => {
      if (!href || !/^\/_next\/static\/(?:immutable\/)?(?:chunks|css)\/[\w.-]+\.css(?:\?[^#]*)?$/.test(href)) {
        throw new Error('External CSS experiment has an unexpected stylesheet path');
      }
      const stylesheet = readStylesheet(href.split('?')[0]);
      if (!stylesheet.trim()) throw new Error('External CSS experiment has an empty stylesheet');
      return stylesheet;
    });
    if (css.reduce((sum, stylesheet) => sum + Buffer.byteLength(stylesheet), 0) > 320 * 1024) {
      throw new Error('External CSS exceeds the 320 KiB build budget');
    }
    if (!css.some(stylesheet => stylesheet.includes('--background:'))) {
      throw new Error('External CSS experiment is missing the application stylesheet');
    }
  } finally {
    dom.window.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const html = fs.readFileSync('.next/server/app/index.html', 'utf8');
  if (getCssDeliveryMode() === 'external') {
    assertExternalCss(html, href => fs.readFileSync(`.next/${href.slice('/_next/'.length)}`, 'utf8'));
    console.log('Preview CSS experiment: emitted stylesheets exist and meet the build budget.');
  } else {
    assertCriticalCss(html);
    console.log('Critical CSS: initial HTML contains application styles without a stylesheet request.');
  }
}
