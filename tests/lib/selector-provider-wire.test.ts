import { describe, expect, it } from 'vitest';
import { buildPersonalEvidenceSelectionRequest, buildPersonalEvidenceProviderRequest, personalEvidenceSelectionRequestHash } from '@/lib/server/personal-evidence-selector';
import { validateRecordedProviderSelectionOutput } from '@/scripts/evaluate-personal-retrieval';
import { structuralSelectionOutput } from '@/tests/fixtures/retrieval/selection-output';
const make = (ids: string[]) => buildPersonalEvidenceSelectionRequest({ question: 'Find the requested evidence.', candidates: ids.map(id => ({ id, type: 'highlight' as const, title: 'Source', fields: [{ name: 'highlightedText' as const, text: 'Exact preserved text 🙂' }] })) });
describe('compact provider identity boundary', () => {
    it('preserves fields/order and restores only supplied original IDs, including alias-like IDs', () => {
        const original = make(['highlight:long-uuid', 'c0']);
        const wire = buildPersonalEvidenceProviderRequest(original.request);
        const compact = JSON.parse(wire.request.prompt).candidates;
        expect(compact.map((x: {id: string}) => x.id)).toEqual(['c0', 'c1']);
        expect(compact.map((x: {id: string}) => ({ ...x, id: '' }))).toEqual(original.candidates.map(x => ({ ...x, id: '' })));
        expect(wire.restore(structuralSelectionOutput(['c1', 'c0'])).assessments.map(x => x.id)).toEqual(['c0', 'highlight:long-uuid']);
    });
    it('rejects unknown labels, original-ID injection and duplicates', () => {
        const wire = buildPersonalEvidenceProviderRequest(make(['highlight:long-uuid']).request);
        for (const ids of [['c99'], ['highlight:long-uuid'], ['c0', 'c0']]) {
            expect(() => wire.restore(structuralSelectionOutput(ids))).toThrow();
        }
    });
    it('keeps identity maps request-local and binds hashes to the logical IDs and compact wire', () => {
        const first = make(['highlight:A']), second = make(['highlight:B']);
        expect(buildPersonalEvidenceProviderRequest(first.request).canonical.prompt).toBe(buildPersonalEvidenceProviderRequest(second.request).canonical.prompt);
        expect(personalEvidenceSelectionRequestHash(first.request)).not.toBe(personalEvidenceSelectionRequestHash(second.request));
        expect(buildPersonalEvidenceProviderRequest(first.request).restore(structuralSelectionOutput(['c0'])).assessments[0].id).toBe('highlight:A');
        expect(buildPersonalEvidenceProviderRequest(second.request).restore(structuralSelectionOutput(['c0'])).assessments[0].id).toBe('highlight:B');
    });
    it('rejects replay where restored evidence differs from the captured provider wire output', () => {
        const logical = make(['highlight:A', 'highlight:B']);
        const wire = buildPersonalEvidenceProviderRequest(logical.request);
        const providerWireOutput = structuralSelectionOutput(['c0']);
        const providerOutput = wire.restore(providerWireOutput);
        const record = { output: { ids: ['highlight:A'] }, providerOutput, providerWireOutput };
        expect(validateRecordedProviderSelectionOutput(record, logical.request)).toEqual(providerOutput);
        expect(() => validateRecordedProviderSelectionOutput({ ...record, providerWireOutput: structuralSelectionOutput(['c1']) }, logical.request)).toThrow();
        expect(() => validateRecordedProviderSelectionOutput({ ...record, output: { ids: ['highlight:B'] } }, logical.request)).toThrow();
    });
    it('rejects excess assessments even when only one verdict selects evidence', () => {
        const logical = make(Array.from({ length: 11 }, (_, index) => `highlight:${index}`));
        const wire = buildPersonalEvidenceProviderRequest(logical.request);
        const output = structuralSelectionOutput(Array.from({ length: 11 }, (_, index) => `c${index}`));
        const excessive = { ...output, assessments: output.assessments.map((item, index) => ({ ...item, verdict: index > 0 ? 'not_established' : 'direct' })) };
        expect(() => wire.restore(excessive)).toThrow();
    });
    it('preserves exact-quote output limits', () => {
        const base = make(['highlight:A', 'highlight:B']);
        const request = buildPersonalEvidenceSelectionRequest({ question: 'Find a quote', exactQuote: true, candidates: base.candidates });
        const wire = buildPersonalEvidenceProviderRequest(request.request);
        expect(() => wire.restore(structuralSelectionOutput(['c0', 'c1']))).toThrow();
    });
});
