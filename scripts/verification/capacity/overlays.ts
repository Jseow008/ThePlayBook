/** Small real export/AI overlays; uses the production export verifier, no provider mocks. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, writeFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fetchVerifiedAccountDataExport } from '../../../lib/account-data-export-client';
import { ACCOUNT_DATA_EXPORT_COLLECTIONS } from '../../../lib/account-data-snapshot-collections';
import { validateConfig } from './runner.mjs';
import { validateProductionConfig, PRODUCTION_TOKEN } from './production-runner.mjs';

async function main() {
    const [configPath, output, mode = 'sample', productionToken] = process.argv.slice(2);
    assert(configPath && output && ['sample', 'full'].includes(mode));
    assert.equal((await stat(configPath)).mode & 0o077, 0);
    const parsed = JSON.parse(await readFile(configPath, 'utf8'));
    const config = productionToken === PRODUCTION_TOKEN ? validateProductionConfig(parsed, productionToken) : validateConfig(parsed);
    const originalFetch = globalThis.fetch;
    const context = new AsyncLocalStorage<{ cookie: string; signal: AbortSignal }>();
    let requests = 0;
    globalThis.fetch = async (input, init) => {
        const active = context.getStore(); assert(active, 'Missing user request scope');
        assert(typeof input === 'string' && input.startsWith('/') && !input.startsWith('//'));
        assert(++requests <= 200, 'Overlay request bound');
        const response = await originalFetch(new URL(input, config.origin), {
            ...init, redirect: 'manual', signal: AbortSignal.any([active.signal, ...(init?.signal ? [init.signal] : [])]),
            headers: { ...init?.headers, cookie: active.cookie, ...(config.vercelProtectionBypass ? { 'x-vercel-protection-bypass': config.vercelProtectionBypass } : {}) },
        });
        assert(new URL(response.url).origin === config.origin && !(response.status >= 300 && response.status < 400), 'Overlay target changed');
        return response;
    };
    const evidence: { operation: string; durationMs: number; outcome: string; verifiedCollections?: number; records?: number }[] = [];
    let failed = false;
    try {
        const indices = mode === 'sample' ? [0] : [0, 44, 45, 46, 47, 48];
        for (let offset = 0; offset < indices.length; offset += 2) {
            const batch = await Promise.allSettled(indices.slice(offset, offset + 2).map(async index => {
                const user = config.users[index]; const started = performance.now();
                await context.run({ cookie: user.cookie, signal: AbortSignal.timeout(60000) }, async () => {
                    const value = await fetchVerifiedAccountDataExport();
                    assert.deepEqual(Object.keys(value.data).sort(), [...ACCOUNT_DATA_EXPORT_COLLECTIONS].sort());
                    const library = value.data.user_library as Array<{content_id: string; user_id?: string}>;
                    for (const row of user.library) assert(library.some(item => item.content_id === row.content_id), 'Seeded record missing from export');
                    assert(library.every(item => !item.user_id || item.user_id === user.accountId), 'Export ownership mismatch');
                    const reflections = value.data.reflections as Array<{user_id: string; id: string}>;
                    assert.equal(reflections.length, user.reflections.length);
                    assert(reflections.every(item => item.user_id === user.accountId && user.reflections.some((expected: {id: string}) => expected.id === item.id)));
                    evidence.push({ operation: 'export', durationMs: performance.now() - started, outcome: 'success', verifiedCollections: Object.keys(value.data).length, records: Object.values(value.data).reduce((sum, rows) => sum + rows.length, 0) });
                });
            }));
            assert(batch.every(result => result.status === 'fulfilled'), 'Export batch failed');
        }
        // Exactly one paid query per invocation, only after separately budgeted real indexing.
        if (config.aiFixture) {
            assert(config.aiFixture.reservedBudgetMicrousd <= 250000 && config.aiFixture.reservedBudgetMicrousd > 0);
            const user = config.users[config.aiFixture.userIndex]; const started = performance.now();
            await context.run({ cookie: user.cookie, signal: AbortSignal.timeout(30000) }, async () => {
                const response = await fetch('/api/chat/notes', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ messages: [{role:'user',content:'What is my lantern pause before replying?'}], scope:{version:1,itemType:'reflection',contentItemId:config.aiFixture.contentItemId} }) });
                assert.equal(response.status, 200, 'Real retrieval request failed');
                const text = await response.text();
                assert(text.includes('stop before replying') && text.includes('listen for the answer'), 'Expected real evidence absent');
                evidence.push({operation:'ai_retrieval',durationMs:performance.now()-started,outcome:'success'});
            });
        }
    } catch {
        failed = true;
    } finally {
        globalThis.fetch = originalFetch;
        await writeFile(output, JSON.stringify({version:1,mode,generatedAt:new Date().toISOString(),requests,failed,evidence,aiExecuted:!!config.aiFixture,limitations:['Export bytes verified and assembled; browser file-save UI is outside this timing.','Single real AI sample is not an AI throughput or percentile proof.']},null,2)+'\n',{mode:0o600,flag:'wx'});
    }
    if(failed) throw new Error('Overlay failed; see sanitized evidence');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
