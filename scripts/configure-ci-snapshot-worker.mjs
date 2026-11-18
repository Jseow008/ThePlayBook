import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

export async function configureCiSnapshotWorker({ status, envFile, createClient = connectionString => new pg.Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000 }), mask = () => {} }) {
  const database = new URL(status.DB_URL);
  const api = new URL(status.API_URL);
  if (!loopback.has(database.hostname) || !loopback.has(api.hostname)
      || !['postgres:', 'postgresql:'].includes(database.protocol)
      || !['http:', 'https:'].includes(api.protocol) || !envFile) {
    throw new Error('Snapshot CI setup requires disposable loopback Supabase and an environment file.');
  }
  const password = randomBytes(32).toString('hex');
  const workerUrl = new URL(database);
  workerUrl.username = 'netflux_snapshot_worker';
  workerUrl.password = password;
  const workerConnection = workerUrl.toString();
  const cursorSecret = randomBytes(32).toString('hex');
  for (const value of [password, workerConnection, cursorSecret]) mask(value);
  const admin = createClient(database.toString());
  const worker = createClient(workerConnection);
  try {
    await admin.connect();
    // Hex-only generated password; no caller-controlled SQL or role grants.
    await admin.query(`ALTER ROLE netflux_snapshot_worker PASSWORD '${password}'`);
    await worker.connect();
    const { rows } = await worker.query('SELECT current_user, rolsuper, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = current_user');
    const role = rows[0];
    if (role?.current_user !== 'netflux_snapshot_worker' || role.rolsuper !== false
        || role.rolbypassrls !== false || role.rolinherit !== false) {
      throw new Error('CI snapshot connection must use the restricted snapshot worker.');
    }
    appendFileSync(envFile, `SNAPSHOT_WORKER_DATABASE_URL=${workerConnection}\nACCOUNT_DATA_CURSOR_SECRET=${cursorSecret}\n`, { mode: 0o600 });
  } finally {
    await Promise.allSettled([admin.end(), worker.end()]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.SUPABASE_LOCAL !== '1') throw new Error('Requires explicit disposable local setup.');
    const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] }));
    await configureCiSnapshotWorker({ status, envFile: process.env.GITHUB_ENV,
      mask: value => { if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${value}`); } });
    console.log('Disposable CI snapshot worker connected with restricted privileges.');
  } catch {
    console.error('Disposable CI snapshot worker setup failed; check local Supabase readiness and restricted role.');
    process.exitCode = 1;
  }
}
