/** Development-only paired experiment. Never reads production evidence or changes the selector. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { buildPersonalEvidenceSelectionRequest, selectPersonalEvidence, PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG } from '../../lib/server/personal-evidence-selector';
import { generateText, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
const CONCISE = '\n\nKeep the required relevance analysis, but express its output concisely. For requestedFacets and requestedFacet, use a short label retaining every material entity and constraint. For supportSummary, use a short clause naming the specific support or missing relationship; do not restate the passage. For constraintCheck, use a short clause naming the decisive constraint match or failure. Aim for at most 12 words per explanatory field, but retain necessary distinctions even when longer. No generic filler. Do not change verdict rules, omit a required comparison side, or omit a relevant record to shorten the response.';
import type { SelectorDevelopmentCase } from '../probe-personal-selector';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const names = ['selector-precision-v1.json', 'selector-capacity-v1.json'];
const sources = names.map(name => ({ name, raw: readFileSync('tests/fixtures/retrieval/development/' + name, 'utf8') }));
const original: SelectorDevelopmentCase[] = [...JSON.parse(sources[0].raw).cases, JSON.parse(sources[1].raw).case];
const cases = original.map(c => {
    const map = new Map(c.candidates.map(x => {
        const h = sha(c.id + ':' + x.id);
        return [x.id, `${x.type}:${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`];
    }));
    return { ...c, expectedIds: c.expectedIds.map(id => map.get(id)!), candidates: c.candidates.map(x => ({ ...x, id: map.get(x.id)! })) };
});
const tasks = cases.flatMap((c, i) => (i % 2 ? ['concise-reasoning', 'baseline'] : ['baseline', 'concise-reasoning']).map(variant => {
    const candidates = c.candidates;
    const prepared = buildPersonalEvidenceSelectionRequest({ ...c, candidates });
    return { c, variant, candidates, prepared };
}));
const plan = { version: 'selector-concise-reasoning-development-v1', modelConfig: PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG,
    moduleSha256: sha(readFileSync('scripts/experiments/selector-concise-reasoning.ts', 'utf8')),
    fixtures: sources.map(x => ({ name: x.name, sha256: sha(x.raw) })), maximumCalls: 14, retries: 0, earlyStop: 'Stop at first quality failure; no retries', conciseInstruction: CONCISE,
    hypothesis: 'Append concision instructions only; preserve schema, IDs, model, evidence, reasoning fields and relevance rules.',
    decision: 'Reject on any extra/missing expected IDs or structured-output error. Advance only with at least 20% lower total output tokens, lower total input plus output tokens, and lower median provider-call duration; no release without frozen quality gates.',
    limitations: ['Synthetic development only; one pair per case, not percentiles.', 'Deterministic UUID-shaped IDs replace toy IDs in both arms; fields and expected membership unchanged.', 'No production captures; no tuning against held-out corpus.', 'Direct development calls outside application spending scope; hard14-call cap and20s deadline, no retry.', 'Token usage measured; billed dollar cost unavailable.'],
    requests: tasks.map(x => ({ caseId: x.c.id, variant: x.variant, candidateCount: x.candidates.length, inputHash: sha(JSON.stringify(x.variant === 'concise-reasoning' ? { system: (x.prepared.request.system + CONCISE), logical: x.prepared.canonical, format: 'concise-prompt-v1' } : x.prepared.canonical)), promptBytes: Buffer.byteLength(x.prepared.request.prompt), systemBytes: Buffer.byteLength(x.variant === 'concise-reasoning' ? (x.prepared.request.system + CONCISE) : x.prepared.request.system) })) };
async function main() {
    if (!process.argv.includes('--execute')) { console.log(JSON.stringify(plan, null, 2)); return; }
    const file = process.argv.find(a => a.startsWith('--output='))?.slice(9);
    if (!file) throw new Error('Output path required');
    const envFile = process.argv.find(a => a.startsWith('--env-file='))?.slice(11);
    if (!envFile) throw new Error('Explicit env file required');
    const key = parse(readFileSync(envFile)).ANTHROPIC_API_KEY;
    if (!key || key.includes('[SENSITIVE]')) throw new Error('Provider unavailable');
    process.env.ANTHROPIC_API_KEY = key;
    process.env.AI_PROVIDER = 'anthropic'; process.env.AI_MODEL = plan.modelConfig.model;
    const records: Record<string, unknown>[] = [];
    writeFileSync(file, JSON.stringify({ ...plan, outcome: 'incomplete', records }, null, 2), { flag: 'wx', mode: 0o600 });
    let attempted = 0;
    for (const t of tasks) {
        let raw: unknown = null;
        let usage: unknown = null;
        const start = performance.now();
        try {
            if (++attempted > 14) throw new Error('Call cap');
            const result = await selectPersonalEvidence({ ...t.c, candidates: t.candidates, generate: async request => {
                const providerRequest = t.variant === 'concise-reasoning' ? { ...request, system: request.system + CONCISE } : request;
                const result = await generateText({ model: createAnthropic({ apiKey: key })(plan.modelConfig.model),
                    system: providerRequest.system, prompt: providerRequest.prompt, output: Output.object<unknown>({ schema: providerRequest.schema }),
                    maxOutputTokens: request.maxOutputTokens, maxRetries: 0, abortSignal: request.signal });
                raw = result.output; usage = result.usage;
                return { output: request.schema.parse(result.output), usage: result.usage, provider: 'anthropic', model: result.response.modelId };
            } });
            const ids = result.ids;
            const pass = ids.length === t.c.expectedIds.length && t.c.expectedIds.every(id => ids.includes(id));
            records.push({ caseId: t.c.id, variant: t.variant, passed: pass, durationMs: performance.now() - start, usage: result.usage, selectedIds: ids, expectedIds: t.c.expectedIds, rawSyntheticOutput: raw });
        } catch (error) {
            const errorCode = error instanceof Error ? error.name : 'unknown';
            records.push({ caseId: t.c.id, variant: t.variant, passed: false, durationMs: performance.now() - start, error: 'experiment_failed', errorCode, usage, rawSyntheticOutput: raw });
            writeFileSync(file, JSON.stringify({ ...plan, outcome: 'stopped', attempted, records }, null, 2));
            console.log(JSON.stringify({ stopped: true, attempted })); return;
        }
        writeFileSync(file, JSON.stringify({ ...plan, outcome: records.at(-1)!.passed === false ? 'rejected' : records.length === 14 ? 'complete' : 'incomplete', attempted, records }, null, 2));
        console.log(JSON.stringify({ caseId: t.c.id, variant: t.variant, passed: records.at(-1)!.passed, durationMs: Math.round(performance.now() - start) }));
        if (records.at(-1)!.passed === false) return;
    }
}
main().catch(() => { console.error('Experiment setup failed; details withheld to protect provider configuration'); process.exitCode = 1; });
