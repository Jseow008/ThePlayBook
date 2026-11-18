import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureCiSnapshotWorker } from '../../scripts/configure-ci-snapshot-worker.mjs';

const status = { DB_URL: 'postgresql://postgres:local@127.0.0.1:54322/postgres', API_URL: 'http://127.0.0.1:54321' };
function harness() {
  const role = { current_user: 'netflux_snapshot_worker', rolsuper: false, rolbypassrls: false, rolinherit: false };
  const admin = { connect: vi.fn(), query: vi.fn(), end: vi.fn() };
  const worker = { connect: vi.fn(), query: vi.fn(async () => ({ rows: [role] })), end: vi.fn() };
  const createClient = vi.fn().mockReturnValueOnce(admin).mockReturnValueOnce(worker);
  return { role, admin, worker, createClient };
}

describe('CI snapshot worker setup', () => {
  it.each(['DB_URL', 'API_URL'])('rejects a remote %s before any connection or credential export', async field => {
    const createClient = vi.fn();
    await expect(configureCiSnapshotWorker({ status: { ...status, [field]: status[field].replace('127.0.0.1', 'production.example.com') }, envFile: '/unused', createClient })).rejects.toThrow('loopback');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('exports only a verified restricted worker connection and fresh cursor key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'snapshot-worker-ci-'));
    try {
      const envFile = join(dir, 'env');
      const h = harness();
      const mask = vi.fn();
      await configureCiSnapshotWorker({ status, envFile, createClient: h.createClient, mask });
      const env = Object.fromEntries(readFileSync(envFile, 'utf8').trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)));
      const url = new URL(env.SNAPSHOT_WORKER_DATABASE_URL);
      expect(url.username).toBe('netflux_snapshot_worker');
      expect(url.host).toBe(new URL(status.DB_URL).host);
      expect(url.pathname).toBe('/postgres');
      expect(url.password).toMatch(/^[a-f0-9]{64}$/);
      expect(env.ACCOUNT_DATA_CURSOR_SECRET).toMatch(/^[a-f0-9]{64}$/);
      expect(mask).toHaveBeenCalledWith(url.toString());
      expect(h.worker.connect).toHaveBeenCalledOnce();
      expect(h.admin.query).toHaveBeenCalledWith(`ALTER ROLE netflux_snapshot_worker PASSWORD '${url.password}'`);
      expect(h.admin.end).toHaveBeenCalledOnce();
      expect(h.worker.end).toHaveBeenCalledOnce();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.each(['rolsuper', 'rolbypassrls', 'rolinherit'])('refuses %s rather than exporting privileged credentials', async flag => {
    const dir = mkdtempSync(join(tmpdir(), 'snapshot-worker-ci-'));
    try {
      const h = harness(); h.role[flag] = true;
      const envFile = join(dir, 'env');
      await expect(configureCiSnapshotWorker({ status, envFile, createClient: h.createClient })).rejects.toThrow('restricted');
      expect(existsSync(envFile)).toBe(false);
      expect(h.admin.end).toHaveBeenCalledOnce();
      expect(h.worker.end).toHaveBeenCalledOnce();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('exports no credential on connection failure and closes both clients', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'snapshot-worker-ci-'));
    try {
      const h = harness(); h.worker.connect.mockRejectedValue(new Error('unavailable'));
      const envFile = join(dir, 'env');
      await expect(configureCiSnapshotWorker({ status, envFile, createClient: h.createClient })).rejects.toThrow('unavailable');
      expect(existsSync(envFile)).toBe(false);
      expect(h.admin.end).toHaveBeenCalledOnce();
      expect(h.worker.end).toHaveBeenCalledOnce();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
