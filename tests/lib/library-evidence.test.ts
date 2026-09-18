import { structuralSelectionOutput } from "@/tests/fixtures/retrieval/selection-output";
import { describe, expect, it, vi } from 'vitest';
import { composeLibraryEvidence, selectLibraryEvidence, loadLibrarySourceEvidence, type LibrarySourceEvidence } from '@/lib/server/library-evidence';
import type { rankPersonalEvidence } from '@/lib/server/personal-evidence-ranking';

const personal = (items: Awaited<ReturnType<typeof rankPersonalEvidence>>['items'] = []) => ({ items }) as Awaited<ReturnType<typeof rankPersonalEvidence>>;
const source = (id: string, text: string, score = .9): LibrarySourceEvidence => ({
    type: 'source_segment', evidenceId: `source_segment:${id}`, id, contentItemId: 'content',
    title: 'Current editorial source', text, fingerprint: 'revision', score,
    span: { text, start: 0, end: text.length },
});

describe('library evidence delivery budget', () => {
    it('keeps a selected late semantic span, never replacing it with the passage prefix', () => {
        const item = source('a', 'Irrelevant beginning. '.repeat(100));
        item.span = { text: 'The relevant ending.', start: item.text.length, end: item.text.length + 20 };
        const result = composeLibraryEvidence(personal(), [item]);
        expect(result.contextText).toContain('The relevant ending.');
        expect(result.contextText).not.toContain('Irrelevant beginning.');
        expect(result.evidenceIds).toEqual(['source_segment:a']);
    });
    it('omits whole oversized blocks and reports only evidence actually supplied', () => {
        const result = composeLibraryEvidence(personal(), [source('large', '🚀'.repeat(2000)), source('fits', 'A complete smaller passage.', .8)]);
        expect(result.evidenceIds).toEqual(['source_segment:fits']);
        expect(result.contextText).not.toContain('🚀');
        expect(Buffer.byteLength(result.contextText)).toBeLessThanOrEqual(4000);
    });
    it('keeps the attached disagreement with the selected highlight', () => {
        const item = {
            evidence: { type: 'highlight', evidenceId: 'highlight:a', source: { title: 'Source' }, sourceStatus: 'available' }, score: .9,
            spans: [{ field: 'highlightedText', start: 0, end: 18, text: 'Always work alone.' }, { field: 'noteBody', start: 0, end: 37, text: 'I disagree: collaboration works better.' }],
        } as Awaited<ReturnType<typeof rankPersonalEvidence>>['items'][number];
        const result = composeLibraryEvidence(personal([item]), []);
        expect(result.contextText).toContain('highlightedText');
        expect(result.contextText).toContain('noteBody');
        expect(result.contextText).toContain('I disagree: collaboration works better.');
    });
    it('shares the eight-item limit across evidence types', () => {
        const result = composeLibraryEvidence(personal(), Array.from({ length: 12 }, (_, i) => source(String(i), 'Small passage.')));
        expect(result.evidenceIds).toHaveLength(8);
    });
});

describe('live editorial source materialization', () => {
    function client(rows: unknown[], error: unknown = null) {
        const query = { select: vi.fn(), in: vi.fn(), is: vi.fn(), abortSignal: vi.fn() };
        query.select.mockReturnValue(query); query.in.mockReturnValue(query); query.is.mockReturnValue(query);
        query.abortSignal.mockResolvedValue({ data: rows, error });
        const rpc = vi.fn(() => ({ abortSignal: vi.fn().mockResolvedValue({ data: [{ segment_id: 'segment', content_item_id: 'content', similarity: .9 }], error: null }) }));
        return { supabase: { rpc, from: vi.fn(() => query) } as unknown as Parameters<typeof loadLibrarySourceEvidence>[0]['supabase'], query };
    }
    it('requires the live source association and currently published parent', async () => {
        const valid = { id: 'segment', item_id: 'content', markdown_body: 'Current full passage', content_item: { id: 'content', title: 'Source', status: 'verified', deleted_at: null } };
        for (const row of [valid, { ...valid, item_id: 'wrong' }, { ...valid, content_item: { ...valid.content_item, status: 'draft' } }, { ...valid, content_item: null }]) {
            const testClient = client([row]);
            const result = await loadLibrarySourceEvidence({ ...testClient, userId: 'user', queryEmbedding: [1], signal: new AbortController().signal });
            expect(result).toHaveLength(row === valid ? 1 : 0);
            expect(testClient.query.is).toHaveBeenCalledWith('deleted_at', null);
        }
    });
    it('fails explicitly instead of turning a database failure into no results', async () => {
        await expect(loadLibrarySourceEvidence({ ...client([], { message: 'offline' }), userId: 'user', queryEmbedding: [1], signal: new AbortController().signal })).rejects.toThrow('Source retrieval failed');
    });
});


describe('joint semantic evidence selection', () => {
    const emptyPersonal = () => ({ ...personal(), candidateCount: 0, quoteField: undefined, selection: null }) as Parameters<typeof selectLibraryEvidence>[0]['personal'];
    it('selects a lower-vector-ranked relevant source and expands its exact stored text', async () => {
        const correct = source('correct', 'Complete stored source, including its ending.', .6);
        correct.span = { text: 'Complete stored source', start: 0, end: 22 };
        const generate = vi.fn(async () => ({ output: structuralSelectionOutput(['source_segment:correct']) }));
        const result = await selectLibraryEvidence({ personal: emptyPersonal(), sources: [source('glossary', 'A shared word definition.', .99), correct],
            question: 'Quote the passage about the stored source exactly.', signal: new AbortController().signal, selectionGenerator: generate });
        expect(result.exactQuote).toBe(correct.text);
        expect(result.sources.map(item => item.id)).toEqual(['correct']);
        expect(generate).toHaveBeenCalledTimes(1);
    });
    it('keeps provider selection order instead of resorting by vector similarity', async () => {
        const result = await selectLibraryEvidence({ personal: emptyPersonal(), sources: [source('high', 'Related detail.', .99), source('low', 'Core answer.', .6)],
            question: 'Explain the answer.', signal: new AbortController().signal,
            selectionGenerator: async () => ({ output: structuralSelectionOutput(['source_segment:low', 'source_segment:high']) }) });
        expect(result.evidenceIds).toEqual(['source_segment:low', 'source_segment:high']);
    });
    it('does not replace a semantic abstention with vector matches', async () => {
        const result = await selectLibraryEvidence({ personal: emptyPersonal(), sources: [source('unrelated', 'A generic passage.')],
            question: 'What is my private booking reference?', signal: new AbortController().signal,
            selectionGenerator: async () => ({ output: structuralSelectionOutput([]) }) });
        expect(result.evidenceIds).toEqual([]);
        expect(result.exactQuote).toBeNull();
        expect(result.contextText).toBe('');
    });
    it('does not turn a follow-up summary into an editorial quotation because history mentioned quote', async () => {
        const semanticQuestion = 'Earlier user request: Quote the source passage about attention. Current request: Summarize that idea.';
        const result = await selectLibraryEvidence({ personal: emptyPersonal(), sources: [source('current', 'Current relevant passage.')],
            question: 'Summarize that idea.', semanticQuestion, signal: new AbortController().signal,
            selectionGenerator: async (request) => {
                expect(JSON.parse(request.prompt)).toMatchObject({ question: semanticQuestion, exactQuote: false });
                return { output: structuralSelectionOutput(['source_segment:current']) };
            },
        });
        expect(result.exactQuote).toBeNull();
        expect(result.evidenceIds).toEqual(['source_segment:current']);
    });
});
