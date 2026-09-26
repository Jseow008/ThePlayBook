import { spawnSync } from 'node:child_process';
// Explicit-only historical evidence generation. Never part of the default suite.
const result = spawnSync('npx', ['vitest', 'run', 'tests/fixtures/retrieval/baseline-harness.test.ts'], {
  stdio: 'inherit', env: { ...process.env, PERSONAL_RETRIEVAL_BASELINE: '1' },
});
process.exit(result.status ?? 1);
