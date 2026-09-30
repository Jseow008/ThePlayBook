import { describe, expect, it } from 'vitest';
import { assertCriticalCss } from '../../scripts/check-critical-css.mjs';

describe('production critical-style regression guard', () => {
  it('accepts application styles delivered in HTML', () => {
    expect(() => assertCriticalCss('<style data-precedence="next">:root{--background:0 0% 0%}</style>')).not.toThrow();
  });
  it('rejects external CSS even alongside inline styles', () => {
    expect(() => assertCriticalCss('<style data-precedence="next">:root{--background:0}</style><link href="/app.css" rel="stylesheet">')).toThrow('external stylesheet');
  });
  it('rejects unrelated styles and script strings masquerading as markup', () => {
    expect(() => assertCriticalCss('<script>const html = `<style data-precedence="next">--background:0</style>`</script><style>body{color:red}</style>')).toThrow('missing');
  });
});
