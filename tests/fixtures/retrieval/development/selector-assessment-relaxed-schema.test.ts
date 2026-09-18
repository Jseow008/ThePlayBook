import { describe, expect, it } from "vitest";
import { validateRelaxedAssessmentOutput } from "./selector-assessment-relaxed-schema";
const item = { id: "a", requestedFacet: "A facet", supportSummary: "Internal summary", constraintCheck: "Internal constraint judgment", verdict: "direct" };
describe("offline internal-text bound revision", () => {
    it("accepts longer internal text up to2000characters, without trimming or semantic rewriting", () => {
        const output = { requestedFacets: ["F".repeat(2000)], assessments: [{ ...item, constraintCheck: "C".repeat(2000) }] };
        const result = validateRelaxedAssessmentOutput(["a"], output);
        expect(result.valid).toBe(true);
        expect(result.ids).toEqual(["a"]);
        if (result.valid) expect(result.output).toEqual(output);
        expect(validateRelaxedAssessmentOutput(["a"], { ...output, assessments: [{ ...item, constraintCheck: "C".repeat(2001) }] }).valid).toBe(false);
    });
    it("continues rejecting unknown/duplicate IDs, missing fields and invalid verdicts", () => {
        for (const output of [ { requestedFacets: ["Facet"], assessments: [{ ...item, id: "unknown" }] },
            { requestedFacets: ["Facet"], assessments: [item, item] },
            { requestedFacets: ["Facet"], assessments: [{ id: "a", verdict: "direct" }] },
            { requestedFacets: ["Facet"], assessments: [{ ...item, verdict: "maybe" }] } ]) expect(validateRelaxedAssessmentOutput(["a"], output).valid).toBe(false);
    });
    it("keeps array, blank-text, strict-object and exact-quote limits", () => {
        for (const output of [ { requestedFacets: [], assessments: [] }, { requestedFacets: Array(9).fill("Facet"), assessments: [] },
            { requestedFacets: [" "], assessments: [] }, { requestedFacets: ["Facet"], assessments: [], ids: [] } ]) {
            expect(validateRelaxedAssessmentOutput(["a"], output).valid).toBe(false);
        }
        expect(validateRelaxedAssessmentOutput(["a", "b"], { requestedFacets: ["Facet"], assessments: [item, { ...item, id: "b" }] }, 1).valid).toBe(false);
        expect(validateRelaxedAssessmentOutput(["a"], { requestedFacets: ["Facet"], assessments: [{ ...item, verdict: "not_established" }] }).ids).toEqual([]);
    });
});
