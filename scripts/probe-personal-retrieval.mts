/**
 * Explicit real-provider development probe. Sends synthetic text only.
 * Run: NODE_OPTIONS=--conditions=react-server npx tsx scripts/probe-personal-retrieval.mts
 * This is separate from the frozen retrieval benchmark and changes no threshold.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import type { HighlightEvidenceCandidate, PersonalEvidenceCandidate, ReflectionEvidenceCandidate } from "../lib/personal-evidence";
import {
    PERSONAL_EMBEDDING_DIMENSIONS,
    PERSONAL_EMBEDDING_MODEL,
    PERSONAL_RETRIEVAL_LIMITS,
    PersonalEvidenceRankingError,
    PersonalEvidenceVectorCache,
    rankPersonalEvidence,
    type PersonalEvidenceEmbedBatch,
} from "../lib/server/personal-evidence-ranking";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputPath = fileURLToPath(new URL("../tests/fixtures/retrieval/development-probe.json", import.meta.url));
const quotaDiagnosticOnly = process.argv.includes("--quota-diagnostic");
const previousArtifact = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) as { results: unknown[]; startedAt: string; previousAttempts?: unknown[] } : null;
const envFile = process.argv.find((arg) => arg.startsWith("--env-file="))?.slice("--env-file=".length) ?? resolve(root, ".env.local");
const key = process.env.GEMINI_API_KEY ?? (existsSync(envFile) ? parse(readFileSync(envFile)).GEMINI_API_KEY : undefined);
if (!key) throw new Error("Development embedding credentials are unavailable.");
const ai = new GoogleGenAI({ apiKey: key });
const ownerId = "synthetic-development-owner";
const stamp = "2026-01-01T00:00:00Z";
function base(id: string) {
    return {
        id, userId: ownerId, contentItemId: `source-${id}`, createdAt: stamp, updatedAt: stamp,
        fingerprint: createHash("sha256").update(id).digest("hex"), sourceStatus: "available" as const,
        source: { id: `source-${id}`, title: `Development source ${id}`, author: "Synthetic author", updatedAt: stamp },
    };
}
function highlight(id: string, highlightedText: string, noteBody: string | null = null): HighlightEvidenceCandidate {
    return {
        ...base(id), type: "highlight", evidenceId: `highlight:${id}`, highlightedText, noteBody,
        color: "yellow", segmentId: null, anchorStart: null, anchorEnd: null, segment: null, readerAnchor: null,
    };
}
const relevant: PersonalEvidenceCandidate[] = [
    highlight("continuity", "When a project depends on a single specialist, write down the operating procedure and train a second person before the first person takes leave."),
    highlight("disagreement", "Before assigning bad motives during a disagreement, identify the legitimate goals each person is trying to protect. Conflicts often come from competing priorities."),
    highlight("delayed-reply", "An angry rebuttal feels urgent while your pulse is racing. Draft it privately, leave it unsent, and reread it after your body has settled."),
    highlight("measurement", "A thermometer with a constant offset can show a smooth trend while reporting the wrong temperature. Compare the instrument against a known reference before trusting its absolute readings."),
    highlight("delegation-note", "A manager can delegate the task but remains responsible for making success criteria explicit.", "I disagree with requiring every decision to return to the manager; the person doing the work needs room to choose their own method."),
    {
        ...base("commitment-reflection"), type: "reflection", evidenceId: "reflection:commitment-reflection",
        prompt: "What did you change in your behavior this week?",
        reflectionText: "I used to accept every request immediately. This week I waited until the following morning before answering invitations, which gave me time to notice when I was overcommitting.",
    } as ReflectionEvidenceCandidate,
];
const candidates = [
    ...Array.from({ length: 1_195 }, (_, index) => highlight(`inventory-${String(index).padStart(4, "0")}`, `Warehouse record ${index}: carton ${index + 8000} contains replacement brackets. Shelf ${index % 38} was counted at the end of the shift; the delivery label is retained in the receiving log.`)),
    ...relevant,
];
const cases = [
    { id: "continuity-paraphrase", question: "How can a team keep functioning when its sole expert is unavailable?", expected: "highlight:continuity" },
    { id: "conflict-paraphrase", question: "What should I examine before assuming someone has hostile intentions when we argue?", expected: "highlight:disagreement" },
    { id: "emotion-paraphrase", question: "What can stop me from sending a message I will regret while I am furious?", expected: "highlight:delayed-reply" },
    { id: "measurement-paraphrase", question: "Why can a sensor look consistent and still be inaccurate, and how would I check it?", expected: "highlight:measurement" },
    { id: "personal-reflection-paraphrase", question: "What personal change helped me avoid making commitments too quickly?", expected: "reflection:commitment-reflection" },
    { id: "conflicting-user-note", question: "What did I disagree with about giving people work and autonomy?", expected: "highlight:delegation-note" },
    { id: "no-match-astronomy", question: "How do the auroras on Jupiter accelerate electrons?", expected: null },
    { id: "no-match-personal-booking", question: "Which Kyoto restaurant did I book for Friday?", expected: null },
];
type BatchRecord = { inputCount: number; inputBytes: number; maxInputBytes: number; durationMs: number; outcome: string; tokenCount: number | null; billableCharacters: number | null; providerStatus?: number; quota?: unknown; retryDelay?: string };
function quotaDetails(error: unknown) {
    // Allowlist provider quota fields only. Never save the raw error/message.
    try {
        const raw = JSON.parse(error instanceof Error ? error.message : "{}") as { error?: { details?: unknown[] }; details?: unknown[] };
        const details = raw.error?.details ?? raw.details ?? [];
        const safe: { quota?: unknown; retryDelay?: string } = {};
        for (const detail of details) {
            if (!detail || typeof detail !== "object") continue;
            const value = detail as { "@type"?: string; violations?: Array<{ quotaMetric?: string; quotaId?: string; quotaValue?: string; quotaDimensions?: { model?: string; location?: string } }>; retryDelay?: string };
            if (value["@type"]?.endsWith("QuotaFailure") && value.violations) {
                safe.quota = value.violations.map((violation) => ({
                    metric: violation.quotaMetric, id: violation.quotaId,
                    value: violation.quotaValue, model: violation.quotaDimensions?.model,
                    location: violation.quotaDimensions?.location,
                }));
            }
            if (value["@type"]?.endsWith("RetryInfo") && /^\d+(\.\d+)?s$/.test(value.retryDelay ?? "")) safe.retryDelay = value.retryDelay;
        }
        return safe;
    } catch { return {}; }
}
let batches: BatchRecord[] = [];
let active = 0;
let maximumConcurrency = 0;
const embedBatch: PersonalEvidenceEmbedBatch = async (texts, { signal }) => {
    active += 1;
    maximumConcurrency = Math.max(maximumConcurrency, active);
    const start = performance.now();
    const record: BatchRecord = {
        inputCount: texts.length, inputBytes: texts.reduce((total, text) => total + Buffer.byteLength(text), 0),
        maxInputBytes: Math.max(...texts.map((text) => Buffer.byteLength(text))), durationMs: 0,
        outcome: "pending", tokenCount: null, billableCharacters: null,
    };
    batches.push(record);
    try {
        const response = await ai.models.embedContent({
            model: PERSONAL_EMBEDDING_MODEL, contents: texts,
            config: { outputDimensionality: PERSONAL_EMBEDDING_DIMENSIONS, abortSignal: signal },
        });
        record.outcome = "success";
        const tokens = response.embeddings?.map((embedding) => embedding.statistics?.tokenCount);
        if (tokens?.length && tokens.every((value) => typeof value === "number")) record.tokenCount = tokens.reduce((total, count) => total! + count!, 0)!;
        record.billableCharacters = response.metadata?.billableCharacterCount ?? null;
        return (response.embeddings ?? []).map((embedding) => embedding.values ?? []);
    } catch (error) {
        record.outcome = signal.aborted ? "aborted" : "provider_error";
        const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
        if (typeof status === "number") record.providerStatus = status;
        Object.assign(record, quotaDetails(error));
        throw error;
    } finally {
        active -= 1;
        record.durationMs = Math.round(performance.now() - start);
    }
};
const results: Array<Record<string, unknown>> = [];
const cache = new PersonalEvidenceVectorCache();
const startedAt = new Date().toISOString();
async function runProbe(testCase: typeof cases[number], label: string, threshold: number) {
    batches = [];
    maximumConcurrency = 0;
    const started = performance.now();
    let record: Record<string, unknown>;
    try {
        const result = await rankPersonalEvidence({
            candidates: quotaDiagnosticOnly ? [relevant[0]] : candidates, ownerId, question: testCase.question, embedBatch, cache,
            deadlineAt: Date.now() + 35_000, similarityThreshold: threshold,
        });
        record = {
            caseId: testCase.id, run: label, question: testCase.question, threshold,
            expectedEvidenceId: testCase.expected, outcome: "success", durationMs: Math.round(performance.now() - started),
            expectedFound: testCase.expected === null ? result.items.length === 0 : result.items.some((item) => item.evidence.evidenceId === testCase.expected),
            selected: result.items.map((item) => ({ evidenceId: item.evidence.evidenceId, score: item.score, fields: item.spans.map((span) => span.field) })),
            stats: result.stats,
        };
    } catch (error) {
        record = {
            caseId: testCase.id, run: label, threshold, outcome: "error", durationMs: Math.round(performance.now() - started),
            errorCode: error instanceof PersonalEvidenceRankingError ? error.code : "UNCLASSIFIED_ERROR",
        };
    }
    const settleDeadline = Date.now() + 2_000;
    while (active > 0 && Date.now() < settleDeadline) await new Promise((resolve) => setTimeout(resolve, 25));
    batches.filter((batch) => batch.outcome === "pending").forEach((batch) => { batch.outcome = "cancellation_unsettled"; });
    // Do not persist provider errors, request headers, raw response objects, or credentials.
    record.provider = {
        batches: [...batches], requests: batches.length,
        inputCount: batches.reduce((total, batch) => total + batch.inputCount, 0),
        inputBytes: batches.reduce((total, batch) => total + batch.inputBytes, 0),
        maximumConcurrency,
        measuredTokenCount: batches.length > 0 && batches.every((batch) => batch.tokenCount !== null) ? batches.reduce((total, batch) => total + batch.tokenCount!, 0) : null,
        usdCost: null,
        costStatus: "Not measured: Developer API embedding responses may omit billable tokens; account billing was not queried. Input bytes are not tokens or a dollar estimate.",
    };
    results.push(record);
    writeArtifact();
    console.log(JSON.stringify({ caseId: testCase.id, run: label, outcome: record.outcome, durationMs: record.durationMs, providerRequests: batches.length }));
    return record.outcome === "success";
}
function writeArtifact() {
    writeFileSync(outputPath, `${JSON.stringify({
        version: "personal-retrieval-development-probe-v1", startedAt, lastUpdatedAt: new Date().toISOString(),
        applicationCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
        rankingModuleSha256: createHash("sha256").update(readFileSync(new URL("../lib/server/personal-evidence-ranking.ts", import.meta.url))).digest("hex"),
        purpose: "Independent synthetic development calibration and feasibility only; not the frozen 58-case benchmark and not release approval.",
        mode: quotaDiagnosticOnly ? "one-small-batch-after-initial-429" : "1201-candidate-cold-warm-and-development-questions",
        previousAttempts: previousArtifact ? [...(previousArtifact.previousAttempts ?? []), { startedAt: previousArtifact.startedAt, results: previousArtifact.results }] : [],
        model: PERSONAL_EMBEDDING_MODEL, dimensions: PERSONAL_EMBEDDING_DIMENSIONS, taskType: "provider default",
        limits: { ...PERSONAL_RETRIEVAL_LIMITS, probeDeadlineMs: 35_000 },
        corpus: { candidates: candidates.length, noiseCandidates: 1_195, relevantCandidates: relevant.length, utf8Bytes: Buffer.byteLength(JSON.stringify(candidates)), relevant, noiseRecipe: "Warehouse record N: carton N+8000 contains replacement brackets. Shelf N modulo38 was counted at end of shift; delivery label retained in receiving log." },
        methodology: "First question is run with an empty vector cache, then again with the same cache. Subsequent development questions reuse only candidate vectors. Diagnostic runs set an invocation-only threshold of -1 to observe top scores, without changing production threshold 0.55. One run per case; no quality confidence claim. Live database traversal/auth/generation are not included in timing.",
        assessment: quotaDiagnosticOnly ? {
            largeScope35SecondFeasibility: "Not established: the initial 1201-candidate attempt returned HTTP 429 before completion.",
            warm1201Latency: "Not measured; do not extrapolate from the single-record diagnostic.",
            providerAvailability: results.some((result) => result.outcome === "success") ? "The same embedding model/key successfully handled one small batch after the failed large attempt." : "The small diagnostic also failed.",
            quotaMetricAndTier: "Unknown: the original failed attempt retained HTTP status only; no quota metric, retry delay, or billing tier was observed. The successful diagnostic has no quota-error details.",
            causeOf429: "The failure occurred with four concurrent 100-input SDK calls, but this does not establish causality. It is unknown whether the applicable quota counted SDK requests, individual embedded documents, tokens, or another unit; concurrency was not varied in a controlled experiment.",
            originalInFlightCalls: "The first attempt recorded three pending calls before cancellation settled. Their final provider outcomes and charges were not observed.",
            thresholdCalibration: "One positive development paraphrase is insufficient to calibrate a semantic threshold. Production threshold was not changed.",
            frozenQualityGate: "Not run by this probe.",
        } : { releaseGate: "Development evidence only; not a frozen benchmark pass." },
        costLimitations: "No billing API queried. No dollar estimate is fabricated when billable token counts are absent. Provider cancellation may still incur charges.",
        results,
    }, null, 2)}\n`);
}

const coldPassed = await runProbe(cases[0], quotaDiagnosticOnly ? "single-small-quota-diagnostic" : "cold-1201", 0.55);
if (coldPassed && !quotaDiagnosticOnly) {
    await runProbe(cases[0], "warm-1201", 0.55);
    await runProbe(cases[0], "development-score-diagnostic", -1);
    for (const testCase of cases.slice(1)) {
        if (!await runProbe(testCase, "warm-corpus-new-question", 0.55)) break;
        await runProbe(testCase, "development-score-diagnostic", -1);
    }
}
console.log(JSON.stringify({ artifact: "tests/fixtures/retrieval/development-probe.json", runs: results.length, frozenQualityGate: "not run" }));
