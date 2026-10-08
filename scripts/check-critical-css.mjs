import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const htmlPath = [
    '.next/server/app/index.html',
    '.vercel/output/functions/index.prerender-fallback.html',
  ].find((path) => fs.existsSync(path));
  if (!htmlPath) throw new Error('No generated homepage HTML found for critical CSS check');
  assertCriticalCss(fs.readFileSync(htmlPath, 'utf8'));
  console.log('Critical CSS: initial HTML contains application styles without a stylesheet request.');
}
