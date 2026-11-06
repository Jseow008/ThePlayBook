/** Bounded synthetic-only comparison; no database or customer data. Default is a plan. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { buildPersonalEvidenceSelectionRequest, generatePersonalEvidenceSelection, personalEvidenceSelectionRequestHash,
    selectPersonalEvidence, type PersonalEvidenceSelectionGenerator } from '../lib/server/personal-evidence-selector';
import { readSelectorDevelopmentFixture } from './probe-personal-selector';

async function main() {
    const cases = process.argv.includes('--voice-check') ? [
        { id: 'walking-cue', question: 'What did I save about making a regular walk easier to start?', exactQuote: false, expectedIds: ['walk'],
            candidates: [{ id: 'walk', type: 'highlight' as const, title: 'Synthetic walking note', fields: [{ name: 'highlightedText' as const, text: 'Put walking shoes next to the front door before bed so a morning walk takes less preparation.' }] }] },
        { id: 'weekly-review', question: 'What did I decide to change about my weekly review?', exactQuote: false, expectedIds: ['review'],
            candidates: [{ id: 'review', type: 'reflection' as const, title: 'Synthetic review note', fields: [{ name: 'reflectionText' as const, text: 'I will review my notes each Sunday after breakfast and choose a single idea to try the following week.' }] }] },
    ] : readSelectorDevelopmentFixture().cases;
    const arg = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
    if (!process.argv.includes('--execute')) {
        console.log(JSON.stringify({ cases: cases.map(item => item.id), maximumCalls: 12, retries: 0, maximumOutputTokens: 1600 })); return;
    }
    const output = arg('output'), envFile = arg('env-file');
    if (!output || !envFile || existsSync(resolve(output))) throw new Error('New output path and explicit env file required');
    const key = parse(readFileSync(envFile)).ANTHROPIC_API_KEY;
    if (!key) throw new Error('Anthropic key unavailable');
    process.env.ANTHROPIC_API_KEY = key; process.env.AI_PROVIDER = 'anthropic'; process.env.AI_MODEL = 'claude-haiku-4-5-20251001';
    delete process.env.PERSONAL_EVIDENCE_SELECTOR_MODEL;
    const hybridOnly = process.argv.includes('--hybrid-only');
    let providerText: unknown;
    const providerFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
        const response = await providerFetch(...args);
        if (String(args[0]).startsWith('https://api.anthropic.com/v1/messages')) {
            const body = await response.clone().json() as { content?: Array<{ type: string; text?: string }> };
            providerText = body.content?.filter(part => part.type === 'text').map(part => part.text).join('');
        }
        return response;
    };
    const records: unknown[] = [];
    const save = () => writeFileSync(resolve(output), JSON.stringify({ version: 'library-followups-development-v1', maximumCalls: hybridOnly ? 6 : 12,
        provider: 'anthropic', model: process.env.AI_MODEL, records }, null, 2) + '\n');
    writeFileSync(resolve(output), '{}\n', { flag: 'wx' });
    for (const testCase of cases) {
        for (const includeFollowups of hybridOnly ? [true] : [false, true]) {
            const options = { ...testCase, includeFollowups };
            const prepared = buildPersonalEvidenceSelectionRequest(options);
            let calls = 0, rawOutput: unknown;
            const generate: PersonalEvidenceSelectionGenerator = async request => {
                if (++calls > 1) throw new Error('No retries');
                const response = await generatePersonalEvidenceSelection(request);
                rawOutput = response.output; return response;
            };
            try {
                const result = await selectPersonalEvidence({ ...options, generate });
                const passed = result.ids.length === testCase.expectedIds.length && result.ids.every(id => testCase.expectedIds.includes(id));
                records.push({ caseId: testCase.id, includeFollowups, inputSha256: personalEvidenceSelectionRequestHash(prepared.canonical),
                    passed, calls, ids: result.ids, expectedIds: testCase.expectedIds, questions: result.followUpQuestions ?? [], rawOutput,
                    usage: result.usage, durationMs: result.stats.durationMs, rawSyntheticProviderText: providerText }); save();
                console.log(JSON.stringify({ caseId: testCase.id, includeFollowups, passed, calls, questions: result.followUpQuestions?.length ?? 0 }));
                if (!passed) process.exitCode = 1;
            } catch (error) {
                records.push({ caseId: testCase.id, includeFollowups, calls, error: error instanceof Error ? error.name : 'UnknownError' }); save();
                console.log(JSON.stringify({ caseId: testCase.id, includeFollowups, outcome: 'error' })); process.exitCode = 1; return;
            }
        }
    }
}
void main().catch(() => { console.error('Synthetic probe stopped; private error details withheld.'); process.exitCode = 1; });
