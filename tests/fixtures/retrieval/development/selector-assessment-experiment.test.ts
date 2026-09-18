import { describe, expect, it } from "vitest";
import { readSelectorDevelopmentFixture } from "../../../../scripts/probe-personal-selector";
import { buildPersonalEvidenceSelectionRequest } from "../../../../lib/server/personal-evidence-selector";
import { buildAssessmentRequest, readAssessmentCapacityFixture, validateAssessmentOutput, type AssessmentOutput, ASSESSMENT_EXPERIMENT_CONFIG } from "./selector-assessment-experiment";
const fixture = readSelectorDevelopmentFixture("selector-precision-v1.json");
const organization = fixture.cases.find(item => item.id === "named-organization-not-established")!;
const comparison = fixture.cases.find(item => item.id === "three-requested-comparison-facets")!;
const assessment = (id: string, verdict: AssessmentOutput["assessments"][number]["verdict"] = "direct") => ({ id, requestedFacet: "Requested facet", supportSummary: "A short internal summary.", constraintCheck: "A short internal constraint judgment.", verdict });
describe("reasoned selection development harness (structural proof only)", () => {
    it("keeps expected labels out of inputs and preserves the production request", () => {
        const original = buildPersonalEvidenceSelectionRequest(organization).canonical;
        const built = buildAssessmentRequest(organization);
        expect(JSON.parse(built.prompt)).not.toHaveProperty("expectedIds");
        expect(JSON.parse(built.prompt)).not.toHaveProperty("caseId");
        expect(built.prompt).toBe(original.prompt);
        expect(buildPersonalEvidenceSelectionRequest(organization).canonical).toEqual(original);
        expect(built.system).toContain("never stored evidence");
        expect(built.canonical.modelConfig).toMatchObject({ maxOutputTokens: 1600, timeoutMs: 20000, maxRetries: 0, maximumCalls: 21 });
        expect(ASSESSMENT_EXPERIMENT_CONFIG.repetitions).toBe(3);
    });
    it("derives only ordered direct IDs and allows all requested comparison sides", () => {
        const result = validateAssessmentOutput(comparison, { requestedFacets: ["Current source", "Personal objection", "Personal experience"],
            assessments: [assessment("p14"), assessment("p15"), assessment("p16"), assessment("p17", "adjacent")] });
        expect(result.ids).toEqual(["p14", "p15", "p16"]);
        const capacity = readAssessmentCapacityFixture().case;
        expect(capacity.candidates).toHaveLength(8);
        expect(validateAssessmentOutput(capacity, { requestedFacets: ["Eight requested procedures"],
            assessments: capacity.candidates.map(item => assessment(item.id)) }).ids).toEqual(capacity.expectedIds);
    });
    it("accepts explicit unsupported assessments and genuinely empty assessments", () => {
        expect(validateAssessmentOutput(organization, { requestedFacets: ["Guild deadline"], assessments: [assessment("p08", "not_established")] }).ids).toEqual([]);
        expect(validateAssessmentOutput(organization, { requestedFacets: ["Guild deadline"], assessments: [] }).ids).toEqual([]);
    });
    it("rejects duplicate and unknown IDs instead of silently dropping them", () => {
        expect(() => validateAssessmentOutput(organization, { requestedFacets: ["Guild deadline"], assessments: [assessment("p08"), assessment("p08")] })).toThrow("DUPLICATE_ID");
        expect(() => validateAssessmentOutput(organization, { requestedFacets: ["Guild deadline"], assessments: [assessment("unknown")] })).toThrow("INVALID_SCHEMA");
    });
    it("rejects incomplete, blank, oversized, or extra schema fields", () => {
        const valid = { requestedFacets: ["Guild deadline"], assessments: [assessment("p08")] };
        for (const invalid of [ { ...valid, requestedFacets: [] }, { ...valid, requestedFacets: [" "] },
            { ...valid, assessments: [{ ...assessment("p08"), supportSummary: "x".repeat(301) }] },
            { ...valid, assessments: [{ ...assessment("p08"), verdict: "maybe" }] }, { ...valid, ids: ["p08"] },
            { ...valid, assessments: [{ id: "p08", verdict: "direct" }] } ]) {
            expect(() => validateAssessmentOutput(organization, invalid)).toThrow("INVALID_SCHEMA");
        }
    });
    it("preserves single-target exact-quote selection while treating assessments as internal only", () => {
        const quoted = { ...comparison, exactQuote: true };
        expect(validateAssessmentOutput(quoted, { requestedFacets: ["Stored quote"], assessments: [assessment("p15")] }).ids).toEqual(["p15"]);
        expect(() => validateAssessmentOutput(quoted, { requestedFacets: ["Stored quote"], assessments: [assessment("p14"), assessment("p15")] })).toThrow("INVALID_SCHEMA");
        expect(buildAssessmentRequest(quoted).canonical.outputContract.maximumAssessments).toBe(1);
    });
    it("does not pretend schema validation proves the model's relevance judgment", () => {
        // These strings need not occur literally in the question or evidence.
        // A wrong direct verdict remains observable as a quality failure.
        const output = { requestedFacets: ["A paraphrased task"], assessments: [assessment("p08")] };
        expect(validateAssessmentOutput(organization, output).ids).toEqual(["p08"]);
    });
});
