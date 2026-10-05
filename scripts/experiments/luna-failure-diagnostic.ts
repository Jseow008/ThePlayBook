/** One authorized synthetic call, then optional offline replay of its captured response. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output, NoObjectGeneratedError } from 'ai';
import { readFrozenCorpus, readCapturedSelectorInputs, readDatabaseVectorFixture } from '../evaluate-personal-retrieval';
import { selectPersonalEvidence, buildPersonalEvidenceSelectionRequest, personalEvidenceSelectionRequestHash, PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG, type PersonalEvidenceSelectionCandidate } from '../../lib/server/personal-evidence-selector';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const config = { model: 'gpt-6-luna', provider: 'openai', reasoningEffort: 'none', forceReasoning: true, store: false, maxOutputTokens: 1600, maxRetries: 0 } as const;
async function main() {
    const arg = (name: string) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3);
    const output = arg('output'); if (!output) throw new Error('Output required');
    const replay = arg('replay');
    const corpus = readFrozenCorpus('v2');
    const inputs = readCapturedSelectorInputs(corpus, arg('capture') ?? '/private/tmp/netflux-luna-quality-v1.json.inputs.json', readDatabaseVectorFixture(corpus, 'tests/fixtures/retrieval/provider-vectors-v2.json').sha256).artifact;
    const input = inputs.records.find(x => x.caseId === 'comparison-larch')!;
    const parsed = JSON.parse(input.request.prompt) as { question: string; exactQuote: boolean; candidates: PersonalEvidenceSelectionCandidate[] };
    const prepared = buildPersonalEvidenceSelectionRequest(parsed);
    if (personalEvidenceSelectionRequestHash(prepared.canonical, PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG) !== input.inputSha256) throw new Error('Logical input mismatch');
    const candidateHash = sha(JSON.stringify({ request: prepared.canonical, config }));
    const original = JSON.parse(readFileSync(arg('failed-evaluation') ?? '/private/tmp/netflux-luna-quality-v1.json', 'utf8')).records.at(-1);
    if (candidateHash !== original.inputSha256) throw new Error('Candidate mismatch');
    const record: Record<string, unknown> = { version: 'luna-failure-diagnostic-v1', config, candidateHash, caseId: input.caseId,
        startedAt: new Date().toISOString(), mode: replay ? 'offline-replay' : 'single-paid-diagnostic', maxCalls: 1,
        evidencePurpose: 'Diagnosis only; never replaces failed frozen evaluation', outcome: 'not-executed' };
    if (!replay && !process.argv.includes('--execute')) { console.log(JSON.stringify(record)); return; }
    const envFile = arg('env-file');
    const key = replay ? 'offline' : envFile ? parse(readFileSync(envFile)).OPENAI_API_KEY : null;
    if (!key) throw new Error('Explicit credentials required');
    writeFileSync(output, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
    let calls = 0;
    const transport: typeof fetch = async (url, init) => {
        if (++calls > 1) throw new Error('No retries');
        const wire = JSON.parse(String(init?.body));
        if (wire.model !== config.model || wire.reasoning?.effort !== 'none' || wire.store !== false || wire.text?.format?.type !== 'json_schema') throw new Error('Wire mismatch');
        record.wireHash = sha(String(init?.body));
        let response: Response;
        if (replay) {
            const old = JSON.parse(readFileSync(replay, 'utf8'));
            if (old.candidateHash !== candidateHash || old.wireHash !== record.wireHash) throw new Error('Replay input mismatch');
            response = new Response(old.providerBody, { status: old.httpStatus, headers: { 'content-type': 'application/json' } });
        } else response = await fetch(url, init);
        record.httpStatus = response.status;
        // Validated synthetic fixture only. Never retain request headers or credentials.
        const text = await response.clone().text();
        if (Buffer.byteLength(text) > 256 * 1024) throw new Error('Diagnostic response bound');
        record.providerBody = text;
        writeFileSync(output, JSON.stringify(record, null, 2));
        return response;
    };
    const started = performance.now();
    try {
        const result = await selectPersonalEvidence({ ...parsed, generate: async request => {
            try {
                const generated = await generateText({ model: createOpenAI({ apiKey: key, fetch: transport })(config.model),
                    system: request.system, prompt: request.prompt, output: Output.object({ schema: request.schema }),
                    maxOutputTokens: request.maxOutputTokens, maxRetries: 0, abortSignal: request.signal,
                    providerOptions: { openai: { reasoningEffort: 'none', forceReasoning: true, store: false } } });
                record.finishReason = generated.finishReason; record.usage = generated.usage; record.parsedOutput = generated.output;
                return { output: generated.output, usage: generated.usage, provider: config.provider, model: generated.response.modelId };
            } catch (error) {
                record.sdkError = error instanceof Error ? error.name : 'unknown';
                if (NoObjectGeneratedError.isInstance(error)) {
                    record.failedText = error.text; record.usage = error.usage; record.finishReason = error.finishReason;
                    record.causeType = error.cause instanceof Error ? error.cause.name : typeof error.cause;
                }
                throw error;
            }
        } });
        record.outcome = 'complete'; record.selectedFixtureIds = result.ids.map(id => input.candidateFixtureIds[id]);
    } catch { record.outcome = 'failed'; }
    record.durationMs = performance.now() - started; record.networkCalls = replay ? 0 : calls;
    writeFileSync(output, JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ outcome: record.outcome, networkCalls: record.networkCalls, sdkError: record.sdkError, finishReason: record.finishReason, causeType: record.causeType, durationMs: record.durationMs }));
}
main().catch(() => { console.error('Diagnostic setup failure; sensitive details withheld'); process.exitCode = 1; });
