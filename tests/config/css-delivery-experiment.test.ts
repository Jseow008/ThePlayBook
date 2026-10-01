import { describe, expect, it } from 'vitest';
import { getCssDeliveryMode } from '../../scripts/css-delivery-mode.mjs';
import { assertExternalCss } from '../../scripts/check-critical-css.mjs';

const html = '<link rel="stylesheet" href="/_next/static/chunks/app.css">';
const applicationCss = ':root{--background:0 0% 0%}';

describe('preview-only CSS delivery experiment', () => {
  it('keeps production inline and rejects external mode outside previews', () => {
    expect(getCssDeliveryMode({})).toBe('inline');
    expect(getCssDeliveryMode({ VERCEL_ENV: 'production' })).toBe('inline');
    for (const VERCEL_ENV of ['production', 'development', undefined]) {
      expect(() => getCssDeliveryMode({ VERCEL_ENV, NETFLUX_CSS_DELIVERY_EXPERIMENT: 'external' })).toThrow('restricted');
    }
    expect(getCssDeliveryMode({ VERCEL_ENV: 'preview', NETFLUX_CSS_DELIVERY_EXPERIMENT: 'external' })).toBe('external');
    expect(() => getCssDeliveryMode({ NETFLUX_CSS_DELIVERY_EXPERIMENT: 'typo' })).toThrow('Unknown');
  });
  it('requires real, local application stylesheets', () => {
    expect(() => assertExternalCss(html, () => applicationCss)).not.toThrow();
    expect(() => assertExternalCss('', () => applicationCss)).toThrow('missing');
    expect(() => assertExternalCss(html, () => '')).toThrow('empty');
    expect(() => assertExternalCss(html, () => 'body{}')).toThrow('missing the application');
    expect(() => assertExternalCss(html, () => { throw new Error('ENOENT'); })).toThrow('ENOENT');
    for (const href of ['https://example.com/app.css', '/_next/static/chunks/../app.css', '/_next/static/chunks/%2e%2e/app.css']) {
      expect(() => assertExternalCss(`<link rel="stylesheet" href="${href}">`, () => applicationCss)).toThrow('unexpected stylesheet path');
    }
  });
  it('rejects duplicated inline delivery and oversized styles', () => {
    expect(() => assertExternalCss(html + '<style data-precedence="next">body{}</style>', () => applicationCss)).toThrow('inline application');
    expect(() => assertExternalCss(html, () => applicationCss + 'x'.repeat(320 * 1024))).toThrow('build budget');
  });
});
