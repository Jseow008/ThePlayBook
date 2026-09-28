/** Small real export/AI overlays; uses the production export verifier, no provider mocks. */
import { readFile, writeFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fetchVerifiedAccountDataExport } from '../../../lib/account-data-export-client';
import { ACCOUNT_DATA_EXPORT_COLLECTIONS } from '../../../lib/account-data-snapshot-collections';
import { validateConfig } from './runner.mjs';
import { validateProductionConfig, PRODUCTION_TOKEN } from './production-runner.mjs';
import { installOverlayRuntime, verifyOverlayFixture } from './overlay-runtime';

async function main() {
    const [configPath, output, mode = 'sample', productionToken] = process.argv.slice(2);
    assert(configPath && output && ['sample', 'full'].includes(mode));
    assert.equal((await stat(configPath)).mode & 0o077, 0);
    const parsed = JSON.parse(await readFile(configPath, 'utf8'));
    const config = productionToken === PRODUCTION_TOKEN ? validateProductionConfig(parsed, productionToken) : validateConfig(parsed);
    const runtime = installOverlayRuntime(config.origin, 200, config.vercelProtectionBypass);
    const evidence: { operation: string; durationMs: number; outcome: string; verifiedCollections?: number; records?: number }[] = [];
    let failed = false, aiExecuted = false;
    let failureKind: string | null = null;
    try {
        const indices = mode === 'sample' ? [0] : [0, 44, 45, 46, 47, 48];
        for (let offset = 0; offset < indices.length; offset += 2) {
            const batch = await Promise.allSettled(indices.slice(offset, offset + 2).map(async index => {
                const user = config.users[index]; const started = performance.now();
                const record = { operation: 'export', durationMs: 0, outcome: 'failure', verifiedCollections: 0, records: 0 };
                evidence.push(record);
                try { await runtime.runAs(user.cookie, AbortSignal.timeout(60000), async () => {
                    const value = await fetchVerifiedAccountDataExport();
                    assert.deepEqual(Object.keys(value.data).sort(), [...ACCOUNT_DATA_EXPORT_COLLECTIONS].sort());
                    verifyOverlayFixture(value.data, user);
                    Object.assign(record, { outcome: 'success', verifiedCollections: Object.keys(value.data).length, records: Object.values(value.data).reduce((sum, rows) => sum + rows.length, 0) });
                }); } finally { record.durationMs = performance.now() - started; }
            }));
            const rejected = batch.find(result => result.status === 'rejected');
            if (rejected?.status === 'rejected') throw rejected.reason;
        }
        // Exactly one paid query per invocation, only after separately budgeted real indexing.
        if (config.aiFixture) {
            assert(config.aiFixture.reservedBudgetMicrousd <= 250000 && config.aiFixture.reservedBudgetMicrousd > 0);
            const user = config.users[config.aiFixture.userIndex]; const started = performance.now();
            const record = { operation: 'ai_retrieval', durationMs: 0, outcome: 'failure' };
            evidence.push(record);
            try { await runtime.runAs(user.cookie, AbortSignal.timeout(30000), async () => {
                aiExecuted = true;
                const response = await fetch('/api/chat/notes', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ messages: [{role:'user',content:'What is my lantern pause before replying?'}], scope:{version:1,itemType:'reflection',contentItemId:config.aiFixture.contentItemId} }) });
                assert.equal(response.status, 200, 'Real retrieval request failed');
                const text = await response.text();
                assert(text.includes('stop before replying') && text.includes('listen for the answer'), 'Expected real evidence absent');
                record.outcome = 'success';
            }); } finally { record.durationMs = performance.now() - started; }
        }
    } catch (error) {
        failed = true;
        // Error messages can include payloads; retain only a fixed category.
        failureKind = error instanceof assert.AssertionError ? 'assertion' : error instanceof ReferenceError ? 'runtime_reference' : 'request_or_verification';
    } finally {
        runtime.restore();
        await writeFile(output, JSON.stringify({version:1,mode,generatedAt:new Date().toISOString(),requests:runtime.requests,failed,failureKind,evidence,aiExecuted,limitations:['Export bytes verified and assembled; browser file-save UI is outside this timing.','Single real AI sample is not an AI throughput or percentile proof.']},null,2)+'\n',{mode:0o600,flag:'wx'});
    }
    if(failed) throw new Error('Overlay failed; see sanitized evidence');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
