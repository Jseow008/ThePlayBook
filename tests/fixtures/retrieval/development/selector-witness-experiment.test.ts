import { describe, expect, it } from "vitest";
import { readSelectorDevelopmentFixture } from "../../../../scripts/probe-personal-selector";
import { buildPersonalEvidenceSelectionRequest } from "../../../../lib/server/personal-evidence-selector";
import { buildWitnessRequest, validateWitnessOutput, type WitnessOutput, WITNESS_EXPERIMENT_CONFIG } from "./selector-witness-experiment";

const fixture = readSelectorDevelopmentFixture("selector-precision-v1.json");
const organization = fixture.cases.find(item => item.id === "named-organization-not-established")!;
const museumText = organization.candidates[0].fields[0].text;
const wrongOrganization = (): WitnessOutput => ({
    facets: [{ questionQuote: "What application deadline", constraints: [{ kind: "entity", questionQuote: "Eastbank Ceramic Guild" }] }],
    assessments: [{ id: "p08", facetIndex: 0, verdict: "not_established", support: [],
        constraintChecks: [{ constraintIndex: 0, status: "not_established", witnesses: [{ field: "sourceText", quote: "Eastbank Ceramic Museum" }] }] }],
});
describe("development evidence-witness validator (structural proof, not semantic quality)", () => {
    it("keeps expected labels out of requests and changes no production request", () => {
        const before = buildPersonalEvidenceSelectionRequest(organization);
        const request = buildWitnessRequest(organization);
        expect(JSON.parse(request.prompt)).not.toHaveProperty("expectedIds");
        expect(JSON.parse(request.prompt)).not.toHaveProperty("caseId");
        expect(request.prompt).toBe(before.request.prompt);
        expect(request.system).not.toContain("Return only the requested structured list of candidate IDs");
        expect(request.system).not.toContain("or include quote text in your output");
        expect(request.canonical.modelConfig).toMatchObject({ maxOutputTokens: 1600, previousMaxOutputTokens: 700, maximumCalls: 18 });
        expect(buildPersonalEvidenceSelectionRequest(organization).canonical).toEqual(before.canonical);
        expect(WITNESS_EXPERIMENT_CONFIG.repetitions).toBe(3);
    });
    it("derives an explicit valid abstention from an unsupported identity, rather than counting an error as empty", () => {
        expect(validateWitnessOutput(organization, wrongOrganization())).toMatchObject({ ids: [], rejected: [{ id: "p08", reason: "not_established" }] });
        const falselySupported = wrongOrganization();
        falselySupported.assessments[0].verdict = "direct";
        falselySupported.assessments[0].support = [{ field: "sourceText", quote: museumText }];
        falselySupported.assessments[0].constraintChecks[0].status = "supported";
        expect(() => validateWitnessOutput(organization, falselySupported)).toThrow("INVALID_ENTITY_WITNESS");
    });
    it("rejects fabricated support or check quotes even on a rejected candidate", () => {
        const altered = wrongOrganization();
        altered.assessments[0].constraintChecks[0].witnesses[0].quote = "Eastbank Ceramic Guild";
        expect(() => validateWitnessOutput(organization, altered)).toThrow("INVALID_WITNESS");
        const support = wrongOrganization(); support.assessments[0].support = [{ field: "sourceText", quote: "Fabricated supporting passage" }];
        expect(() => validateWitnessOutput(organization, support)).toThrow("INVALID_WITNESS");
    });
    it("rejects missing checks, duplicate IDs, nonexistent facets and nonverbatim question spans", () => {
        const missing = wrongOrganization(); missing.assessments[0].constraintChecks = [];
        expect(() => validateWitnessOutput(organization, missing)).toThrow("MISSING_CONSTRAINT_CHECK");
        const duplicate = wrongOrganization(); duplicate.assessments.push(duplicate.assessments[0]);
        expect(() => validateWitnessOutput(organization, duplicate)).toThrow("INVALID_SCHEMA");
        const facet = wrongOrganization(); facet.assessments[0].facetIndex = 7;
        expect(() => validateWitnessOutput(organization, facet)).toThrow("INVALID_FACET");
        const question = wrongOrganization(); question.facets[0].questionQuote = "An invented question";
        expect(() => validateWitnessOutput(organization, question)).toThrow("INVALID_QUESTION_SPAN");
    });
    it("accepts a grounded full entity witness with case normalization and direct stored support", () => {
        const testCase = fixture.cases.find(item => item.id === "same-name-different-profession")!;
        const direct: WitnessOutput = { facets: [{ questionQuote: "What queue rule", constraints: [{ kind: "entity", questionQuote: "harbor engineer Rowan Pike" }] }],
            assessments: [{ id: "p06", facetIndex: 0, verdict: "direct",
                support: [{ field: "sourceText", quote: "Arrival time breaks ties between vessels that satisfy both conditions." }],
                constraintChecks: [{ constraintIndex: 0, status: "supported", witnesses: [{ field: "sourceText", quote: "Harbor engineer Rowan Pike" }] }] }] };
        expect(validateWitnessOutput(testCase, direct).ids).toEqual(["p06"]);
        direct.assessments[0].support = [];
        expect(() => validateWitnessOutput(testCase, direct)).toThrow("INVALID_DIRECT_SUPPORT");
    });
    it("does not admit reflection prompts as supporting evidence", () => {
        const testCase = fixture.cases.find(item => item.id === "three-requested-comparison-facets")!;
        expect(() => validateWitnessOutput(testCase, { facets: [{ questionQuote: "what I experienced on a rainy commute", constraints: [] }],
            assessments: [{ id: "p16", facetIndex: 0, verdict: "direct", support: [{ field: "prompt", quote: "What did the commute teach you?" }], constraintChecks: [] }] }))
            .toThrow("INVALID_SCHEMA");
    });
    it("does not claim deterministic semantic protection when the model omits the identity constraint", () => {
        const omitted: WitnessOutput = { facets: [{ questionQuote: "What application deadline", constraints: [] }],
            assessments: [{ id: "p08", facetIndex: 0, verdict: "direct", support: [{ field: "sourceText", quote: museumText }], constraintChecks: [] }] };
        // A valid exact quote is not proof that the model extracted every constraint.
        expect(validateWitnessOutput(organization, omitted).ids).toEqual(["p08"]);
    });
});
