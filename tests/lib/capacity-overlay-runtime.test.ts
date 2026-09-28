import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installOverlayRuntime, verifyOverlayFixture } from '../../scripts/verification/capacity/overlay-runtime';
import { fetchVerifiedAccountDataExport } from '@/lib/account-data-export-client';
import { ACCOUNT_DATA_EXPORT_COLLECTIONS } from '@/lib/account-data-snapshot-collections';

const origin = 'https://capacity.example.test';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const reflection = (id: string) => ({ id, content_item_id: 'content', prompt: 'Question', reflection_text: 'Verified fixture ' + id });
function fixture(id: string) {
    const payload = reflection(id);
    const payloadHash = hash(JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)))));
    const manifest = {
        snapshotId: id, recordCount: 1, manifestHash: hash(payloadHash), resetEpoch: 0,
        boundaryLibraryRevision: 0, expiresAt: '2030-01-01T00:00:00Z', schemaVersion: 2,
        collectionManifests: Object.fromEntries(ACCOUNT_DATA_EXPORT_COLLECTIONS.map(collection => [collection,
            { recordCount: collection === 'reflections' ? 1 : 0, manifestHash: hash(collection === 'reflections' ? payloadHash : '') }])),
    };
    return { manifest, record: { ordinal: 1, recordId: id, payload, payloadHash } };
}
function response(url: URL, value: unknown, status = 200) {
    const result = new Response(JSON.stringify(value), { status });
    Object.defineProperty(result, 'url', { value: url.href });
    return result;
}
let runtime: ReturnType<typeof installOverlayRuntime> | undefined;
// Remove the shared test environment's browser global to reproduce the Node harness.
beforeEach(() => vi.stubGlobal('window', undefined));
afterEach(() => { runtime?.restore(); runtime = undefined; vi.unstubAllGlobals(); });

describe('Node capacity overlay adapter', () => {
    it('runs the actual export verifier for concurrent accounts, including URL page requests and redacted ownership fields', async () => {
        expect(typeof window).toBe('undefined');
        const requests: { cookie: string | null; path: string }[] = [];
        const network = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(String(input));
            const cookie = new Headers(init?.headers).get('cookie');
            requests.push({ cookie, path: url.pathname });
            expect(init?.redirect).toBe('manual');
            const { manifest, record } = fixture(cookie!);
            await Promise.resolve();
            return response(url, init?.method === 'POST' ? { state: 'ready', manifest } : {
                manifest, data: url.pathname.endsWith('/reflections') ? [record] : [], pageInfo: { hasNextPage: false, endCursor: null },
            });
        });
        vi.stubGlobal('fetch', network);
        runtime = installOverlayRuntime(origin);
        const values = await Promise.all(['account-a', 'account-b'].map(cookie => runtime!.runAs(cookie, new AbortController().signal, () => fetchVerifiedAccountDataExport())));
        for (const [index, value] of values.entries()) {
            const id = index ? 'account-b' : 'account-a';
            verifyOverlayFixture(value.data, { library: [], reflections: [reflection(id)] });
            expect(value.data.reflections[0]).not.toHaveProperty('user_id');
            expect(requests.filter(row => row.cookie === id)).toHaveLength(ACCOUNT_DATA_EXPORT_COLLECTIONS.length + 1);
            expect(requests.filter(row => row.cookie === id && row.path !== '/api/account-data/snapshots').every(row => row.path.includes(id))).toBe(true);
        }
        expect(() => verifyOverlayFixture(values[0].data, { library: [], reflections: [reflection('account-b')] })).toThrow('fixture mismatch');
        runtime.restore(); runtime = undefined;
        expect(typeof window).toBe('undefined');
        expect(fetch).toBe(network);
    });

    it('rejects wrong-origin requests before sending credentials and enforces bounds and cancellation', async () => {
        const controller = new AbortController();
        const network = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(init?.signal?.aborted).toBe(true);
            expect(new Headers(init?.headers).get('x-vercel-protection-bypass')).toBe('fixture-bypass');
            throw new DOMException('Aborted', 'AbortError');
        });
        vi.stubGlobal('fetch', network);
        runtime = installOverlayRuntime(origin, 1, 'fixture-bypass');
        await expect(runtime.runAs('cookie', controller.signal, () => fetch(new URL('https://other.example.test/')))).rejects.toThrow('target changed');
        expect(network).not.toHaveBeenCalled();
        controller.abort();
        await expect(runtime.runAs('cookie', controller.signal, () => fetch('/first'))).rejects.toThrow('Aborted');
        await expect(runtime.runAs('cookie', controller.signal, () => fetch('/second'))).rejects.toThrow('request bound');
        expect(network).toHaveBeenCalledTimes(1);
    });

    it('retains payload-hash rejection through the adapter', async () => {
        const { manifest, record } = fixture('account');
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(String(input));
            return response(url, init?.method === 'POST' ? { state: 'ready', manifest } : {
                manifest, data: url.pathname.endsWith('/reflections') ? [{ ...record, payload: { ...record.payload, reflection_text: 'Changed' } }] : [],
                pageInfo: { hasNextPage: false, endCursor: null },
            });
        }));
        runtime = installOverlayRuntime(origin);
        await expect(runtime.runAs('account', new AbortController().signal, () => fetchVerifiedAccountDataExport())).rejects.toMatchObject({ code: 'SNAPSHOT_INVALID' });
    });
});
