/** Frozen-corpus, three-run Luna evaluation. Offline plan unless explicitly executed. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { readFrozenCorpus, readCapturedSelectorInputs, readDatabaseVectorFixture, selectorOnlyMetrics, safeSelectorOutputFailure, type ProviderSelectorRecord } from '../evaluate-personal-retrieval';
import { selectPersonalEvidence, buildPersonalEvidenceSelectionRequest, personalEvidenceSelectionRequestHash, PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG, type PersonalEvidenceSelectionCandidate } from '../../lib/server/personal-evidence-selector';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const config = { model: 'gpt-6-luna', provider: 'openai', reasoningEffort: 'none', forceReasoning: true, store: false, maxOutputTokens: 1600, maxRetries: 0 } as const;
async function main() {
    const output = process.argv.find(x => x.startsWith('--output='))?.slice(9);
    if (!output) throw new Error('Output path required');
    const corpus = readFrozenCorpus('v2');
    const baselinePath = 'tests/fixtures/retrieval/provider-selections-v2-selector-v4.json';
    const baselineRaw = readFileSync(baselinePath, 'utf8');
    const baseline = JSON.parse(baselineRaw);
    const inputPath = output + '.inputs.json';
    writeFileSync(inputPath, JSON.stringify({ version: 'personal-retrieval-selection-inputs-v1', corpusSha256: baseline.corpusSha256,
        vectorFixtureSha256: baseline.vectorFixtureSha256, modelConfig: baseline.modelConfig, records: baseline.capturedInputs,
        revokedCaseIds: baseline.revokedCaseIds, deterministicEmptyCaseIds: baseline.deterministicEmptyCaseIds }), { flag: 'wx', mode: 0o600 });
    const vectors = readDatabaseVectorFixture(corpus, 'tests/fixtures/retrieval/provider-vectors-v2.json');
    const inputs = readCapturedSelectorInputs(corpus, inputPath, vectors.sha256).artifact;
    const plan = { version: 'luna-frozen-selector-quality-v1', candidate: config, corpusSha256: baseline.corpusSha256,
        baselineSha256: sha(baselineRaw), captureSha256: sha(readFileSync(inputPath, 'utf8')), vectorSha256: vectors.sha256,
        harnessSha256: sha(readFileSync('scripts/experiments/selector-luna-quality.ts', 'utf8')),
        frozenThresholds: corpus.thresholds, cases: inputs.records.length, runs: 3, maxCalls: 168, maxInputTokens: 2_000_000,
        stopRule: 'No retries. Stop on provider/structure/deadline failure or wrong exact-quote target (100% gate cannot recover). Preserve all results.',
        objective: 'Lower cost with unchanged quality gates; retain 20s per-call deadline. Prior latency rejection is not relabeled a speed pass.',
        boundaries: ['Synthetic fixture-only historical production input capture validated against frozen corpus and vectors.',
            'Candidate wire identity binds logical request plus model/provider/reasoning/store settings; historical model responses are not reused.',
            'Selection-only evidence; full database replay, extract attribution and release gates required before production.',
            'Direct evaluation outside application spend ledger, bounded to168 calls; no accounts, DB writes or production requests.'] };
    if (!process.argv.includes('--execute')) { console.log(JSON.stringify(plan, null, 2)); return; }
    const envFile = process.argv.find(x => x.startsWith('--env-file='))?.slice(11);
    if (!envFile) throw new Error('Explicit environment file required');
    const key = parse(readFileSync(envFile)).OPENAI_API_KEY;
    if (!key || key.includes('[SENSITIVE]')) throw new Error('Provider unavailable');
    const model = createOpenAI({ apiKey: key })(config.model);
    const records: ProviderSelectorRecord[] = [];
    const totals = { calls: 0, inputTokens: 0, outputTokens: 0 };
    let failure: string | null = null;
    const startedAt = new Date().toISOString();
    writeFileSync(output, JSON.stringify({ ...plan, startedAt, complete: false, records }), { flag: 'wx', mode: 0o600 });
    const save = () => writeFileSync(output, JSON.stringify({ ...plan, startedAt, updatedAt: new Date().toISOString(), complete: records.length === 168 && !failure,
        totals, failure, records, metrics: selectorOnlyMetrics(corpus, inputs, records) }, null, 2));
    for (let run = 1; run <= 3; run++) for (const input of inputs.records) {
        const parsed = JSON.parse(input.request.prompt) as { question: string; exactQuote: boolean; candidates: PersonalEvidenceSelectionCandidate[] };
        const prepared = buildPersonalEvidenceSelectionRequest(parsed);
        if (personalEvidenceSelectionRequestHash(prepared.canonical, PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG) !== input.inputSha256) throw new Error('Logical request changed');
        const record: ProviderSelectorRecord = { caseId: input.caseId, run, inputSha256: sha(JSON.stringify({ request: prepared.canonical, config })),
            outcome: 'error', output: null, model: config.model, provider: config.provider, durationMs: 0 };
        const start = performance.now();
        try {
            const result = await selectPersonalEvidence({ ...parsed, generate: async request => {
                if (totals.calls >= 168 || totals.inputTokens >= 2_000_000) throw new Error('Budget exhausted');
                totals.calls++;
                try {
                    const generated = await generateText({ model, system: request.system, prompt: request.prompt,
                        output: Output.object({ schema: request.schema }), maxOutputTokens: request.maxOutputTokens,
                        maxRetries: 0, abortSignal: request.signal, providerOptions: { openai: { reasoningEffort: 'none', forceReasoning: true, store: false } } });
                    record.providerOutput = generated.output;
                    record.usage = { inputTokens: generated.usage.inputTokens, outputTokens: generated.usage.outputTokens, totalTokens: generated.usage.totalTokens,
                        inputTokenDetails: generated.usage.inputTokenDetails, outputTokenDetails: generated.usage.outputTokenDetails };
                    totals.inputTokens += generated.usage.inputTokens ?? 0; totals.outputTokens += generated.usage.outputTokens ?? 0;
                    record.model = generated.response.modelId;
                    if (record.model !== config.model) throw new Error('Model mismatch');
                    return { output: generated.output, usage: generated.usage, model: record.model, provider: config.provider };
                } catch (error) {
                    const f = safeSelectorOutputFailure(error);
                    if (f && !record.usage) { record.providerOutput = f.output; record.usage = f.usage;
                        record.rawText = f.text; record.rawTextTruncated = f.rawTextTruncated; record.rawTextBytes = f.rawTextBytes; record.rawTextSha256 = f.rawTextSha256;
                        record.errorCode = 'NO_OBJECT_GENERATED';
                        totals.inputTokens += f.usage.inputTokens ?? 0; totals.outputTokens += f.usage.outputTokens ?? 0; }
                    throw error;
                }
            } });
            record.output = { ids: result.ids }; record.outcome = 'complete';
            const c = corpus.cases.find(c => c.id === input.caseId)!;
            if (c.exactQuote !== null && !(result.ids.length === 1 && c.requiredIds.includes(input.candidateFixtureIds[result.ids[0]]))) failure = 'EXACT_QUOTE_TARGET_FAILED';
        } catch { failure = 'PROVIDER_OR_VALIDATION_FAILURE'; record.errorCode ??= failure; }
        record.durationMs = performance.now() - start; records.push(record); save();
        console.log(JSON.stringify({ run, caseId: input.caseId, calls: totals.calls, outcome: record.outcome, failure }));
        if (failure) { process.exitCode = 1; return; }
    }
    save();
}
main().catch(() => { console.error('Evaluation stopped; error detail withheld to protect credentials'); process.exitCode = 1; });
