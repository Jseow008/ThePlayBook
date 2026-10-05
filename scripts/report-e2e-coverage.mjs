import { appendFileSync, readFileSync } from 'node:fs';

// A missing report is a failed run, not evidence of complete coverage.
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const stats = report.stats;
if (!stats || !['expected', 'unexpected', 'flaky', 'skipped'].every((key) => Number.isInteger(stats[key]))) {
  throw new Error('Playwright report has no valid coverage statistics.');
}
const summary = `## Nightly browser coverage\n\nPassed: ${stats.expected}; failed: ${stats.unexpected}; flaky: ${stats.flaky}; skipped: ${stats.skipped}.\n\nAll six viewport projects were requested. Skipped tests are **not verified coverage**; inspect the HTML report for fixture requirements and skip reasons. This disposable local run does not verify production.\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (stats.skipped) console.log('::warning::Browser tests were skipped. See the report for missing fixtures and viewport-specific exclusions.');
if (stats.expected + stats.unexpected + stats.flaky === 0) throw new Error('No browser tests executed.');
