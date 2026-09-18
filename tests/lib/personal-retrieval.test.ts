import { structuralSelectionOutput } from "@/tests/fixtures/retrieval/selection-output";
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSelectedPersonalEvidence, recheckPersonalEvidenceCandidates } from '@/lib/server/personal-evidence-candidates';
import { retrievePersonalEvidence, PersonalEvidenceIndexNotReady } from '@/lib/server/personal-retrieval';
import type { PersonalEvidenceCandidate } from '@/lib/personal-evidence';
vi.mock('@/lib/server/personal-evidence-candidates', () => ({ loadSelectedPersonalEvidence: vi.fn(), recheckPersonalEvidenceCandidates: vi.fn() }));
const scope = { version: 1, itemType: 'all' } as const;
const id = '11111111-1111-4111-8111-111111111111';
const revision = '22222222-2222-4222-8222-222222222222';
const otherRevision = '33333333-3333-4333-8333-333333333333';
const getUser = vi.fn();
const rpc = vi.fn();
const abortSignal = vi.fn();
const supabase = { auth: { getUser }, rpc } as unknown as Parameters<typeof retrievePersonalEvidence>[0]['supabase'];
const ready = (matches: unknown[] = []) => ({ status: 'ready', total_records: matches.length ? 1 : 0, ready_records: matches.length ? 1 : 0, pending_records: 0, failed_records: 0, matches });
const match = (field = 'reflectionText') => ({ evidence_type: 'reflection', evidence_id: id, revision, field, chunk_index: 0, start_offset: 0, end_offset: 14, similarity: .9 });
const reflection = { type: 'reflection', evidenceId: `reflection:${id}`, id, userId: 'owner', prompt: 'My prompt', reflectionText: 'Stored answer.', fingerprint: 'current', source: null, sourceStatus: 'unavailable' } as PersonalEvidenceCandidate;
const selectionGenerator = vi.fn(async () => ({ output: structuralSelectionOutput([`reflection:${id}`]) }));
const request = (question: string) => ({ selectionGenerator, supabase, userId: 'owner', scope, question, signal: new AbortController().signal, queryEmbedding: Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0) });

beforeEach(() => {
    vi.clearAllMocks();
    selectionGenerator.mockImplementation(async () => ({ output: structuralSelectionOutput([`reflection:${id}`]) }));
    vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([]);
    vi.mocked(recheckPersonalEvidenceCandidates).mockResolvedValue([]);
    rpc.mockReturnValue({ abortSignal });
    abortSignal.mockResolvedValue({ data: ready(), error: null });
    getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
});

describe('indexed personal retrieval orchestration', () => {
    it('queries the complete index scope and materializes only server-ranked records', async () => {
        abortSignal.mockResolvedValue({ data: ready([match()]), error: null });
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([reflection]);
        const result = await retrievePersonalEvidence(request('What patterns appear?'));
        expect(rpc).toHaveBeenCalledWith('match_personal_evidence', expect.objectContaining({ p_scope: scope, p_match_count: 32 }));
        expect(loadSelectedPersonalEvidence).toHaveBeenCalledWith(expect.objectContaining({ selected: [{ type: 'reflection', id }] }));
        expect(result.contextText).toContain('Stored answer.');
        expect(result.stats.embeddedInputs).toBe(0);
        expect(recheckPersonalEvidenceCandidates).toHaveBeenCalledWith(expect.objectContaining({ candidates: [reflection] }));
        expect(rpc).toHaveBeenCalledTimes(2);
    });
    it.each(['pending', 'failed'] as const)('refuses %s indexing instead of returning incomplete or false-empty results', async (status) => {
        abortSignal.mockResolvedValue({ data: { ...ready(), status, total_records: 1, [status === 'pending' ? 'pending_records' : 'failed_records']: 1 }, error: null });
        await expect(retrievePersonalEvidence(request('Question'))).rejects.toBeInstanceOf(PersonalEvidenceIndexNotReady);
        expect(loadSelectedPersonalEvidence).not.toHaveBeenCalled();
    });
    it('rejects edits while materializing a selected indexed record', async () => {
        abortSignal.mockResolvedValueOnce({ data: ready([match()]), error: null }).mockResolvedValueOnce({ data: ready([{ ...match(), revision: otherRevision }]), error: null });
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([reflection]);
        await expect(retrievePersonalEvidence(request('Question'))).rejects.toThrow('Personal index changed');
    });
    it('rejects live deletion and revoked or replaced authentication', async () => {
        vi.mocked(recheckPersonalEvidenceCandidates).mockRejectedValueOnce(new Error('deleted during ranking'));
        await expect(retrievePersonalEvidence(request('Question'))).rejects.toThrow('deleted during ranking');
        for (const user of [null, { id: 'other-account' }]) {
            getUser.mockResolvedValue({ data: { user }, error: null });
            await expect(retrievePersonalEvidence(request('Question'))).rejects.toThrow('RETRIEVAL_AUTH_CHANGED');
        }
    });
    it('quotes the complete stored reflection field directly under a reflection scope', async () => {
        abortSignal.mockResolvedValue({ data: ready([match()]), error: null });
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([reflection]);
        const result = await retrievePersonalEvidence({ ...request('Quote exactly the stored passage.'), scope: { version: 1, itemType: 'reflection' } });
        expect(rpc).toHaveBeenCalledWith('match_personal_evidence', expect.objectContaining({ p_field: 'reflectionText', p_match_count: 32 }));
        expect(result.items[0].exactQuote).toBe('Stored answer.');
    });
    it('does not interpret an editorial quotation as a personal highlight request', async () => {
        await retrievePersonalEvidence({ ...request('Quote the source passage'), implicitHighlightQuote: false });
        expect(rpc).toHaveBeenCalledWith('match_personal_evidence', expect.objectContaining({ p_field: undefined }));
    });
    it('uses contextual semantics for selection while prior quote wording cannot enable quote mode', async () => {
        abortSignal.mockResolvedValue({ data: ready([match()]), error: null });
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([reflection]);
        const semanticQuestion = 'Earlier user request: Quote my reflection about attention exactly. Current request: Summarize that idea.';
        const result = await retrievePersonalEvidence({ ...request('Summarize that idea.'), semanticQuestion,
            selectionGenerator: async (selectionRequest) => {
                expect(JSON.parse(selectionRequest.prompt)).toMatchObject({ question: semanticQuestion, exactQuote: false });
                return { output: structuralSelectionOutput([`reflection:${id}`]) };
            },
        });
        expect(result.quoteField).toBeUndefined();
        expect(result.items[0].exactQuote).toBeNull();
        expect(rpc).toHaveBeenCalledWith('match_personal_evidence', expect.objectContaining({ p_field: undefined }));
    });
    it('propagates cancellation and does not deliver after final authentication', async () => {
        const controller = new AbortController();
        getUser.mockImplementation(async () => { controller.abort(); return { data: { user: { id: 'owner' } }, error: null }; });
        await expect(retrievePersonalEvidence({ ...request('Question'), signal: controller.signal })).rejects.toThrow();
        expect(abortSignal.mock.lastCall?.[0].aborted).toBe(true);
    });
    it('rejects malformed vectors and out-of-range indexed spans', async () => {
        await expect(retrievePersonalEvidence({ ...request('Question'), queryEmbedding: [1] })).rejects.toThrow('Invalid personal retrieval query embedding');
        abortSignal.mockResolvedValue({ data: ready([{ ...match(), end_offset: 100 }]), error: null });
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([reflection]);
        await expect(retrievePersonalEvidence(request('Question'))).rejects.toThrow('Invalid indexed evidence span');
    });
    it('does not send a stronger but semantically rejected capture to the answer model', async () => {
        const irrelevantId = '44444444-4444-4444-8444-444444444444';
        const irrelevant = { ...reflection, id: irrelevantId, evidenceId: `reflection:${irrelevantId}`, reflectionText: 'Unrelated text' } as PersonalEvidenceCandidate;
        abortSignal.mockResolvedValue({ data: ready([match(), { ...match(), evidence_id: irrelevantId, similarity: .99 }]), error: null });
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([irrelevant, reflection]);
        const result = await retrievePersonalEvidence(request('What patterns appear?'));
        expect(result.items.map(item => item.evidence.id)).toEqual([id]);
        expect(result.contextText).not.toContain('Unrelated text');
        expect(selectionGenerator).toHaveBeenCalledTimes(1);
    });
    it('keeps bounded candidates unformatted until the joint Library selection', async () => {
        abortSignal.mockResolvedValue({ data: ready([match()]), error: null });
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([reflection]);
        const result = await retrievePersonalEvidence({ ...request('What patterns appear?'), deferSelection: true });
        expect(result.items).toHaveLength(1);
        expect(result.contextText).toBe('');
        expect(result.selection).toBeNull();
        expect(selectionGenerator).not.toHaveBeenCalled();
    });
    it('fails closed when the selector invents an unauthorized ID or fails', async () => {
        abortSignal.mockResolvedValue({ data: ready([match()]), error: null });
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([reflection]);
        selectionGenerator.mockResolvedValueOnce({ output: structuralSelectionOutput(['reflection:another-account']) });
        await expect(retrievePersonalEvidence(request('Question'))).rejects.toThrow('INVALID_SELECTION');
        selectionGenerator.mockRejectedValueOnce(new Error('provider failed'));
        await expect(retrievePersonalEvidence(request('Question'))).rejects.toThrow('UNAVAILABLE');
    });

});
