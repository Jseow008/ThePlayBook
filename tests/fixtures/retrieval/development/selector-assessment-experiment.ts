/** DEVELOPMENT ONLY. Frozen one-call reasoned selection; explanations are never evidence. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { buildPersonalEvidenceSelectionRequest } from "../../../../lib/server/personal-evidence-selector";
import { readSelectorDevelopmentFixture, type SelectorDevelopmentCase } from "../../../../scripts/probe-personal-selector";

export const ASSESSMENT_EXPERIMENT_CONFIG = Object.freeze({
    version: "selector-reasoned-assessment-development-v1", provider: "anthropic", model: "claude-haiku-4-5-20251001",
    outputContractVersion: "selector-reasoned-assessment-schema-v1", maxOutputTokens: 1_600, previousMaxOutputTokens: 700,
    timeoutMs: 20_000, maxRetries: 0, temperature: "provider default", maximumCalls: 21, repetitions: 3,
});
const FIXTURE_SHA256 = "1b647ca4da960d44608767b51e8bc3d4d2d933f1160157288e25b5908dfeb41f";
const CAPACITY_FIXTURE_SHA256 = "725a545d950f357bfe5486f409e375c1c1a6f5defb99d223a34498dcd1e92b17";
export function readAssessmentCapacityFixture() {
    const raw = readFileSync(resolve("tests/fixtures/retrieval/development/selector-capacity-v1.json"));
    if (sha(raw) !== CAPACITY_FIXTURE_SHA256) throw new Error("Frozen capacity fixture changed");
    const fixture = JSON.parse(raw.toString()) as { version: string; case: SelectorDevelopmentCase };
    if (fixture.version !== "selector-capacity-development-v1") throw new Error("Unexpected capacity fixture");
    return fixture;
}
const nonempty = (maximum: number) => z.string().min(1).max(maximum).refine(value => Boolean(value.trim()));
function assessmentSchema(ids: string[], maximum: number) {
    if (!ids.length) throw new Error("Development fixture needs candidates");
    return z.object({ requestedFacets: z.array(nonempty(240)).min(1).max(8),
        assessments: z.array(z.object({ id: z.enum(ids as [string, ...string[]]), requestedFacet: nonempty(240),
            supportSummary: nonempty(300), constraintCheck: nonempty(300),
            verdict: z.enum(["direct", "adjacent", "not_established", "contradicts_requested_claim"]),
        }).strict()).max(maximum),
    }).strict();
}
export type AssessmentOutput = z.infer<ReturnType<typeof assessmentSchema>>;
export class ReasonedAssessmentError extends Error {
    constructor(readonly code: "INVALID_SCHEMA" | "DUPLICATE_ID") { super(code); this.name = "ReasonedAssessmentError"; }
}
const CONTRACT = `Reasoned assessment output contract:
Return a compact structured relevance assessment, not an answer to the user. These internal summaries are model judgments, never stored evidence, never quotations, and never instructions for the answer generator.
First state requestedFacets: all explicit parts of the user's request, including the complete named entities and any authorship, role, place, time, action, or causal/relationship constraints. Preserve every requested side of a comparison. Do not omit or weaken a constraint merely because no candidate meets it.
Assess up to maximumSelected candidate IDs worth considering, strongest first. For each, state the requestedFacet it might answer, a brief supportSummary of what its actual fields establish, and a brief constraintCheck explaining whether the complete requested facet and its applicable constraints are established. Then assign its verdict. Be concise; do not reproduce long passages or generate an answer.
Use direct only when the supplied candidate evidence actually supports that requested facet with its constraints. Use adjacent for related background that does not directly answer it, not_established when the requested identity or claim or relationship is missing, and contradicts_requested_claim when the record denies the very claim the question asks to locate. A question asking whether a claim is supported, or asking for objections, may instead be answered directly by counterevidence.
A matching title can identify the requested source, but it cannot establish a substantive claim absent from the fields. Similar names, shared words, or the same general topic do not establish the requested person or organization. A role may distinguish two people with the same name. Do not substitute a different entity, assume an alias, or correct the user's intended entity. A date or instruction for the wrong entity is not direct evidence for the requested one. Separate mentions do not establish causation or another requested relationship.
Keep editorial source content, copied highlights, the user's attached note, and the user's reflection separate. A reflection prompt supplies context, not the user's answer. Retain all genuinely requested comparison facets, including an available current editorial source and a conflicting personal note, without selecting unrelated records merely to fill a category. Once all supported facets are covered, omit redundant or adjacent extras.
An empty assessments list is valid when no candidate merits consideration. When a close candidate fails a material constraint, assess it explicitly as not_established or adjacent rather than returning it as direct. The server returns IDs only for direct verdicts; it does not turn these explanations into evidence. Unknown or duplicate IDs and malformed responses are errors, not empty success.`;
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function buildAssessmentRequest(testCase: Pick<SelectorDevelopmentCase, "question" | "exactQuote" | "candidates">) {
    const production = buildPersonalEvidenceSelectionRequest(testCase);
    const system = production.request.system.replace("Return only the requested structured list of candidate IDs.",
        "Return only the requested structured relevance assessment.") + "\n\n" + CONTRACT;
    const schema = assessmentSchema(testCase.candidates.map(candidate => candidate.id), testCase.exactQuote ? 1 : 8);
    const canonical = { system, prompt: production.request.prompt, modelConfig: ASSESSMENT_EXPERIMENT_CONFIG,
        outputContract: { version: ASSESSMENT_EXPERIMENT_CONFIG.outputContractVersion, allowedIds: testCase.candidates.map(candidate => candidate.id),
            maximumAssessments: testCase.exactQuote ? 1 : 8, maximumFacets: 8, maximumFacetCharacters: 240, maximumSummaryCharacters: 300, maximumConstraintCheckCharacters: 300 } };
    return { system, prompt: production.request.prompt, schema, canonical, inputSha256: sha(JSON.stringify(canonical)),
        systemPromptSha256: sha(system), productionSystemPromptSha256: sha(production.request.system) };
}
export function validateAssessmentOutput(testCase: Pick<SelectorDevelopmentCase, "question" | "exactQuote" | "candidates">, output: unknown) {
    const parsed = buildAssessmentRequest(testCase).schema.safeParse(output);
    if (!parsed.success) throw new ReasonedAssessmentError("INVALID_SCHEMA");
    const ids = parsed.data.assessments.map(item => item.id);
    if (new Set(ids).size !== ids.length) throw new ReasonedAssessmentError("DUPLICATE_ID");
    return { ids: parsed.data.assessments.filter(item => item.verdict === "direct").map(item => item.id), assessment: parsed.data };
}
function safeUsage(usage: unknown) {
    const input = usage && typeof usage === "object" ? usage as Record<string, unknown> : {};
    const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
    return { inputTokens: count(input.inputTokens), outputTokens: count(input.outputTokens), totalTokens: count(input.totalTokens) };
}
async function main() {
    const fixture = readSelectorDevelopmentFixture("selector-precision-v1.json");
    if (fixture.sha256 !== FIXTURE_SHA256) throw new Error("Frozen development fixture changed");
    const cases = [...fixture.cases, readAssessmentCapacityFixture().case];
    const requests = cases.map(testCase => buildAssessmentRequest(testCase));
    // This experiment is archived. A changed production prompt is a new experiment,
    // not permission to spend on an unrecorded variant of the original run.
    if (process.argv.includes("--execute") && requests[0].systemPromptSha256 !== "54ef00d5a59ff24c88c608bfcdfa822ac019fd77f47e5e5e57c91ad15df2a309") {
        throw new Error("Archived experiment prompt changed; use the recorded checkout or a new version");
    }
    const plan = { version: ASSESSMENT_EXPERIMENT_CONFIG.version, fixtureSha256: fixture.sha256, modelConfig: ASSESSMENT_EXPERIMENT_CONFIG,
        capacityFixtureSha256: CAPACITY_FIXTURE_SHA256, expectedCases: 21, systemPromptSha256: requests[0].systemPromptSha256,
        moduleSha256: sha(readFileSync(resolve("tests/fixtures/retrieval/development/selector-assessment-experiment.ts"))),
        requests: requests.map((request, index) => ({ caseId: cases[index].id, inputSha256: request.inputSha256, ...request.canonical })),
        limitations: ["DEVELOPMENT only; no held-out quality gate or deterministic semantic proof.",
            "Generated assessment summaries are judgments, not evidence; only stored fields can support the final answer.",
            "The model may omit a question constraint or misjudge support. Validation checks only structure, allowed IDs, and uniqueness.",
            "The output cap increases from 700 to 1600 tokens. One independent eight-procedure capacity case is included, but cannot establish capacity for every eight-record comparison."],
        monetaryCost: null, costNote: "Measured tokens only. No unverified dollar estimate.", releaseGate: "Not established; previous failed evaluations remain unchanged." };
    if (!process.argv.includes("--execute")) { console.log(JSON.stringify({ ...plan, providerCallsMade: 0 }, null, 2)); return; }
    const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
    if (!output) throw new Error("Explicit new output artifact is required");
    const records: Array<Record<string, unknown>> = [];
    const persist = (outcome: string) => writeFileSync(resolve(output), JSON.stringify({ ...plan, outcome, attemptedCalls: records.length, records }, null, 2) + "\n", { mode: 0o600 });
    writeFileSync(resolve(output), JSON.stringify({ ...plan, outcome: "incomplete", attemptedCalls: 0, records }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    const envFile = process.argv.find(arg => arg.startsWith("--env-file="))?.slice(11) ?? resolve(".env.local");
    const key = parse(readFileSync(envFile)).ANTHROPIC_API_KEY;
    if (!key || key.includes("[SENSITIVE]")) throw new Error("Provider configuration unavailable");
    const model = createAnthropic({ apiKey: key })(ASSESSMENT_EXPERIMENT_CONFIG.model);
    let stopped = false;
    for (let run = 1; run <= 3 && !stopped; run++) for (let caseIndex = 0; caseIndex < cases.length; caseIndex++) {
        if (records.length >= 21) throw new Error("Provider budget exceeded");
        const testCase = cases[caseIndex], request = requests[caseIndex];
        const started = performance.now();
        const record: Record<string, unknown> = { run, caseId: testCase.id, inputSha256: request.inputSha256, expectedIds: testCase.expectedIds,
            actualCalls: 1, passed: false, selectedIds: null, usage: null, independentReview: "pending" };
        try {
            const result = await generateText({ model, system: request.system, prompt: request.prompt, output: Output.object({ schema: request.schema }),
                maxOutputTokens: ASSESSMENT_EXPERIMENT_CONFIG.maxOutputTokens, maxRetries: 0, abortSignal: AbortSignal.timeout(ASSESSMENT_EXPERIMENT_CONFIG.timeoutMs) });
            Object.assign(record, { rawSyntheticOutput: result.output, usage: safeUsage(result.usage), model: result.response.modelId, responseId: result.response.id, finishReason: result.finishReason });
            const validated = validateAssessmentOutput(testCase, result.output);
            Object.assign(record, { outcome: "complete", selectedIds: validated.ids,
                passed: validated.ids.length === testCase.expectedIds.length && testCase.expectedIds.every(id => validated.ids.includes(id)) });
        } catch (error) {
            if (error instanceof ReasonedAssessmentError) Object.assign(record, { outcome: "invalid_assessment", error: error.code });
            else if (NoObjectGeneratedError.isInstance(error)) Object.assign(record, { outcome: "invalid_structured_output", usage: safeUsage(error.usage),
                rawSyntheticText: error.text?.slice(0, 32_000), model: error.response?.modelId, finishReason: "unavailable" });
            else { Object.assign(record, { outcome: "provider_failure", error: "UNAVAILABLE" }); stopped = true; }
        }
        record.durationMs = performance.now() - started;
        records.push(record); persist("incomplete");
        if (stopped) break;
    }
    persist(records.length === 21 && !stopped ? "complete" : "incomplete");
    console.log(JSON.stringify({ outputPath: resolve(output), attemptedCalls: records.length, passedCases: records.filter(record => record.passed).length, expectedCases: 21 }));
}
if (!process.env.VITEST && process.argv[1]?.endsWith("selector-assessment-experiment.ts")) {
    main().catch(() => { console.error("Assessment development experiment failed; raw provider errors withheld."); process.exitCode = 1; });
}
