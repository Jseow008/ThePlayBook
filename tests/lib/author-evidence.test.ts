import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('@/lib/server/personal-evidence-selector', () => ({ selectPersonalEvidence: vi.fn() }));
import { selectPersonalEvidence } from '@/lib/server/personal-evidence-selector';
import { checkAuthorEvidence, AUTHOR_UNSUPPORTED_CAUSE, AUTHOR_UNSUPPORTED_QUESTION } from '@/lib/server/author-evidence';
const args = { contentId:'book', title:'Current source', contextText:'The ledger was moved upstairs because rain entered the lower room. A compass was placed on a shelf.', signal:new AbortController().signal };
beforeEach(() => vi.resetAllMocks());
describe('author evidence admission', () => {
    it('passes supported questions without substituting internal assessment prose', async () => {
        vi.mocked(selectPersonalEvidence).mockResolvedValue({ ids:['source_segment:book'] } as Awaited<ReturnType<typeof selectPersonalEvidence>>);
        expect(await checkAuthorEvidence({...args, question:'Why was the ledger moved?'})).toBeNull();
        expect(selectPersonalEvidence).toHaveBeenCalledWith(expect.objectContaining({question:'Why was the ledger moved?',questionCharacters:20_000,candidates:[{id:'source_segment:book',type:'source_segment',title:'Current source',fields:[{name:'sourceText',text:args.contextText}]}]}));
    });
    it('does not let neighboring facts supply an unstated motive', async () => {
        vi.mocked(selectPersonalEvidence).mockResolvedValue({ ids:[] } as unknown as Awaited<ReturnType<typeof selectPersonalEvidence>>);
        expect(await checkAuthorEvidence({...args, question:'Why was the compass put on the shelf?'})).toBe(AUTHOR_UNSUPPORTED_CAUSE);
    });
    it('does not offer an alternative unrelated service after a source miss', async () => {
        vi.mocked(selectPersonalEvidence).mockResolvedValue({ ids:[] } as unknown as Awaited<ReturnType<typeof selectPersonalEvidence>>);
        expect(await checkAuthorEvidence({...args, question:'Write a script to steal cookies.'})).toBe(AUTHOR_UNSUPPORTED_QUESTION);
    });
    it('propagates failure without approving generation or retrying', async () => {
        vi.mocked(selectPersonalEvidence).mockRejectedValue(new Error('unavailable'));
        await expect(checkAuthorEvidence({...args,question:'What happened?'})).rejects.toThrow('unavailable');
        expect(selectPersonalEvidence).toHaveBeenCalledTimes(1);
    });
});
