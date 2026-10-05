import { expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import { classifyPaths } from '../../scripts/classify-ci-changes.mjs';

const workflow = (name) => load(readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
const ci = workflow('ci');
const security = workflow('security');
const nightly = workflow('nightly-e2e');
const databaseSteps = [
  ...security.jobs['security-gate'].steps.filter(({ name }) => ['Setup local Supabase', 'Supabase SQL drift checks', 'Retain personal retrieval evidence'].includes(name)),
  ...security.jobs['catalog-search-evidence'].steps.filter(({ if: condition }) => condition),
];
function applies(step, outcome, outputs) {
  return runInNewContext(step.if, { steps: { scope: { outcome, outputs } }, always: () => true });
}

it.each([
  { paths: ['app/globals.css'], expected: false },
  { paths: ['AGENTS.md'], expected: false },
  { paths: ['lib/admin/auth.ts'], expected: true },
  { paths: ['supabase/migrations/002.sql'], expected: true },
  { paths: ['unknown.ts'], expected: true },
])('selects actual security workflow steps for $paths', ({ paths, expected }) => {
  const scope = classifyPaths(paths);
  for (const step of databaseSteps) {
    expect(applies(step, 'success', { run_full: String(scope.runFull), run_database: String(scope.runDatabase) }), step.name).toBe(expected);
  }
});

it.each(['failure', 'skipped', 'success'])('runs database checks on missing output or classifier %s', (outcome) => {
  for (const step of databaseSteps) {
    expect(applies(step, outcome, {}), step.name).toBe(true);
    if (outcome !== 'success') expect(applies(step, outcome, { run_database: 'false' }), step.name).toBe(true);
  }
});

it.each([
  ['success', 'false', 'playwright test --project=desktop-chromium'],
  ['success', 'true', 'playwright test'],
  ['success', '', 'playwright test'],
  ['failure', 'false', 'playwright test'],
  ['skipped', 'false', 'playwright test'],
])('executes browser selection safely for outcome=%s output=%s', (outcome, responsive, expected) => {
  const step = ci.jobs.validate.steps.find(({ name }) => name === 'Test (E2E)');
  // Execute the workflow shell itself with a stub, never launch browsers here.
  const output = execFileSync('bash', ['-c', 'npx() { printf "%s\\n" "$*"; };\n' + step.run], {
    env: { ...process.env, SCOPE_OUTCOME: outcome, RUN_RESPONSIVE: responsive }, encoding: 'utf8',
  });
  expect(output.trim()).toBe(expected);
});

it('keeps required job identities and an unconditional full nightly matrix', () => {
  expect(ci.jobs.validate).toBeDefined();
  expect(security.jobs['security-gate'].name).toBe('Security Validation');
  const steps = nightly.jobs['responsive-e2e'].steps;
  expect(nightly.on.schedule).toHaveLength(1);
  expect(nightly.on).toHaveProperty('workflow_dispatch');
  const browser = steps.find(({ name }) => name === 'Full responsive E2E');
  expect(browser.if).toBeUndefined();
  expect(browser.run).toBe('npx playwright test --reporter=html,json');
  expect(steps.find(({ name }) => name === 'Report executed and skipped coverage').if).toBe('always()');
});

it('reports skipped coverage and rejects empty or missing browser evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-e2e-report-'));
  try {
    const file = join(directory, 'report.json');
    const summary = join(directory, 'summary.md');
    const run = () => spawnSync(process.execPath, ['scripts/report-e2e-coverage.mjs', file], {
      encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
    });
    expect(run().status).not.toBe(0);
    writeFileSync(file, JSON.stringify({ stats: { expected: 12, unexpected: 0, flaky: 1, skipped: 4 } }));
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::warning::');
    expect(readFileSync(summary, 'utf8')).toContain('skipped: 4');
    writeFileSync(file, JSON.stringify({ stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 4 } }));
    expect(run().status).not.toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
