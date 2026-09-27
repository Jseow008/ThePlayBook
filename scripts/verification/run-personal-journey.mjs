/** Owns build/server provenance for #26. Input JSON and logs must remain private. */
import { strict as assert } from 'node:assert';
import { readFileSync, mkdirSync, openSync, closeSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';

const output = resolve(process.env.JOURNEY_EVIDENCE_PATH || '');
assert(process.env.JOURNEY_EVIDENCE_PATH, 'Provide JOURNEY_EVIDENCE_PATH outside the repository');
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
writeFileSync(output, JSON.stringify({ outcome: 'running', recordedAt: new Date().toISOString() }), { mode: 0o600 });

for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    assert(!existsSync(name), `Use a clean isolated checkout without ${name}; Next would load it outside the configuration whitelist`);
}
const input = JSON.parse(readFileSync(process.env.JOURNEY_ENV_FILE || '', 'utf8'));
const allow = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY',
    'JOURNEY_DATABASE_URL', 'SNAPSHOT_WORKER_DATABASE_URL', 'SNAPSHOT_MAINTENANCE_DATABASE_URL',
    'ACCOUNT_DATA_CURSOR_SECRET', 'CRON_SECRET', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY',
    'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'JOURNEY_BASE_URL'];
for (const key of allow) assert(typeof input[key] === 'string' && input[key], `Missing ${key}`);
for (const key of ['JOURNEY_BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'JOURNEY_DATABASE_URL', 'SNAPSHOT_WORKER_DATABASE_URL', 'SNAPSHOT_MAINTENANCE_DATABASE_URL']) {
    assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(input[key]).hostname), `${key} must be disposable loopback`);
}
const db = new URL(input.JOURNEY_DATABASE_URL);
for (const [key, role] of [['SNAPSHOT_WORKER_DATABASE_URL', 'netflux_snapshot_worker'], ['SNAPSHOT_MAINTENANCE_DATABASE_URL', 'netflux_snapshot_maintenance']]) {
    const worker = new URL(input[key]);
    assert(worker.host === db.host && worker.pathname === db.pathname && worker.username === role, `${key} must use the restricted role in the same disposable database`);
}
const origin = new URL(input.JOURNEY_BASE_URL);
assert(origin.protocol === 'http:' && origin.port, 'Use an explicit local HTTP port');
// Fail rather than testing an unrelated server already listening on this port.
try { await fetch(origin, { signal: AbortSignal.timeout(1000) }); throw new Error('Journey port is already occupied'); }
catch (error) { if (error.message === 'Journey port is already occupied') throw error; }
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    ...Object.fromEntries(allow.map(key => [key, input[key]])),
    NODE_ENV: 'production', VERCEL: '1', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_APP_URL: origin.origin, NEXT_PUBLIC_SITE_URL: origin.origin,
    ANONYMOUS_ACTIVITY_SECRET: randomBytes(48).toString('hex'),
    JOURNEY_EVIDENCE_PATH: output, JOURNEY_OWNED_SERVER: '1' };
const log = openSync(`${output}.runtime.log`, 'w', 0o600);
const run = async (args) => {
    const child = spawn(process.execPath, args, { env, stdio: ['ignore', log, log] });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, `Verification command failed: ${args[0]}; inspect private runtime log`);
};
let server;
let journeySucceeded = false;
try {
    console.log('Building production application with disposable configuration');
    await run(['node_modules/next/dist/bin/next', 'build', '--webpack']);
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', origin.port, '-H', origin.hostname], { env, stdio: ['ignore', log, log] });
    let ready = false;
    for (let i = 0; i < 60; i++) {
        assert(server.exitCode === null, 'Owned server exited before readiness');
        try { ready = (await fetch(`${origin.origin}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* bounded startup wait */ }
        if (ready) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert(ready, 'Owned production server did not become ready');
    console.log('Running required ordinary-user journey (no skips or automatic retries)');
    await run(['node_modules/tsx/dist/cli.mjs', 'scripts/verification/personal-journey.ts']);
    assert(server.exitCode === null, 'Owned server exited unexpectedly during the journey');
    journeySucceeded = true;
} finally {
    if (server && server.exitCode === null) {
        const exited = once(server, 'exit');
        server.kill('SIGTERM');
        const forced = setTimeout(() => server.kill('SIGKILL'), 5000);
        await exited;
        clearTimeout(forced);
    }
    closeSync(log);
    const result = JSON.parse(readFileSync(output, 'utf8'));
    writeFileSync(output, JSON.stringify({ ...result, outcome: journeySucceeded ? 'passed' : 'failed',
        serverCleanupVerified: !server || server.exitCode !== null || server.signalCode !== null }, null, 2), { mode: 0o600 });
    if (journeySucceeded) console.log('Journey and cleanup passed; sanitized result:', output);
}
