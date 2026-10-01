/** Development adapter only. Production continues using its existing format. */
import { z } from 'zod';
import { canonicalPersonalEvidenceSelectionRequest, derivePersonalEvidenceSelectionIds, PERSONAL_EVIDENCE_SELECTOR_LIMITS, type PersonalEvidenceSelectionOutput, type PersonalEvidenceSelectionRequest } from '../../lib/server/personal-evidence-selector';
type FacetReferenceOutput = { requestedFacets: string[]; assessments: Array<Omit<PersonalEvidenceSelectionOutput['assessments'][number], 'requestedFacet'> & { facetIndex: number }> };
export function buildFacetReferenceRequest(request: Omit<PersonalEvidenceSelectionRequest, 'signal'>) {
    canonicalPersonalEvidenceSelectionRequest(request);
    if (!(request.schema instanceof z.ZodObject)) throw new Error('Expected production object schema');
    const assessments = request.schema.shape.assessments;
    if (!(assessments instanceof z.ZodArray) || !(assessments.element instanceof z.ZodObject)) throw new Error('Expected production assessments schema');
    const input = JSON.parse(request.prompt) as { maximumSelected: number };
    const fields = assessments.element.shape;
    const item = z.object({
        id: fields.id as z.ZodType<string>,
        supportSummary: fields.supportSummary as z.ZodType<string>,
        constraintCheck: fields.constraintCheck as z.ZodType<string>,
        verdict: fields.verdict as z.ZodType<PersonalEvidenceSelectionOutput['assessments'][number]['verdict']>,
        facetIndex: z.number().int().min(0).max(PERSONAL_EVIDENCE_SELECTOR_LIMITS.requestedFacets - 1),
    }).strict();
    const schema: z.ZodType<FacetReferenceOutput> = z.object({ requestedFacets: request.schema.shape.requestedFacets as z.ZodType<string[]>, assessments: z.array(item).max(input.maximumSelected) }).strict();
    const system = `${request.system}\n\nWire representation: use facetIndex instead of repeating requestedFacet in each assessment. facetIndex is the zero-based index of the exact facet in requestedFacets. Keep all requested facets, evidence summaries and constraint checks as required above. Never use an index outside requestedFacets.`;
    return { request: { ...request, system, schema }, restore(output: unknown) {
        const parsed = schema.parse(output);
        const logical = { requestedFacets: parsed.requestedFacets, assessments: parsed.assessments.map(({ facetIndex, ...assessment }) => {
            if (facetIndex >= parsed.requestedFacets.length) throw new Error('Unknown facet index');
            return { ...assessment, requestedFacet: parsed.requestedFacets[facetIndex] };
        }) };
        const restored = request.schema.parse(logical);
        derivePersonalEvidenceSelectionIds(restored, request);
        return restored;
    } };
}
