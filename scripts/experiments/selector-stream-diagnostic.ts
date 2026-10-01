/** One-call synthetic diagnostic; no application or production-data changes. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { streamText, Output } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { buildPersonalEvidenceSelectionRequest, selectPersonalEvidence, PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG } from '../../lib/server/personal-evidence-selector';
import type { SelectorDevelopmentCase } from '../probe-personal-selector';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const fixture = readFileSync('tests/fixtures/retrieval/development/selector-capacity-v1.json', 'utf8');
const original: SelectorDevelopmentCase = JSON.parse(fixture).case;
const ids = new Map(original.candidates.map(c => {
    const h = hash(original.id + ':' + c.id);
    return [c.id, `${c.type}:${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`];
}));
const sample = { ...original, candidates: original.candidates.map(c => ({ ...c, id: ids.get(c.id)! })), expectedIds: original.expectedIds.map(id => ids.get(id)!) };
const prepared = buildPersonalEvidenceSelectionRequest(sample);
const plan = { version: 'selector-stream-diagnostic-v1', model: PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG.model,
    caseId: sample.id, candidateCount: sample.candidates.length, fixtureHash: hash(fixture), requestHash: hash(JSON.stringify(prepared.canonical)),
    maximumCalls: 1, retries: 0, environment: 'local macOS; not Mumbai production',
    limitations: ['One synthetic observation, no controlled production speed comparison.', 'First text delta includes network, queueing, preparation and initial generation.', 'Later deltas include generation and delivery; not isolated inference time.', 'Direct diagnostic uses a one-call cap outside application admission/spend accounting.', 'No personal content; output is validated before acceptance.'] };

async function main() {
    const execute = process.argv.includes('--execute');
    const selftest = process.argv.includes('--self-test');
    if (!execute && !selftest) { console.log(JSON.stringify(plan, null, 2)); return; }
    if (execute && selftest) throw new Error('Choose one mode');
    const output = process.argv.find(x => x.startsWith('--output='))?.slice(9);
    if (!output) throw new Error('Output path required');
    let key = 'fixture';
    if (execute) {
        const env = process.argv.find(x => x.startsWith('--env-file='))?.slice(11);
        if (!env) throw new Error('Explicit environment file required');
        key = parse(readFileSync(env)).ANTHROPIC_API_KEY;
        if (!key || key.includes('[SENSITIVE]')) throw new Error('Provider unavailable');
    }
    const record: Record<string, unknown> = { ...plan, startedAt: new Date().toISOString(), mode: selftest ? 'offline-self-test' : 'paid', outcome: 'incomplete', calls: 0 };
    writeFileSync(output, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 });
    const timing: Record<string, number> = {};
    let calls = 0;
    let start = 0;
    let streamError = false;
    const transport: typeof fetch = async (input, init) => {
        if (++calls > 1) throw new Error('Call cap');
        timing.dispatchMs = performance.now() - start;
        if (selftest) {
            const text = JSON.stringify({ requestedFacets: ['fixture'], assessments: [] });
            const events = [
                { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: plan.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
                { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
                { type: 'content_block_stop', index: 0 },
                { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } },
                { type: 'message_stop' },
            ];
            timing.headersMs = performance.now() - start;
            return new Response(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
        }
        const response = await fetch(input, init);
        timing.headersMs = performance.now() - start;
        record.httpStatus = response.status;
        // Presence only: never retain identifiers or arbitrary header values.
        record.timingHeaderPresent = response.headers.has('server-timing');
        return response;
    };
    try {
        const result = await selectPersonalEvidence({ ...sample, generate: async request => {
            start = performance.now();
            const result = streamText({ model: createAnthropic({ apiKey: key, fetch: transport })(plan.model),
                system: request.system, prompt: request.prompt, output: Output.object({ schema: request.schema }),
                maxOutputTokens: request.maxOutputTokens, maxRetries: 0, abortSignal: request.signal,
                onError: () => { streamError = true; } });
            for await (const part of result.fullStream) {
                if (part.type === 'text-delta' && part.text.length) {
                    timing.firstTextMs ??= performance.now() - start;
                    timing.lastTextMs = performance.now() - start;
                }
                if (part.type === 'error') streamError = true;
            }
            timing.streamEndMs = performance.now() - start;
            const usage = await result.usage;
            record.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens };
            const output = await result.output;
            if (streamError) throw new Error('Stream failed');
            return { output, usage, provider: 'anthropic', model: plan.model };
        } });
        timing.validatedMs = performance.now() - start;
        record.selectedCount = result.ids.length;
        record.expectedCount = sample.expectedIds.length;
        record.expectedMembershipPassed = selftest ? result.ids.length === 0 : result.ids.length === sample.expectedIds.length && sample.expectedIds.every(id => result.ids.includes(id));
        record.outcome = 'complete';
    } catch {
        record.outcome = 'failed'; // Do not persist SDK errors containing requests/responses.
        process.exitCode = 1;
    } finally {
        record.calls = calls;
        record.timingMs = timing;
        writeFileSync(output, JSON.stringify(record, null, 2));
        console.log(JSON.stringify(record, null, 2));
    }
}
main().catch(() => { console.error('Diagnostic setup failed; sensitive details withheld'); process.exitCode = 1; });
