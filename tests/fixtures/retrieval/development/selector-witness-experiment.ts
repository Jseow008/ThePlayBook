/** DEVELOPMENT ONLY. A frozen 18-call evidence-witness hypothesis, never a release gate. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import { buildPersonalEvidenceSelectionRequest } from "../../../../lib/server/personal-evidence-selector";
import { readSelectorDevelopmentFixture, type SelectorDevelopmentCase } from "../../../../scripts/probe-personal-selector";

export const WITNESS_EXPERIMENT_CONFIG = Object.freeze({
    version: "selector-evidence-witness-development-v1", provider: "anthropic", model: "claude-haiku-4-5-20251001",
    outputContractVersion: "selector-evidence-witness-schema-v1", maxOutputTokens: 1_600, previousMaxOutputTokens: 700,
    timeoutMs: 20_000, maxRetries: 0, temperature: "provider default", maximumCalls: 18, repetitions: 3,
});
const FIXTURE_SHA256 = "1b647ca4da960d44608767b51e8bc3d4d2d933f1160157288e25b5908dfeb41f";
const field = z.enum(["sourceText", "highlightedText", "noteBody", "reflectionText"]);
const witness = z.object({ field, quote: z.string().min(1).max(240) }).strict();
const facet = z.object({
    questionQuote: z.string().min(1).max(240),
    constraints: z.array(z.object({ kind: z.enum(["entity", "time", "action", "relationship", "other"]),
        questionQuote: z.string().min(1).max(180) }).strict()).max(6),
}).strict();
function witnessSchema(ids: string[], maximum: number) {
    if (!ids.length) throw new Error("Development fixture needs candidates");
    return z.object({
        facets: z.array(facet).min(1).max(8),
        assessments: z.array(z.object({
            id: z.enum(ids as [string, ...string[]]), facetIndex: z.number().int().min(0).max(7),
            verdict: z.enum(["direct", "adjacent", "not_established", "contradicts_requested_claim"]),
            support: z.array(witness).max(2),
            constraintChecks: z.array(z.object({ constraintIndex: z.number().int().min(0).max(5),
                status: z.enum(["supported", "contradicted", "not_established"]), witnesses: z.array(witness).max(2),
            }).strict()).max(6),
        }).strict()).max(maximum),
    }).strict();
}
export type WitnessOutput = z.infer<ReturnType<typeof witnessSchema>>;
export class WitnessAssessmentError extends Error {
    constructor(readonly code: "INVALID_SCHEMA" | "INVALID_QUESTION_SPAN" | "INVALID_FACET" | "INVALID_WITNESS"
        | "MISSING_CONSTRAINT_CHECK" | "INVALID_ENTITY_WITNESS" | "INVALID_DIRECT_SUPPORT") {
        super(code); this.name = "WitnessAssessmentError";
    }
}
const CONTRACT = `Evidence-witness output contract:
Return a short structured assessment, not an answer and not a free-form explanation. First divide the user's explicit request into facets. Each facet.questionQuote must be an exact nonempty substring of the question. Preserve all requested sides of comparisons as separate facets when appropriate.
For each facet, list its explicit hard constraints as exact question substrings. Extract COMPLETE named entities, including distinguishing words and any role needed to distinguish people; never shorten an organization to a shared partial name. Record entity, time, action, relationship, and other constraints only where the question imposes them. Constraints apply to their own facet, not automatically to every other comparison facet. Do not omit a stated constraint merely because no candidate satisfies it.
Assess up to maximumSelected candidate IDs worth considering, strongest first. Each assessment identifies its facetIndex and verdict. A direct assessment needs one or two SHORT verbatim support quotes from the candidate's actual evidence fields. Select enough text to establish the requested idea, including the material qualification. Never use a reflection prompt as support. The quotes are internal evidence witnesses, not a generated answer or a reconstructed quotation.
For EVERY constraint on that facet, supply exactly one indexed check, with status supported, contradicted, or not_established. Supported checks need a short verbatim field quote establishing that constraint. An entity check is supported only if an exact witness contains the FULL requested entity name (case and spacing differences are permitted). Different names are not aliases without supplied proof; this conservative experiment does not admit aliases. If the required entity is absent, mark not_established even if another entity's record would otherwise answer a similar question. Do not correct the user's entity or substitute the nearest candidate.
Use direct only when the evidence actually establishes that requested facet and every applicable hard constraint. For an unsupported claim or connection, use not_established; related background is adjacent. A statement denying a requested assertion is not a positive match for a question asking which record asserts it. It can be direct for a facet asking whether the claim is supported or requesting objections.
Assessments may be empty when nothing supports the request. For a close but invalid candidate, an explicit not_established assessment with its failed constraint is preferable to claiming direct support. The server derives final IDs only from direct assessments whose checks are all supported, after validating exact quotes. Never fabricate witnesses. Missing or invalid witnesses are errors, not an empty success. Keep the complete response compact enough for the output budget.`;
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export function buildWitnessRequest(testCase: Pick<SelectorDevelopmentCase, "question" | "exactQuote" | "candidates">) {
    const production = buildPersonalEvidenceSelectionRequest(testCase);
    const system = production.request.system
        .replace("Return only the requested structured list of candidate IDs.", "Return only the requested structured evidence-witness assessment.")
        .replace("or include quote text in your output.", "or invent supporting text.") + "\n\n" + CONTRACT;
    const schema = witnessSchema(testCase.candidates.map(candidate => candidate.id), testCase.exactQuote ? 1 : 8);
    const canonical = { system, prompt: production.request.prompt, modelConfig: WITNESS_EXPERIMENT_CONFIG,
        outputContract: { version: WITNESS_EXPERIMENT_CONFIG.outputContractVersion, allowedIds: testCase.candidates.map(candidate => candidate.id),
            maximumAssessments: testCase.exactQuote ? 1 : 8, maximumFacets: 8, maximumConstraintsPerFacet: 6, maximumQuotesPerSupport: 2, maximumQuoteCharacters: 240 } };
    return { system, prompt: production.request.prompt, schema, canonical, inputSha256: sha(JSON.stringify(canonical)),
        systemPromptSha256: sha(system), productionSystemPromptSha256: sha(production.request.system) };
}
function normalizeIdentity(value: string) { return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim(); }
function containsFullIdentity(text: string, requested: string) {
    const normalizedText = normalizeIdentity(text), normalizedRequested = normalizeIdentity(requested);
    let start = normalizedText.indexOf(normalizedRequested);
    while (start !== -1) {
        const before = normalizedText[start - 1] ?? "", after = normalizedText[start + normalizedRequested.length] ?? "";
        if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
        start = normalizedText.indexOf(normalizedRequested, start + 1);
    }
    return false;
}
export function validateWitnessOutput(testCase: Pick<SelectorDevelopmentCase, "question" | "exactQuote" | "candidates">, output: unknown) {
    const parsed = buildWitnessRequest(testCase).schema.safeParse(output);
    if (!parsed.success) throw new WitnessAssessmentError("INVALID_SCHEMA");
    const result = parsed.data;
    for (const requested of result.facets) {
        if (!requested.questionQuote.trim() || !testCase.question.includes(requested.questionQuote)
            || requested.constraints.some(constraint => !constraint.questionQuote.trim() || !testCase.question.includes(constraint.questionQuote))) {
            throw new WitnessAssessmentError("INVALID_QUESTION_SPAN");
        }
    }
    const selected: string[] = [], rejected: Array<{ id: string; reason: string }> = [], seen = new Set<string>();
    for (const assessment of result.assessments) {
        if (seen.has(assessment.id)) throw new WitnessAssessmentError("INVALID_SCHEMA");
        seen.add(assessment.id);
        const candidate = testCase.candidates.find(item => item.id === assessment.id)!;
        const requested = result.facets[assessment.facetIndex];
        if (!requested) throw new WitnessAssessmentError("INVALID_FACET");
        const validateQuote = (proof: z.infer<typeof witness>) => {
            const stored = candidate.fields.find(item => item.name === proof.field);
            if (!proof.quote.trim() || !stored?.text.includes(proof.quote)) throw new WitnessAssessmentError("INVALID_WITNESS");
        };
        assessment.support.forEach(validateQuote);
        const indexes = new Set<number>();
        if (assessment.constraintChecks.length !== requested.constraints.length) throw new WitnessAssessmentError("MISSING_CONSTRAINT_CHECK");
        for (const check of assessment.constraintChecks) {
            const constraint = requested.constraints[check.constraintIndex];
            if (!constraint || indexes.has(check.constraintIndex)) throw new WitnessAssessmentError("MISSING_CONSTRAINT_CHECK");
            indexes.add(check.constraintIndex);
            check.witnesses.forEach(validateQuote);
            if (check.status === "supported") {
                if (!check.witnesses.length) throw new WitnessAssessmentError("INVALID_WITNESS");
                if (constraint.kind === "entity" && !check.witnesses.some(proof => containsFullIdentity(proof.quote, constraint.questionQuote))) {
                    throw new WitnessAssessmentError("INVALID_ENTITY_WITNESS");
                }
            }
        }
        const supported = assessment.verdict === "direct" && assessment.constraintChecks.every(check => check.status === "supported");
        if (supported) {
            if (!assessment.support.length || (candidate.type === "reflection" && !assessment.support.some(proof => proof.field === "reflectionText"))) {
                throw new WitnessAssessmentError("INVALID_DIRECT_SUPPORT");
            }
            selected.push(candidate.id);
        } else rejected.push({ id: candidate.id, reason: assessment.verdict === "direct" ? "CONSTRAINT_NOT_ESTABLISHED" : assessment.verdict });
    }
    return { ids: selected, rejected, assessment: result };
}
function safeUsage(usage: unknown) {
    const input = usage && typeof usage === "object" ? usage as Record<string, unknown> : {};
    const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
    return { inputTokens: count(input.inputTokens), outputTokens: count(input.outputTokens), totalTokens: count(input.totalTokens) };
}
async function main() {
    const fixture = readSelectorDevelopmentFixture("selector-precision-v1.json");
    if (fixture.sha256 !== FIXTURE_SHA256) throw new Error("Frozen development fixture changed");
    const requests = fixture.cases.map(testCase => buildWitnessRequest(testCase));
    const plan = { version: WITNESS_EXPERIMENT_CONFIG.version, fixtureSha256: fixture.sha256, modelConfig: WITNESS_EXPERIMENT_CONFIG,
        expectedCases: 18, systemPromptSha256: requests[0].systemPromptSha256,
        moduleSha256: sha(readFileSync(resolve("tests/fixtures/retrieval/development/selector-witness-experiment.ts"))),
        requests: requests.map((request, index) => ({ caseId: fixture.cases[index].id, inputSha256: request.inputSha256, ...request.canonical })),
        limitations: ["DEVELOPMENT only; no held-out gate or deterministic semantic proof.", "The model may omit or underextract question constraints, or misjudge a quoted passage's meaning.",
            "Strict entity witnesses can reject valid evidence when identity is only outside supplied spans or expressed through an alias.",
            "The output cap is increased from700 to1600 tokens. Actual usage and latency are recorded; production is unchanged."],
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
    const model = createAnthropic({ apiKey: key })(WITNESS_EXPERIMENT_CONFIG.model);
    let stopped = false;
    for (let run = 1; run <= 3 && !stopped; run++) for (let caseIndex = 0; caseIndex < fixture.cases.length; caseIndex++) {
        if (records.length >= 18) throw new Error("Provider budget exceeded");
        const testCase = fixture.cases[caseIndex], request = requests[caseIndex];
        const started = performance.now();
        const record: Record<string, unknown> = { run, caseId: testCase.id, inputSha256: request.inputSha256, expectedIds: testCase.expectedIds,
            actualCalls: 1, passed: false, selectedIds: null, usage: null, independentReview: "pending" };
        try {
            const result = await generateText({ model, system: request.system, prompt: request.prompt, output: Output.object({ schema: request.schema }),
                maxOutputTokens: WITNESS_EXPERIMENT_CONFIG.maxOutputTokens, maxRetries: 0, abortSignal: AbortSignal.timeout(WITNESS_EXPERIMENT_CONFIG.timeoutMs) });
            Object.assign(record, { rawSyntheticOutput: result.output, usage: safeUsage(result.usage), model: result.response.modelId, responseId: result.response.id, finishReason: result.finishReason });
            const validated = validateWitnessOutput(testCase, result.output);
            Object.assign(record, { outcome: "complete", selectedIds: validated.ids, rejected: validated.rejected,
                passed: validated.ids.length === testCase.expectedIds.length && testCase.expectedIds.every(id => validated.ids.includes(id)) });
        } catch (error) {
            if (error instanceof WitnessAssessmentError) Object.assign(record, { outcome: "invalid_assessment", error: error.code });
            else if (NoObjectGeneratedError.isInstance(error)) Object.assign(record, { outcome: "invalid_structured_output", usage: safeUsage(error.usage),
                rawSyntheticText: error.text?.slice(0, 32_000), model: error.response?.modelId, finishReason: "unavailable" });
            else { Object.assign(record, { outcome: "provider_failure", error: "UNAVAILABLE" }); stopped = true; }
        }
        record.durationMs = performance.now() - started;
        records.push(record); persist("incomplete");
        if (stopped) break;
    }
    persist(records.length === 18 && !stopped ? "complete" : "incomplete");
    console.log(JSON.stringify({ outputPath: resolve(output), attemptedCalls: records.length, passedCases: records.filter(record => record.passed).length, expectedCases: 18 }));
}
if (!process.env.VITEST && process.argv[1]?.endsWith("selector-witness-experiment.ts")) {
    main().catch(() => { console.error("Witness development experiment failed; raw provider errors withheld."); process.exitCode = 1; });
}
