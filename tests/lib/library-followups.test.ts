import { describe, expect, it } from 'vitest';
import { Output, streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { getLibraryFollowups, normalizeLibraryFollowups } from '@/lib/library-followups';
import { LibraryAnswerOutputSchema, libraryAnswerStreamResponse, parseLibraryAnswer, readCompleteLeadingField } from '@/lib/server/library-followup-output';

const question = 'What else have I saved about making habits easier to start?';
const answer = 'A complete answer with "quotes", an emoji 🌱 and\nnewlines.';
const controller = new AbortController();
async function events(response: Response) {
    return (await response.text()).split('\n').filter(line => line.startsWith('data: {'))
        .map(line => JSON.parse(line.slice(6)) as { type: string; delta?: string; data?: unknown; errorText?: string });
}
const textOf = (chunks: Awaited<ReturnType<typeof events>>) => chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.delta).join('');

describe('Library optional follow-up boundary', () => {
    it.each([true, false])('retains only a structurally complete answer after a provider disconnect (complete=%s)', async complete => {
        const raw = complete ? `{"answer":${JSON.stringify(answer)},"followUpQuestions":[` : '{"answer":"Unfinished answer';
        const model = new MockLanguageModelV3({ doStream: async () => ({ stream: new ReadableStream({ start(out) {
            out.enqueue({ type: 'stream-start', warnings: [] }); out.enqueue({ type: 'text-start', id: 't' });
            out.enqueue({ type: 'text-delta', id: 't', delta: raw });
            out.enqueue({ type: 'error', error: new Error('PRIVATE provider failure') }); out.close();
        } }) }) });
        const result = streamText({ model, prompt: 'Synthetic question', maxRetries: 0, output: Output.object({ schema: LibraryAnswerOutputSchema }) });
        const chunks = await events(libraryAnswerStreamResponse(result, { signal: controller.signal, onError: () => 'Safe error' }));
        expect(JSON.stringify(chunks)).not.toContain('PRIVATE');
        if (complete) {
            expect(textOf(chunks)).toBe(answer); expect(chunks.at(-1)?.type).toBe('finish');
            expect(chunks.findLast(chunk => chunk.type === 'data-library-followups')?.data).toEqual({ status: 'ready', questions: [] });
        } else expect(chunks.some(chunk => chunk.type === 'finish')).toBe(false);
        expect(model.doStreamCalls).toHaveLength(1);
    });
    it.each([['valid', [question]], ['invalid', 42]])('decodes %s output through the real SDK streaming boundary', async (_kind, followUpQuestions) => {
        const text = JSON.stringify({ answer, followUpQuestions });
        const model = new MockLanguageModelV3({ doStream: async () => ({ stream: new ReadableStream({ start(out) {
            out.enqueue({ type: 'stream-start', warnings: [] }); out.enqueue({ type: 'text-start', id: 't' });
            out.enqueue({ type: 'text-delta', id: 't', delta: text.slice(0, 25) });
            out.enqueue({ type: 'text-delta', id: 't', delta: text.slice(25) }); out.enqueue({ type: 'text-end', id: 't' });
            out.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: {
                inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 },
            } }); out.close();
        } }) }) });
        const result = streamText({ model, prompt: 'Synthetic question', maxRetries: 0, output: Output.object({ schema: LibraryAnswerOutputSchema }) });
        const chunks = await events(libraryAnswerStreamResponse(result, { signal: controller.signal, onError: () => 'Safe error' }));
        expect(textOf(chunks)).toBe(answer); expect(chunks.at(-1)?.type).toBe('finish');
        expect(chunks.findLast(chunk => chunk.type === 'data-library-followups')?.data).toEqual({ status: 'ready', questions: Array.isArray(followUpQuestions) ? followUpQuestions : [] });
        expect(model.doStreamCalls).toHaveLength(1);
    });
    it('bounds and deduplicates plain questions without rejecting the answer', () => {
        expect(normalizeLibraryFollowups([question, question.toUpperCase(), 'ignored third'])).toEqual([question]);
        for (const invalid of [undefined, 'wrong shape', [null, 'short'], ['<script>send</script>'], ['Visit https://example.com'], ['a'.repeat(241)], ['Question\nwith lines?'], ['What did you do to protect focus time?'], ['What practical step should I take next?']]) expect(normalizeLibraryFollowups(invalid)).toEqual([]);
        expect(getLibraryFollowups({ parts: [{ type: 'text' }] })).toBeNull();
        expect(getLibraryFollowups({ parts: [{ type: 'data-library-followups', data: { questions: 'wrong' } }] })).toEqual({ status: 'ready', questions: [] });
    });
    it('recovers only complete leading values, including escaped strings and nested selection', () => {
        const selection = { requestedFacets: ['Brace } and "quote"'], assessments: [{ id: 'a' }] };
        expect(readCompleteLeadingField(`{"selection":${JSON.stringify(selection)},"followUpQuestions":["unfinished`, 'selection')).toEqual(selection);
        expect(readCompleteLeadingField(`{"answer":${JSON.stringify(answer)},"followUpQuestions":["unfinished`, 'answer')).toBe(answer);
        for (const invalid of ['{"answer":"unfinished', '{"answer":"done"junk', '{"selection":{"assessments":[', '{"other":true,"answer":"later"}']) expect(readCompleteLeadingField(invalid, invalid.includes('selection') ? 'selection' : 'answer')).toBeUndefined();
    });
    it('retains a complete answer when questions are missing, invalid or truncated', () => {
        for (const followUpQuestions of [undefined, null, 42, ['short'], [question, null]]) {
            expect(parseLibraryAnswer(JSON.stringify({ answer, followUpQuestions }), 'stop').answer).toBe(answer);
        }
        expect(parseLibraryAnswer(`{"answer":${JSON.stringify(answer)},"followUpQuestions":["unfinished`, 'length')).toEqual({ answer, questions: [] });
        expect(() => parseLibraryAnswer('{"answer":"incomplete', 'length')).toThrow();
        expect(() => parseLibraryAnswer(JSON.stringify({ answer, followUpQuestions: [question] }), 'error')).toThrow();
    });
    it('streams decoded answer before questions complete and never emits JSON as answer text', async () => {
        let release!: () => void;
        const paused = new Promise<void>(resolve => { release = resolve; });
        const response = libraryAnswerStreamResponse({
            partialOutputStream: (async function* () { yield { answer: 'A complete ' }; await paused; yield { answer }; })(),
            text: Promise.resolve(JSON.stringify({ answer, followUpQuestions: [question] })), finishReason: Promise.resolve('stop'),
        }, { signal: controller.signal, onError: () => 'Safe error' });
        const reader = response.body!.getReader();
        let received = '';
        while (!received.includes('A complete ')) { const chunk = await reader.read(); received += new TextDecoder().decode(chunk.value); }
        expect(received).not.toContain(question);
        release();
        for (;;) { const chunk = await reader.read(); if (chunk.done) break; received += new TextDecoder().decode(chunk.value); }
        const chunks = await events(new Response(received));
        expect(textOf(chunks)).toBe(answer);
        expect(chunks.findLast(chunk => chunk.type === 'data-library-followups')?.data).toEqual({ status: 'ready', questions: [question] });
        expect(chunks.findIndex(chunk => chunk.type === 'text-end')).toBeLessThan(chunks.findLastIndex(chunk => chunk.type === 'data-library-followups'));
        expect(chunks.some(chunk => chunk.type === 'error')).toBe(false);
    });
    it.each(['malformed', 'truncated'])('does not fail a complete answer for a %s question suffix', async kind => {
        const text = kind === 'malformed' ? JSON.stringify({ answer, followUpQuestions: 12 }) : `{"answer":${JSON.stringify(answer)},"followUpQuestions":[`;
        const chunks = await events(libraryAnswerStreamResponse({ partialOutputStream: (async function* () { yield { answer }; })(),
            text: Promise.resolve(text), finishReason: Promise.resolve(kind === 'truncated' ? 'length' : 'stop'),
        }, { signal: controller.signal, onError: () => 'Safe error' }));
        expect(textOf(chunks)).toBe(answer);
        expect(chunks.at(-1)?.type).toBe('finish');
        expect(chunks.findLast(chunk => chunk.type === 'data-library-followups')?.data).toEqual({ status: 'ready', questions: [] });
    });
    it('keeps interrupted answers retryable and hides private transport error text', async () => {
        const chunks = await events(libraryAnswerStreamResponse({ partialOutputStream: (async function* () { yield { answer: 'Partial' }; throw new Error('PRIVATE'); })(),
            text: Promise.resolve(''), finishReason: Promise.resolve('error'),
        }, { signal: controller.signal, onError: () => 'Safe error' }));
        expect(chunks.some(chunk => chunk.type === 'finish')).toBe(false);
        expect(JSON.stringify(chunks)).not.toContain('PRIVATE');
        expect(chunks.at(-1)?.errorText).toBe('Safe error');
    });
});
