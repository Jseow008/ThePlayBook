import { expect, it } from 'vitest';
import { buildPersonalEvidenceSelectionRequest, canonicalPersonalEvidenceSelectionRequest } from '@/lib/server/personal-evidence-selector';
const candidates = [{ id:'source_segment:source', type:'source_segment' as const, title:'Source', fields:[{name:'sourceText' as const,text:'An authorized passage.'}] }];
it('preserves the normal selector bound while accepting the existing author input contract explicitly', () => {
    const question='x'.repeat(2_001);
    expect(() => buildPersonalEvidenceSelectionRequest({question,candidates})).toThrow('INVALID_INPUT');
    const result=buildPersonalEvidenceSelectionRequest({question,candidates,questionCharacters:20_000});
    expect(JSON.parse(result.request.prompt).question).toBe(question);
    expect(result.request.system).toBe(buildPersonalEvidenceSelectionRequest({question:'short',candidates}).request.system);
    expect(canonicalPersonalEvidenceSelectionRequest(result.canonical)).toEqual(result.canonical);
    expect(() => buildPersonalEvidenceSelectionRequest({question:'x'.repeat(20_001),candidates,questionCharacters:20_000})).toThrow('INVALID_INPUT');
});
