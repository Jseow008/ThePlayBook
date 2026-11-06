/** Three bounded runs of the unchanged frozen Library cases. No DB, production data or retries. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { readFrozenCorpus, corpusHash } from './evaluate-personal-retrieval';
import { buildPersonalEvidenceSelectionRequest, personalEvidenceSelectionRequestHash, selectPersonalEvidence,
    generatePersonalEvidenceSelection, type CanonicalPersonalEvidenceSelectionRequest, type PersonalEvidenceSelectionGenerator } from '../lib/server/personal-evidence-selector';

type Capture = { caseId: string; inputSha256: string; request: CanonicalPersonalEvidenceSelectionRequest; candidateFixtureIds: Record<string, string> };
async function main() {
    const corpus = readFrozenCorpus('v2');
    const baselinePath = 'tests/fixtures/retrieval/provider-selections-v2-selector-v4.json';
    const baselineText = readFileSync(baselinePath, 'utf8');
    const baseline = JSON.parse(baselineText) as { corpusSha256: string; capturedInputs: Capture[] };
    if (baseline.corpusSha256 !== corpusHash(corpus)) throw new Error('Frozen corpus identity changed');
    const cases = corpus.cases.filter(item => item.request?.surface === 'library');
    const inputs = baseline.capturedInputs.filter(input => cases.some(item => item.id === input.caseId));
    if (cases.length !== 22 || inputs.length !== 22) throw new Error('Unexpected Library case count');
    const work = [1, 2, 3].flatMap(run => inputs.map(input => ({ run, input })));
    if (!process.argv.includes('--execute')) { console.log(JSON.stringify({ cases: cases.length, runs: 3, maximumCalls: 66, concurrency: 2, retries: 0 })); return; }
    const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
    const output = arg('output'), envFile = arg('env-file');
    if (!output || !envFile || existsSync(output)) throw new Error('New output path and env file required');
    const key = parse(readFileSync(envFile)).ANTHROPIC_API_KEY;
    if (!key) throw new Error('Provider key unavailable');
    process.env.ANTHROPIC_API_KEY = key; process.env.AI_PROVIDER = 'anthropic'; process.env.AI_MODEL = 'claude-haiku-4-5-20251001';
    delete process.env.PERSONAL_EVIDENCE_SELECTOR_MODEL;
    const records: Array<Record<string, unknown>> = [];
    let next = 0, calls = 0, halted = false;
    const summary = { version: 'library-followups-frozen-v1', corpusSha256: corpusHash(corpus),
        baselineSha256: createHash('sha256').update(baselineText).digest('hex'), maximumCalls: 66, calls: 0, complete: false,
        boundaries: 'Selection and question output only; historical authorized synthetic candidate capture. No new DB authorization or quote-rendering claim.', records };
    const save = () => { summary.calls = calls; writeFileSync(output, JSON.stringify(summary, null, 2) + '\n'); };
    writeFileSync(output, '{}\n', { flag: 'wx' });
    async function worker() {
        while (!halted && next < work.length) {
            const { run, input } = work[next++];
            const options = JSON.parse(input.request.prompt) as Parameters<typeof buildPersonalEvidenceSelectionRequest>[0];
            if (personalEvidenceSelectionRequestHash(buildPersonalEvidenceSelectionRequest(options).canonical) !== input.inputSha256) throw new Error('Baseline capture drift');
            const updated = { ...options, includeFollowups: true };
            const prepared = buildPersonalEvidenceSelectionRequest(updated);
            let rawOutput: unknown;
            const generate: PersonalEvidenceSelectionGenerator = async request => {
                if (++calls > 66) throw new Error('Call budget exceeded');
                const response = await generatePersonalEvidenceSelection(request); rawOutput = response.output; return response;
            };
            try {
                const result = await selectPersonalEvidence({ ...updated, generate });
                const test = cases.find(item => item.id === input.caseId)!;
                const ids = result.ids.map(id => input.candidateFixtureIds[id]);
                const missing = test.requiredIds.filter(id => !ids.includes(id));
                const extra = ids.filter(id => !test.eligibleIds.includes(id));
                const forbidden = ids.filter(id => test.forbiddenIds?.includes(id));
                const exact = test.exactQuote === null || (ids.length === 1 && test.requiredIds.includes(ids[0]));
                records.push({ caseId: input.caseId, run, outcome: 'complete', class: test.class, inputSha256: personalEvidenceSelectionRequestHash(prepared.canonical),
                    originalInputSha256: input.inputSha256, ids: result.ids, fixtureIds: ids, missing, extra, forbidden, exactQuoteTarget: exact,
                    abstentionRequired: test.abstentionRequired, questions: result.followUpQuestions ?? [], providerOutput: rawOutput, usage: result.usage, durationMs: result.stats.durationMs });
                save(); console.log(JSON.stringify({ caseId: input.caseId, run, calls, missing: missing.length, extra: extra.length, questions: result.followUpQuestions?.length ?? 0 }));
                if (!exact || forbidden.length) halted = true;
            } catch {
                records.push({ caseId: input.caseId, run, outcome: 'error' }); halted = true; save();
            }
        }
    }
    await Promise.all([worker(), worker()]);
    summary.complete = records.length === 66 && !halted; save();
    if (!summary.complete) process.exitCode = 1;
}
void main().catch(() => { console.error('Frozen Library verification stopped; private error details withheld.'); process.exitCode = 1; });
