import { describe, expect, it } from 'vitest';
import { buildPersonalEvidenceSelectionRequest } from '@/lib/server/personal-evidence-selector';
import { structuralSelectionOutput } from '@/tests/fixtures/retrieval/selection-output';
import { buildFacetReferenceRequest } from '@/scripts/experiments/selector-facet-wire';
const make = (exactQuote = false) => buildPersonalEvidenceSelectionRequest({ question: 'Compare the two saved actions.', exactQuote, candidates: ['A', 'B'].map(id => ({ id, type: 'highlight' as const, title: 'Source', fields: [{ name: 'highlightedText' as const, text: 'Original passage' }] })) }).request;
const output = () => ({ requestedFacets: ['First action', 'Second action'], assessments: structuralSelectionOutput(['A', 'B']).assessments.map((item, facetIndex) => ({ id: item.id, supportSummary: item.supportSummary, constraintCheck: item.constraintCheck, verdict: item.verdict, facetIndex })) });
describe('development facet reference boundary', () => {
    it('restores exact facet text without changing passage inputs or evidence identities', () => {
        const request = make(), wire = buildFacetReferenceRequest(request);
        expect(wire.request.prompt).toBe(request.prompt);
        const restored = wire.restore(output());
        expect(restored.assessments.map(x => x.requestedFacet)).toEqual(output().requestedFacets);
        expect(restored.assessments.map(x => x.id)).toEqual(['A', 'B']);
    });
    it('rejects invalid facet references and unknown or duplicated evidence identities', () => {
        const wire = buildFacetReferenceRequest(make());
        for (const facetIndex of [-1, 0.5, 2, 8]) {
            const value = output(); value.assessments[0].facetIndex = facetIndex;
            expect(() => wire.restore(value)).toThrow();
        }
        for (const id of ['B', 'unknown']) {
            const value = output(); value.assessments[0].id = id;
            expect(() => wire.restore(value)).toThrow();
        }
    });
    it('preserves quote, eight-assessment and strict-property limits', () => {
        expect(() => buildFacetReferenceRequest(make(true)).restore(output())).toThrow();
        const value = output(); value.assessments = Array.from({ length: 9 }, () => value.assessments[0]);
        expect(() => buildFacetReferenceRequest(make()).restore(value)).toThrow();
        expect(() => buildFacetReferenceRequest(make()).restore({ ...output(), extra: true })).toThrow();
    });
});
