/**
 * Offline plan by default. Real provider calls require an explicit --execute.
 * Run with NODE_OPTIONS=--conditions=react-server npx tsx scripts/evaluate-personal-retrieval.ts
 * This is a synthetic quality diagnostic, never database authorization or latency proof.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output, NoObjectGeneratedError, type LanguageModelUsage } from "ai";
import { detectAskIntent, getAnthropicModelName, getOutputTokenCap, getNotesOutputTokenCap, getNotesAnthropicModelName } from "../lib/server/retrieval-generation";
import type { PersonalEvidenceScope, PersonalEvidenceCandidate } from "../lib/personal-evidence";
import {
    chunkPersonalEvidenceText, rankPersonalEvidence, rankSourceEvidenceSpans,
    PersonalEvidenceVectorCache, PERSONAL_EMBEDDING_MODEL, PERSONAL_EMBEDDING_DIMENSIONS,
    type PersonalEvidenceEmbedBatch,
} from "../lib/server/personal-evidence-ranking";
import { composeLibraryEvidence, buildLibraryEvidencePrompt, type LibrarySourceEvidence } from "../lib/server/library-evidence";
import { exactPersonalQuoteField, buildPersonalEvidencePrompt } from "../lib/server/personal-retrieval";
import {
    PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG, PERSONAL_EVIDENCE_SELECTOR_LIMITS,
    canonicalPersonalEvidenceSelectionRequest, personalEvidenceSelectionRequestHash, selectPersonalEvidence, derivePersonalEvidenceSelectionIds, PersonalEvidenceSelectionError,
    type CanonicalPersonalEvidenceSelectionRequest, type PersonalEvidenceSelectionCandidate, type PersonalEvidenceSelectionRequest,
} from "../lib/server/personal-evidence-selector";

// Vitest's browser-like project config rewrites import.meta.url; the CLI uses its real module path.
const SCRIPT_PATH = process.env.VITEST ? resolve(process.cwd(), "scripts/evaluate-personal-retrieval.ts") : fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..");
export type CorpusVersion = "v1" | "v2";
const CORPUS_PATH = resolve(ROOT, "tests/fixtures/retrieval/corpus-v1.json");
// A draft cannot become provider evidence merely by changing an environment variable.
const FROZEN_V2_SHA256: string | null = "dd866de9d24c712e929085f240ca5a47760cab74ef15f4a60d829bc937d58608";
export const FROZEN_CORPUS_SHA256 = "b177ec05c47fa623269b3d089656c0e86c57b71c2d4764b0333e0da2805bfcef";
export const QUALITY_CONFIG = Object.freeze({
    version: "personal-retrieval-provider-quality-v1",
    runs: 3, threshold: 0.55, sourceThreshold: 0.55, evidenceItems: 8, evidenceBytes: 4_000,
    evidenceTokens: 4_000, embeddingModel: PERSONAL_EMBEDDING_MODEL, dimensions: PERSONAL_EMBEDDING_DIMENSIONS,
    embeddingTaskType: "provider default", notesModel: "claude-haiku-4-5-20251001", libraryModel: "claude-sonnet-4-6",
    notesSynthesisModel: "claude-sonnet-4-6", notesOutputTokens: 350, notesSynthesisOutputTokens: 450, libraryOutputTokens: 450, libraryHybridOutputTokens: 500, temperature: "provider default",
    // Quality vectors are acquired slowly once, then reused without altering them across runs.
    embeddingBatchSize: 10, minimumRequestSpacingMs: 2_000, maxRetries: 2, maxRetryWaitMs: 60_000,
    requestTimeoutMs: 60_000, maxEmbeddingInputsIncludingRetries: 2_048, maxEmbeddingInputBytesIncludingRetries: 2_000_000,
    maxProviderRequestsIncludingRetries: 650, maxGenerationAttempts: 200,
    maxReservedGenerationTokens: 1_800_000, maxSinglePromptTokens: 8_000,
});
export type EvidenceClass = "source_segment" | "highlight" | "reflection";
export type FixtureEvidence = {
    id: string; type: EvidenceClass; accountId: string; contentId: string; segmentId: string | null;
    title: string; text: string; note: string | null; prompt: string | null; state: string; createdAt: string;
    lifecycle?: { record: "present" | "user_deleted"; source: "available" | "withdrawn" };
};
export type FixtureCase = {
    id: string; class: EvidenceClass | "mixed" | "abstention" | "exclusion"; kind: string; query: string;
    scope: EvidenceClass[]; requiredIds: string[]; eligibleIds: string[]; distractorIds: string[];
    exactQuote: string | null; abstentionRequired: boolean;
    forbiddenIds?: string[];
    supportFacets?: Array<{ id: string; description: string; anyOfIds: string[]; requiredFields: Array<{ evidenceId: string; field: string; contains: string }> }>;
    acceptableEvidenceSets?: string[][];
    exactQuoteTarget?: { evidenceId: string; field: string } | null;
    request?: { surface: "notes" | "library"; accountId: "account-a"; sessionState: "valid" | "revoked"; notesScope: PersonalEvidenceScope | null };
};
export type Corpus = {
    version: string; evidence: FixtureEvidence[]; cases: FixtureCase[];
    corpusExpansion: { noisePerPersonalClass: number; noiseText: string; createdAt: string };
    thresholds: { recallMacro: number; recallPerClass: number; recallPerRunMacro: number; recallPerRunClass: number;
        irrelevantRejection: number; abstention: number; rejectionAndAbstentionPerRun: number;
        exactQuoteFidelity: number; forbiddenEvidenceExclusion: number; independentModelRuns: number };
};
const CLASSES: EvidenceClass[] = ["source_segment", "highlight", "reflection"];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export function corpusHash(corpus: Corpus): string {
    if (corpus.version === "personal-retrieval-v1") return FROZEN_CORPUS_SHA256;
    if (corpus.version === "personal-retrieval-v2" && FROZEN_V2_SHA256) return FROZEN_V2_SHA256;
    throw new Error("CORPUS_VERSION_NOT_FROZEN");
}
export function readFrozenCorpus(version: string = "v1"): Corpus {
    if (version !== "v1" && version !== "v2") throw new Error("UNKNOWN_CORPUS_VERSION");
    if (version === "v2" && !FROZEN_V2_SHA256) throw new Error("CORPUS_V2_NOT_FROZEN");
    const raw = readFileSync(version === "v1" ? CORPUS_PATH : resolve(ROOT, "tests/fixtures/retrieval/corpus-v2.json"), "utf8");
    if (sha(raw) !== (version === "v1" ? FROZEN_CORPUS_SHA256 : FROZEN_V2_SHA256)) throw new Error("FROZEN_CORPUS_CHANGED");
    const corpus = JSON.parse(raw) as Corpus;
    if (corpus.cases.length !== 58 || corpus.thresholds.independentModelRuns !== QUALITY_CONFIG.runs) throw new Error("FROZEN_CONTRACT_MISMATCH");
    return corpus;
}
export function expandedEvidence(corpus: Corpus): FixtureEvidence[] {
    const noise = (["highlight", "reflection"] as const).flatMap((type) =>
        Array.from({ length: corpus.corpusExpansion.noisePerPersonalClass }, (_, index) => ({
            id: `noise-${type}-${index}`, type, accountId: "account-a", contentId: `noise-content-${index}`,
            segmentId: null, title: `Inventory ${index}`, text: corpus.corpusExpansion.noiseText,
            note: null, prompt: type === "reflection" ? "What was recorded?" : null,
            state: "available", createdAt: corpus.corpusExpansion.createdAt,
        })));
    return [...noise, ...corpus.evidence];
}
export function canonicalId(row: FixtureEvidence): string {
    return `${row.type}:${row.type === "source_segment" ? row.segmentId ?? row.id : row.id}`;
}
/** Only scope, account and availability define candidates. Evaluation labels are inaccessible here. */
export function scopedRows(rows: FixtureEvidence[], scope: readonly EvidenceClass[]): FixtureEvidence[] {
    return rows.filter((row) => row.accountId === "account-a" && row.state === "available" && scope.includes(row.type));
}
export function personalCandidate(row: FixtureEvidence): PersonalEvidenceCandidate {
    if (row.type === "source_segment") throw new Error("SOURCE_IS_NOT_PERSONAL");
    const common = {
        evidenceId: canonicalId(row), id: row.id, userId: row.accountId, contentItemId: row.contentId,
        createdAt: row.createdAt, updatedAt: row.createdAt, fingerprint: sha(JSON.stringify(row)),
        sourceStatus: "available" as const, source: { id: row.contentId, title: row.title, author: null, updatedAt: row.createdAt },
    };
    return row.type === "reflection"
        ? { ...common, type: "reflection", prompt: row.prompt ?? "", reflectionText: row.text }
        : { ...common, type: "highlight", highlightedText: row.text, noteBody: row.note, color: "yellow",
            segmentId: row.segmentId, anchorStart: null, anchorEnd: null, segment: null, readerAnchor: null };
}
export function sourceCandidate(row: FixtureEvidence, score: number): LibrarySourceEvidence {
    return { type: "source_segment", evidenceId: canonicalId(row), id: row.segmentId ?? row.id,
        contentItemId: row.contentId, title: row.title, text: row.text, fingerprint: sha(JSON.stringify(row)), score };
}
function cosine(left: number[], right: number[]) {
    const a = Math.hypot(...left); const b = Math.hypot(...right);
    if (left.length !== QUALITY_CONFIG.dimensions || right.length !== left.length || !a || !b || !left.every(Number.isFinite) || !right.every(Number.isFinite)) throw new Error("INVALID_PROVIDER_VECTOR");
    return left.reduce((sum, value, index) => sum + value / a * (right[index] / b), 0);
}
/** Collect text without consulting required/eligible/distractor labels. Identical texts share one vector. */
export function embeddingInputs(corpus: Corpus): string[] {
    const texts = new Set(corpus.cases.map((item) => item.query));
    // Include forbidden synthetic records in the bank so a later DB exclusion
    // test cannot pass merely because their embeddings were never materialized.
    for (const row of expandedEvidence(corpus)) {
        const fields = row.type === "source_segment" ? [row.text] : [row.text, row.note ?? "", row.prompt ?? ""];
        for (const field of fields) for (const chunk of chunkPersonalEvidenceText(field)) texts.add(chunk.text);
    }
    return [...texts].sort();
}
export type VectorBank = Map<string, number[]>;
export type EmbeddingResponseRecord = { texts: string[]; vectors: number[][]; tokenCount: number | null; billableCharacters: number | null };
type ProviderEvent = { kind: string; attempt: number; outcome: string; durationMs: number; status?: number;
    retryAfterMs?: number; errorName?: string; transportCode?: string };
/** A database runner can seed real vectors without a provider key in CI. No access proof is implied. */
export function databaseVectorFixture(corpus: Corpus, bank: VectorBank) {
    return {
        version: "personal-retrieval-provider-vectors-v1", corpusSha256: corpusHash(corpus),
        model: QUALITY_CONFIG.embeddingModel, dimensions: QUALITY_CONFIG.dimensions, taskType: QUALITY_CONFIG.embeddingTaskType,
        encoding: "base64 of 768 IEEE-754 float32 little-endian values; vector key is SHA256 of exact UTF-8 text",
        vectors: Object.fromEntries([...bank].map(([text, vector]) => {
            const bytes = Buffer.alloc(vector.length * 4);
            vector.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
            return [sha(text), { text, float32leBase64: bytes.toString("base64") }];
        })),
        queries: corpus.cases.map((item) => ({ caseId: item.id, text: item.query, vectorKey: sha(item.query) })),
        records: expandedEvidence(corpus).map((row) => {
            const fields = row.type === "source_segment" ? [{ field: "source_text", text: row.text }]
                : row.type === "highlight" ? [{ field: "highlightedText", text: row.text }, { field: "noteBody", text: row.note ?? "" }]
                    : [{ field: "reflectionText", text: row.text }, { field: "prompt", text: row.prompt ?? "" }];
            return { ...row, canonicalId: canonicalId(row), chunks: fields.flatMap(({ field, text }) =>
                chunkPersonalEvidenceText(text).map((chunk, index) => ({ field, chunk_index: index, start_offset: chunk.start,
                    end_offset: chunk.end, vectorKey: sha(chunk.text) }))) };
        }),
        boundaries: "Fixture state is metadata, not database enforcement. Runner must seed two actual auth accounts, valid UUID mappings, live memberships/deletions/revocations and indexed revisions, then invoke production RPCs under ordinary authenticated identity. Never seed only expected IDs.",
    };
}
export function readDatabaseVectorFixture(corpus: Corpus, path: string): { bank: VectorBank; sha256: string } {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as ReturnType<typeof databaseVectorFixture>;
    if (parsed.version !== "personal-retrieval-provider-vectors-v1" || parsed.corpusSha256 !== corpusHash(corpus)
        || parsed.model !== QUALITY_CONFIG.embeddingModel || parsed.dimensions !== QUALITY_CONFIG.dimensions
        || parsed.taskType !== QUALITY_CONFIG.embeddingTaskType || !parsed.vectors || typeof parsed.vectors !== "object") throw new Error("VECTOR_FIXTURE_CONFIGURATION_MISMATCH");
    const texts = embeddingInputs(corpus);
    if (Object.keys(parsed.vectors).length !== texts.length) throw new Error("VECTOR_FIXTURE_INPUT_SET_MISMATCH");
    const bank: VectorBank = new Map();
    for (const text of texts) {
        const item = parsed.vectors[sha(text)];
        if (!item || item.text !== text || typeof item.float32leBase64 !== "string"
            || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.float32leBase64)) throw new Error("VECTOR_FIXTURE_INPUT_MISMATCH");
        const bytes = Buffer.from(item.float32leBase64, "base64");
        if (bytes.length !== QUALITY_CONFIG.dimensions * 4 || bytes.toString("base64") !== item.float32leBase64) throw new Error("VECTOR_FIXTURE_DIMENSIONS_MISMATCH");
        const vector = Array.from({ length: QUALITY_CONFIG.dimensions }, (_, index) => bytes.readFloatLE(index * 4));
        cosine(vector, vector);
        bank.set(text, vector);
    }
    // Fields/IDs always come from the hash-pinned local corpus; imported record mappings cannot alter authorization.
    return { bank, sha256: sha(raw) };
}
/** Resume only successful, exact-input vectors; an uncertain failed request is never treated as success. */
export function readAcquisitionCheckpoint(corpus: Corpus, path: string) {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { corpusSha256?: string; config?: Record<string, unknown>;
        embeddingResponses?: EmbeddingResponseRecord[]; records?: QualityRecord[]; events?: ProviderEvent[];
        counters?: { embeddingInputs: number; embeddingInputBytes: number; generationAttempts: number; reservedGenerationTokens: number } };
    if (parsed.corpusSha256 !== corpusHash(corpus) || !parsed.config
        || !Object.entries(QUALITY_CONFIG).every(([key, value]) => JSON.stringify(parsed.config?.[key]) === JSON.stringify(value))
        || !Array.isArray(parsed.embeddingResponses) || !Array.isArray(parsed.records) || parsed.records.length !== 0
        || !Array.isArray(parsed.events) || !parsed.counters) throw new Error("ACQUISITION_CHECKPOINT_CONFIGURATION_MISMATCH");
    const allowed = new Set(embeddingInputs(corpus));
    const bank: VectorBank = new Map();
    const responses: EmbeddingResponseRecord[] = parsed.embeddingResponses.map((record) => {
        if (!Array.isArray(record.texts) || !Array.isArray(record.vectors) || record.texts.length !== record.vectors.length
            || record.texts.length < 1 || record.texts.length > QUALITY_CONFIG.embeddingBatchSize) throw new Error("ACQUISITION_CHECKPOINT_BATCH_INVALID");
        record.texts.forEach((text, index) => {
            if (!allowed.has(text) || bank.has(text)) throw new Error("ACQUISITION_CHECKPOINT_INPUT_INVALID");
            cosine(record.vectors[index], record.vectors[index]); bank.set(text, record.vectors[index]);
        });
        const measurement = (value: number | null) => value !== null && Number.isFinite(value) && value >= 0 ? value : null;
        return { texts: record.texts, vectors: record.vectors, tokenCount: measurement(record.tokenCount), billableCharacters: measurement(record.billableCharacters) };
    });
    const counters = parsed.counters;
    if (!Object.values(counters).every((value) => Number.isInteger(value) && value >= 0)
        || counters.embeddingInputs < bank.size || counters.embeddingInputs > QUALITY_CONFIG.maxEmbeddingInputsIncludingRetries
        || counters.embeddingInputBytes < [...bank.keys()].reduce((sum, text) => sum + Buffer.byteLength(text, "utf8"), 0)
        || counters.embeddingInputBytes > QUALITY_CONFIG.maxEmbeddingInputBytesIncludingRetries
        || counters.generationAttempts !== 0 || counters.reservedGenerationTokens !== 0
        || parsed.events.length > QUALITY_CONFIG.maxProviderRequestsIncludingRetries) throw new Error("ACQUISITION_CHECKPOINT_COUNTERS_INVALID");
    const events: ProviderEvent[] = parsed.events.map((event) => {
        if (event.kind !== "google-embedding" || !Number.isInteger(event.attempt) || event.attempt < 0 || event.attempt > QUALITY_CONFIG.maxRetries
            || !Number.isFinite(event.durationMs) || event.durationMs < 0) throw new Error("ACQUISITION_CHECKPOINT_EVENT_INVALID");
        const safe = safeProviderFailure({ status: event.status, name: event.errorName, cause: { code: event.transportCode } });
        return { kind: event.kind, attempt: event.attempt, durationMs: event.durationMs,
            outcome: event.outcome === "success" ? "success" : safe.code, status: safe.status, errorName: safe.errorName,
            transportCode: safe.transportCode,
            ...(typeof event.retryAfterMs === "number" && Number.isFinite(event.retryAfterMs) && event.retryAfterMs >= 0 ? { retryAfterMs: event.retryAfterMs } : {}) };
    });
    if (events.filter((event) => event.outcome === "success").length !== responses.length) throw new Error("ACQUISITION_CHECKPOINT_SUCCESS_COUNT_MISMATCH");
    return { bank, sha256: sha(raw), responses, counters, events, reusedInputs: bank.size, missingInputs: allowed.size - bank.size };
}
function bankEmbedder(bank: VectorBank): PersonalEvidenceEmbedBatch {
    return async (texts) => texts.map((text) => {
        const vector = bank.get(text);
        if (!vector) throw new Error("MISSING_RECORDED_PROVIDER_VECTOR");
        return vector;
    });
}
export type RetrievedCase = {
    selectedIds: string[]; contextText: string; contextBytes: number;
    branch: "model" | "exact_quote" | "no_evidence" | "quote_too_large";
    deterministicText: string | null; system: string; model: string; maxOutputTokens: number;
    selected: Array<{ id: string; score: number; spans: Array<{ field: string; start: number; end: number; text: string }> }>;
    personalCandidateCount: number; sourceCandidateCount: number;
};
export async function retrieveFixtureCase(corpus: Corpus, testCase: FixtureCase, bank: VectorBank): Promise<RetrievedCase> {
    const allRows = expandedEvidence(corpus);
    const rows = scopedRows(allRows, testCase.scope);
    const candidates = rows.filter((row) => row.type !== "source_segment").map(personalCandidate);
    const isLibrary = testCase.scope.includes("source_segment");
    const embedBatch = bankEmbedder(bank);
    const queryEmbedding = bank.get(testCase.query);
    if (!queryEmbedding) throw new Error("MISSING_QUERY_VECTOR");
    const detectedQuote = exactPersonalQuoteField(testCase.query);
    const isPersonalQuote = !isLibrary || /\b(highlights?|notes?|reflections?|i wrote|i reflected|i highlighted)\b/i.test(testCase.query);
    const quoteField = detectedQuote === "highlightedText" && testCase.scope.length === 1 && testCase.scope[0] === "reflection"
        ? "reflectionText" : detectedQuote;
    // Fresh production cache per evaluation; provider vectors are replayed without quality alterations.
    const personal = await rankPersonalEvidence({ candidates, ownerId: "account-a", question: testCase.query,
        embedBatch, queryEmbedding, cache: new PersonalEvidenceVectorCache(), similarityThreshold: QUALITY_CONFIG.threshold,
        ...(isPersonalQuote && quoteField ? { exactQuote: { field: quoteField } } : {}),
    });
    const sourceRows = rows.filter((row) => row.type === "source_segment");
    // Diagnostic only: exact cosine over real fixture vectors is NOT the database production RPC.
    const sources = sourceRows.map((row) => sourceCandidate(row, cosine(queryEmbedding, bank.get(row.text)!)))
        .filter((row) => row.score >= QUALITY_CONFIG.sourceThreshold)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, QUALITY_CONFIG.evidenceItems);
    const sourceSpans = await rankSourceEvidenceSpans({ sources, ownerId: "account-a", queryEmbedding, embedBatch,
        cache: new PersonalEvidenceVectorCache() });
    const rankedSources = sources.map((source) => ({ ...source, span: sourceSpans.spans.find((span) => span.id === source.id) }));
    const combined = isLibrary ? composeLibraryEvidence(personal, rankedSources)
        : { contextText: personal.contextText, evidenceIds: personal.items.map((item) => item.evidence.evidenceId) };
    const identity = new Map(allRows.map((row) => [canonicalId(row), row.id]));
    let selectedIds = combined.evidenceIds.map((id) => identity.get(id)!);
    let branch: RetrievedCase["branch"] = selectedIds.length ? "model" : "no_evidence";
    let deterministicText: string | null = branch === "no_evidence"
        ? isLibrary ? "I couldn’t find enough relevant evidence in your saved sources, highlights, notes, or reflections to answer that. Try a more specific question."
            : "I couldn’t find enough relevant evidence in your current notes scope to answer that. Try a more specific question or adjust the filters." : null;
    const quoted = personal.items.find((item) => item.exactQuote !== null);
    if (quoted?.exactQuote != null) {
        branch = "exact_quote"; deterministicText = quoted.exactQuote; selectedIds = [quoted.evidence.id];
    } else if (isLibrary && detectedQuote && !isPersonalQuote) {
        const source = rankedSources[0];
        if (source && Buffer.byteLength(source.text, "utf8") <= QUALITY_CONFIG.evidenceBytes) {
            branch = "exact_quote"; deterministicText = source.text; selectedIds = [identity.get(source.evidenceId)!];
        } else {
            branch = source ? "quote_too_large" : "no_evidence";
            deterministicText = source ? "The matching stored passage is too long to quote completely here. Open the source to read its full text."
                : "I couldn’t find a current saved source passage to quote exactly.";
            selectedIds = [];
        }
    }
    const contextText = combined.contextText;
    const metadataContext = "Synthetic library source titles: " + [...new Set(scopedRows(corpus.evidence, ["source_segment"]).map((row) => row.title))].join("; ");
    const intent = /\b(highlights?|notes?|reflections?|i wrote|i reflected|i highlighted)\b/i.test(testCase.query) ? "hybrid" : "content_synthesis";
    const system = isLibrary ? buildLibraryEvidencePrompt(metadataContext, contextText, intent)
        : buildPersonalEvidencePrompt({ contextText, candidateCount: candidates.length, items: personal.items });
    const notesSynthesis = /\b(compare|comparison|summar(?:ize|ise)|theme|themes|pattern|patterns|tension|contradiction|overlap|across)\b/i.test(testCase.query);
    return { selectedIds, contextText, contextBytes: Buffer.byteLength(contextText, "utf8"), branch, deterministicText, system,
        model: isLibrary ? QUALITY_CONFIG.libraryModel : QUALITY_CONFIG.notesModel,
        maxOutputTokens: isLibrary ? intent === "hybrid" ? QUALITY_CONFIG.libraryHybridOutputTokens : QUALITY_CONFIG.libraryOutputTokens
            : notesSynthesis ? QUALITY_CONFIG.notesSynthesisOutputTokens : QUALITY_CONFIG.notesOutputTokens,
        personalCandidateCount: candidates.length, sourceCandidateCount: sourceRows.length,
        selected: [
            ...personal.items.map((item) => ({ id: item.evidence.id, score: item.score, spans: item.spans })),
            ...rankedSources.map((item) => ({ id: identity.get(item.evidenceId)!, score: item.score,
                spans: item.span ? [{ field: "source_text", ...item.span }] : [] })),
        ].filter((item) => selectedIds.includes(item.id)),
    };
}

export type QualityRecord = {
    caseId: string; run: number; outcome: "complete" | "error"; selectedIds: string[];
    contextText: string; responseText: string | null; branch: RetrievedCase["branch"] | "error";
    errorCode?: string; modelCalled: boolean; evidenceTokenCount: number | null;
    input?: RetrievedCase & { query: string };
    tokenMeasurements?: { evidence?: TokenMeasurement; prompt?: TokenMeasurement };
    modelResult?: { text: string; finishReason: string; responseId: string; modelId: string; inputTokens: number | null;
        outputTokens: number | null; totalTokens: number | null; promptCountEstimate: number };
};
export type Adjudication = { caseId: string; run: number; reviewer: string; reviewerKind?: "human" | "ai"; independent?: boolean; rubricSha256?: string; responseSha256: string;
    abstained: boolean; grounded: boolean; answerComplete?: boolean; noteAttributionCorrect: boolean | null };
const ratio = (passed: number, total: number) => ({ passed, total, rate: total ? passed / total : null });
/** Additional v2 rubric outcomes; these never replace required-ID recall or silently change its denominator. */
export function fixtureSupportOutcomes(testCase: FixtureCase, selectedIds: readonly string[], contextText: string) {
    const facets = (testCase.supportFacets ?? []).map((facet) => {
        const selected = facet.anyOfIds.filter((id) => selectedIds.includes(id));
        const fields = facet.requiredFields.filter((field) => selected.includes(field.evidenceId));
        return { id: facet.id, selectedEvidenceIds: selected, covered: selected.length > 0,
            fieldsPresent: fields.every((field) => contextText.includes(field.contains)) };
    });
    return { caseId: testCase.id, facets, allFacetsCovered: facets.every((facet) => facet.covered),
        selectedFacetFieldsPresent: facets.every((facet) => facet.fieldsPresent),
        acceptableSetPresent: testCase.acceptableEvidenceSets ? testCase.acceptableEvidenceSets.some((set) => set.every((id) => selectedIds.includes(id)))
            && selectedIds.every((id) => testCase.eligibleIds.includes(id)) : null,
        forbiddenIdsExcluded: !(testCase.forbiddenIds ?? []).some((id) => selectedIds.includes(id)),
        interpretation: "Supplementary rubric outcomes; required-ID recall is unchanged. Field-presence is not answer-attribution proof." };
}
/** V2 authorization oracle mirrors frozen fixture data and the actual request, never relevance labels. */
export function authorizedFixtureRows(corpus: Corpus, testCase: FixtureCase): FixtureEvidence[] {
    if (!testCase.request) return scopedRows(corpus.evidence, testCase.scope);
    const request = testCase.request;
    if (request.sessionState !== "valid") return [];
    const rows = expandedEvidence(corpus);
    const sourceUnavailable = (contentId: string) => rows.some((row) => row.contentId === contentId
        && (row.lifecycle?.source === "withdrawn" || row.type === "source_segment" && row.state === "withdrawn"));
    const contents = new Map(rows.map((row) => [row.contentId, row.title]));
    const segmentTitles = new Map<string, string>();
    for (const row of [...rows.filter((row) => row.type === "source_segment"), ...rows.filter((row) => row.type !== "source_segment")])
        if (row.segmentId && !segmentTitles.has(row.segmentId)) segmentTitles.set(row.segmentId, row.title);
    return rows.filter((row) => {
        if (row.accountId !== request.accountId || (row.lifecycle ? row.lifecycle.record !== "present" : row.state === "user_deleted")) return false;
        if (row.type === "source_segment") return request.surface === "library" && !sourceUnavailable(row.contentId);
        if (request.surface === "library") return true;
        const scope = request.notesScope;
        if (!scope || scope.contentItemId && scope.contentItemId !== row.contentId) return false;
        const note = Boolean(row.note?.trim());
        if (scope.itemType === "reflection" && row.type !== "reflection"
            || scope.itemType === "note" && (row.type !== "highlight" || !note)
            || scope.itemType === "highlight" && (row.type !== "highlight" || note)) return false;
        // The frozen DB adapter seeds highlights yellow; reflections never match color filters.
        if (scope.color && (row.type !== "highlight" || scope.color !== "yellow")) return false;
        const query = scope.filterQuery?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
        if (!query) return true;
        const metadata = sourceUnavailable(row.contentId) ? [] : [contents.get(row.contentId) ?? "",
            row.type === "highlight" && row.segmentId ? segmentTitles.get(row.segmentId) ?? "" : ""];
        // Fixture authors are null. SQL matches literal substrings, not semantic query terms.
        const fields = row.type === "highlight" ? [row.text, row.note ?? "", ...metadata] : [row.text, row.prompt ?? "", ...metadata];
        return fields.some((field) => field.toLowerCase().includes(query));
    });
}
export function fixtureExclusionPass(corpus: Corpus, testCase: FixtureCase, record: Pick<QualityRecord, "selectedIds" | "contextText" | "responseText">): boolean {
    if (!testCase.request) {
        const allowed = new Set(scopedRows(corpus.evidence, testCase.scope).map((row) => row.id));
        const text = `${record.contextText}\n${record.responseText ?? ""}`;
        return record.selectedIds.every((id) => id.startsWith("noise-") || allowed.has(id))
            && corpus.evidence.filter((row) => row.accountId !== "account-a" || row.state !== "available")
                .every((row) => !record.selectedIds.includes(row.id) && !text.includes(row.text));
    }
    const allowed = authorizedFixtureRows(corpus, testCase); const ids = new Set(allowed.map((row) => row.id));
    if (!record.selectedIds.every((id) => ids.has(id))) return false;
    const fields = (row: FixtureEvidence) => [row.text, row.note ?? "", row.prompt ?? ""].filter((field) => field.trim().length > 0);
    const authorizedText = allowed.flatMap(fields); const text = `${record.contextText}\n${record.responseText ?? ""}`;
    // Shared wording cannot identify a forbidden origin; selected IDs and independent attribution review disambiguate it.
    return expandedEvidence(corpus).filter((row) => !ids.has(row.id)).every((row) => fields(row).every((field) =>
        authorizedText.some((allowedField) => allowedField.includes(field)) || !text.includes(field)));
}
export function scoreQuality(corpus: Corpus, records: QualityRecord[], reviews: Adjudication[] = [], requireIndependentReview = false) {
    const expected = corpus.cases.length * QUALITY_CONFIG.runs;
    const keys = new Set(records.map((record) => `${record.run}:${record.caseId}`));
    const valid = records.filter((record) => record.outcome === "complete" && record.run >= 1 && record.run <= QUALITY_CONFIG.runs && corpus.cases.some((item) => item.id === record.caseId));
    const complete = records.length === expected && keys.size === expected && valid.length === expected;
    const reviewFor = (record: QualityRecord) => reviews.find((review) => review.caseId === record.caseId && review.run === record.run
        && (!requireIndependentReview || ((review.reviewerKind === "human" || review.reviewerKind === "ai") && review.independent === true && review.rubricSha256 === corpusHash(corpus))) && review.reviewer.trim() && review.responseSha256 === sha(record.responseText ?? ""));
    const results = Array.from({ length: QUALITY_CONFIG.runs }, (_, index) => {
        const run = index + 1;
        const runRecords = valid.filter((record) => record.run === run);
        const lookup = (item: FixtureCase) => runRecords.find((record) => record.caseId === item.id);
        const perClass = Object.fromEntries(CLASSES.map((type) => {
            const cases = corpus.cases.filter((item) => item.requiredIds.some((id) => corpus.evidence.find((row) => row.id === id)?.type === type));
            // Equal case weight within class. Mixed cases contribute one opportunity to each class.
            const recalls = cases.map((item) => {
                const ids = item.requiredIds.filter((id) => corpus.evidence.find((row) => row.id === id)?.type === type);
                return ids.filter((id) => lookup(item)?.selectedIds.includes(id)).length / ids.length;
            });
            return [type, ratio(recalls.reduce((a, b) => a + b, 0), cases.length)];
        })) as Record<EvidenceClass, ReturnType<typeof ratio>>;
        const rejectionCases = corpus.cases;
        const rejection = ratio(rejectionCases.filter((item) => {
            const record = lookup(item);
            return record && record.selectedIds.every((id) => item.eligibleIds.includes(id));
        }).length, rejectionCases.length);
        const abstentionCases = corpus.cases.filter((item) => item.abstentionRequired);
        const abstention = ratio(abstentionCases.filter((item) => {
            const record = lookup(item);
            return record && (record.branch === "no_evidence" || reviewFor(record)?.abstained === true);
        }).length, abstentionCases.length);
        const exactCases = corpus.cases.filter((item) => item.exactQuote !== null);
        const exact = ratio(exactCases.filter((item) => lookup(item)?.branch === "exact_quote" && lookup(item)?.responseText === item.exactQuote).length, exactCases.length);
        // All cases are checked, not only the eight deliberately forbidden-witness queries.
        const exclusion = ratio(corpus.cases.filter((item) => {
            const record = lookup(item);
            if (!record) return false;
            return fixtureExclusionPass(corpus, item, record);
        }).length, corpus.cases.length);
        return { run, perClass, recallMacro: CLASSES.reduce((sum, type) => sum + perClass[type].rate!, 0) / CLASSES.length,
            irrelevantRejection: rejection, abstention, exactQuoteFidelity: exact, forbiddenEvidenceExclusion: exclusion };
    });
    const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const aggregateClasses = Object.fromEntries(CLASSES.map((type) => [type, average(results.map((run) => run.perClass[type].rate!))])) as Record<EvidenceClass, number>;
    const aggregate = { recallPerClass: aggregateClasses, recallMacro: average(Object.values(aggregateClasses)),
        irrelevantRejection: average(results.map((run) => run.irrelevantRejection.rate!)),
        abstention: average(results.map((run) => run.abstention.rate!)),
        exactQuoteFidelity: average(results.map((run) => run.exactQuoteFidelity.rate!)),
        forbiddenEvidenceExclusion: average(results.map((run) => run.forbiddenEvidenceExclusion.rate!)) };
    const limits = corpus.thresholds;
    const thresholdPass = complete && aggregate.recallMacro >= limits.recallMacro
        && Object.values(aggregateClasses).every((value) => value >= limits.recallPerClass)
        && aggregate.irrelevantRejection >= limits.irrelevantRejection && aggregate.abstention >= limits.abstention
        && aggregate.exactQuoteFidelity === limits.exactQuoteFidelity && aggregate.forbiddenEvidenceExclusion === limits.forbiddenEvidenceExclusion
        && results.every((run) => run.recallMacro >= limits.recallPerRunMacro
            && CLASSES.every((type) => run.perClass[type].rate! >= limits.recallPerRunClass)
            && run.irrelevantRejection.rate! >= limits.rejectionAndAbstentionPerRun && run.abstention.rate! >= limits.rejectionAndAbstentionPerRun);
    const generated = valid.filter((record) => record.modelCalled);
    const reviewed = generated.filter((record) => reviewFor(record));
    const conflictCases = corpus.cases.filter((item) => item.exactQuote === null && item.requiredIds.some((id) => corpus.evidence.find((row) => row.id === id)?.note));
    const conflictContext = conflictCases.flatMap((item) => Array.from({ length: QUALITY_CONFIG.runs }, (_, index) => {
        const record = valid.find((row) => row.caseId === item.id && row.run === index + 1);
        const notes = item.requiredIds.map((id) => corpus.evidence.find((row) => row.id === id)?.note).filter((note): note is string => Boolean(note));
        return { caseId: item.id, run: index + 1, fullStoredNotePresent: Boolean(record && notes.every((note) => record.contextText.includes(note))),
            attributionReview: record?.modelCalled ? reviewFor(record)?.noteAttributionCorrect ?? null : "not-model-dependent" };
    }));
    const tokenProofComplete = complete && valid.every((record) => record.evidenceTokenCount !== null && record.evidenceTokenCount <= QUALITY_CONFIG.evidenceTokens);
    const answerReviewComplete = reviewed.length === generated.length;
    const answersGrounded = answerReviewComplete && reviewed.every((record) => reviewFor(record)?.grounded);
    const answersComplete = answerReviewComplete && reviewed.every((record) => !requireIndependentReview || reviewFor(record)?.answerComplete === true);
    const conflictPass = conflictContext.every((record) => record.fullStoredNotePresent
        && (record.attributionReview === "not-model-dependent" || record.attributionReview === true));
    const actualGenerationUsageComplete = generated.every((record) => record.modelResult?.inputTokens != null && record.modelResult.outputTokens != null);
    return { complete, expectedRecords: expected, actualRecords: records.length, runs: results, aggregate,
        numericalThresholdsPass: thresholdPass, tokenProofComplete,
        providerDiagnosticVerdict: !complete || !tokenProofComplete || !actualGenerationUsageComplete || !answerReviewComplete
            ? "INCOMPLETE" : thresholdPass && answersGrounded && answersComplete && conflictPass ? "THRESHOLDS_MET_IN_DIAGNOSTIC_ONLY" : "FAILED",
        actualGenerationUsageComplete,
        answerReview: { required: generated.length, reviewed: reviewed.length, allGrounded: answersGrounded, allAnswerComplete: answersComplete,
            independentReviewRequired: requireIndependentReview, humanReviewed: reviewed.filter((record) => reviewFor(record)?.reviewerKind === "human").length,
            aiReviewed: reviewed.filter((record) => reviewFor(record)?.reviewerKind === "ai").length,
            pending: generated.filter((record) => !reviewFor(record)).map((record) => `${record.run}:${record.caseId}`) },
        conflictContext,
        supportOutcomes: valid.map((record) => ({ run: record.run, ...fixtureSupportOutcomes(corpus.cases.find((item) => item.id === record.caseId)!, record.selectedIds, record.contextText) })),
        releaseGate: "NOT_ESTABLISHED: synthetic provider diagnostic; actual database source RPC, live authorization/freshness, response-scoped citations and journey are outside this harness",
        limitations: ["Missing runs/errors count as failures, never disappear from denominators.",
            "Irrelevant rejection is case-weighted over all 58 cases: every selected ID must be in the frozen eligibleIds; empty eligibility therefore requires zero selected IDs. Named distractors are not the only rejected evidence.",
            "Unknown abstentions count as failures until independently reviewed; no text heuristic or automatic generator self-grade grants a pass.",
            "Exact quote and empty-evidence branches are repeated deterministic outcomes, not claimed as independent Anthropic generations."] };
}

/** CLI status is fail-closed; emitted JSON remains the full reviewable evidence. */
export function qualityScoreExitCode(value: unknown): 0 | 1 {
    if (!value || typeof value !== "object") return 1;
    const score = value as Partial<ReturnType<typeof scoreQuality>>;
    return score.complete === true && score.numericalThresholdsPass === true && score.tokenProofComplete === true
        && score.actualGenerationUsageComplete === true && score.answerReview?.allGrounded === true
        && score.answerReview?.allAnswerComplete === true && score.answerReview.reviewed === score.answerReview.required
        && score.providerDiagnosticVerdict === "THRESHOLDS_MET_IN_DIAGNOSTIC_ONLY" ? 0 : 1;
}

class ProbeFailure extends Error {
    constructor(readonly code: string, readonly status?: number, readonly retryAfterMs?: number) { super(code); }
}
/** Extract only retry timing/status; never persist an SDK error or request headers. */
export function safeProviderFailure(error: unknown): { code: string; status?: number; retryAfterMs?: number; errorName?: string; transportCode?: string } {
    if (error instanceof ProbeFailure) return { code: error.code, status: error.status, retryAfterMs: error.retryAfterMs };
    if (error instanceof PersonalEvidenceSelectionError) return { code: error.code };
    if (NoObjectGeneratedError.isInstance(error)) return { code: "SELECTOR_INVALID_STRUCTURED_OUTPUT" };
    if (!error || typeof error !== "object") return { code: "PROVIDER_FAILURE" };
    const value = error as { status?: unknown; statusCode?: unknown; code?: unknown; name?: unknown; cause?: { code?: unknown }; responseHeaders?: Record<string, string>; message?: string };
    const httpStatus = (candidate: unknown) => typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 400 && candidate <= 599 ? candidate : undefined;
    let status = httpStatus(value.status) ?? httpStatus(value.statusCode) ?? httpStatus(value.code);
    const allowedNames = new Set(["Error", "ApiError", "APIError", "TypeError", "AbortError", "TimeoutError", "AI_APICallError", "AI_RetryError", "FetchError"]);
    const errorName = typeof value.name === "string" && allowedNames.has(value.name) ? value.name : undefined;
    const allowedCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "EPIPE", "ABORT_ERR", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET"]);
    const transportCandidate = value.cause?.code ?? value.code;
    const transportCode = typeof transportCandidate === "string" && allowedCodes.has(transportCandidate) ? transportCandidate : undefined;
    let retryAfterMs: number | undefined;
    const retry = value.responseHeaders?.["retry-after"];
    if (retry) retryAfterMs = /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now());
    try {
        const raw = JSON.parse(value.message ?? "{}") as { error?: { code?: unknown; details?: Array<{ "@type"?: string; retryDelay?: string }> } };
        status ??= httpStatus(raw.error?.code);
        for (const detail of raw.error?.details ?? []) {
            if (detail["@type"]?.endsWith("RetryInfo") && /^\d+(\.\d+)?s$/.test(detail.retryDelay ?? "")) retryAfterMs = Math.max(retryAfterMs ?? 0, parseFloat(detail.retryDelay!) * 1000);
        }
    } catch { /* Raw provider messages are deliberately discarded. */ }
    return { code: status === 429 ? "PROVIDER_RATE_LIMIT" : "PROVIDER_FAILURE", status,
        ...(errorName ? { errorName } : {}), ...(transportCode ? { transportCode } : {}),
        ...(Number.isFinite(retryAfterMs) ? { retryAfterMs } : {}) };
}
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
export class ProviderScheduler {
    requests = 0;
    events: ProviderEvent[] = [];
    private nextAt = 0;
    constructor(private readonly maxRetries: number = QUALITY_CONFIG.maxRetries) {}
    async run<T>(kind: string, action: () => Promise<T>): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            if (this.requests >= QUALITY_CONFIG.maxProviderRequestsIncludingRetries) throw new ProbeFailure("REQUEST_BUDGET_EXHAUSTED");
            await sleep(Math.max(0, this.nextAt - Date.now()));
            this.requests++;
            const started = performance.now();
            try {
                const result = await action();
                this.events.push({ kind, attempt, outcome: "success", durationMs: Math.round(performance.now() - started) });
                return result;
            } catch (error) {
                const safe = safeProviderFailure(error);
                this.events.push({ kind, attempt, outcome: safe.code, durationMs: Math.round(performance.now() - started), status: safe.status, retryAfterMs: safe.retryAfterMs,
                    errorName: safe.errorName, transportCode: safe.transportCode });
                // Never retry ambiguous generation/network failures. Only explicit rate limits receive a bounded retry.
                if (safe.status !== 429 || attempt >= this.maxRetries) throw new ProbeFailure(safe.code, safe.status, safe.retryAfterMs);
                const delay = safe.retryAfterMs ?? 30_000 * (attempt + 1);
                if (delay > QUALITY_CONFIG.maxRetryWaitMs) throw new ProbeFailure("PROVIDER_RETRY_DELAY_EXCEEDS_LIMIT", 429, delay);
                this.nextAt = Date.now() + Math.max(QUALITY_CONFIG.minimumRequestSpacingMs, delay);
            } finally {
                this.nextAt = Math.max(this.nextAt, Date.now() + QUALITY_CONFIG.minimumRequestSpacingMs);
            }
        }
    }
}
function loadKeys(envFile: string, required: { gemini: boolean; anthropic: boolean }) {
    const local = existsSync(envFile) ? parse(readFileSync(envFile)) : {};
    const gemini = process.env.GEMINI_API_KEY ?? local.GEMINI_API_KEY;
    const anthropic = process.env.ANTHROPIC_API_KEY ?? local.ANTHROPIC_API_KEY;
    if ((required.gemini && !gemini) || (required.anthropic && !anthropic)) throw new ProbeFailure("REQUIRED_PROVIDER_KEYS_MISSING");
    return { gemini, anthropic };
}
async function countTokens(apiKey: string, model: string, system: string | undefined, text: string) {
    const response = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, ...(system ? { system } : {}), messages: [{ role: "user", content: text || " " }] }),
        signal: AbortSignal.timeout(QUALITY_CONFIG.requestTimeoutMs),
    });
    if (!response.ok) {
        const retry = response.headers.get("retry-after");
        const delay = retry ? /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now()) : undefined;
        throw new ProbeFailure("TOKEN_COUNT_FAILED", response.status, Number.isFinite(delay) ? delay : undefined);
    }
    const body = await response.json() as { input_tokens?: number };
    if (!Number.isInteger(body.input_tokens) || body.input_tokens! < 0) throw new ProbeFailure("INVALID_TOKEN_COUNT");
    return body.input_tokens!;
}
export function plan(corpus: Corpus) {
    return { mode: "offline-plan-no-provider-requests", config: QUALITY_CONFIG, corpusSha256: corpusHash(corpus),
        cases: corpus.cases.length, records: corpus.cases.length * QUALITY_CONFIG.runs,
        generationCallsUpperBound: corpus.cases.filter((item) => item.exactQuote === null).length * QUALITY_CONFIG.runs,
        expandedRecords: expandedEvidence(corpus).length, uniqueEmbeddingInputs: embeddingInputs(corpus).length,
        perClassRequiredCasesPerRun: Object.fromEntries(CLASSES.map((type) => [type, corpus.cases.filter((item) => item.requiredIds.some((id) => corpus.evidence.find((row) => row.id === id)?.type === type)).length])),
        execution: "Requires --execute --output=<new JSON path>. No keys loaded in plan mode. Never run automatically in CI.",
        boundaries: "Production span/format/composition/prompt helpers; full-scope rank-all personal adapter is diagnostic after persistent-index migration. Synthetic authorization and real fixture embeddings for source preselection. No Supabase calls; no production latency claim; no full release-pass claim." };
}
async function execute(corpus: Corpus, outputPath: string, envFile: string, vectorsOnly: boolean, vectorsFrom?: string, resumeFrom?: string) {
    if (corpus.version !== "personal-retrieval-v1" && !vectorsOnly) throw new ProbeFailure("PRODUCTION_DATABASE_CAPTURE_REQUIRED_FOR_GENERATION");
    if (existsSync(outputPath) || existsSync(`${outputPath}.vectors.json`)) throw new ProbeFailure("OUTPUT_ALREADY_EXISTS_USE_NEW_PATH");
    mkdirSync(dirname(outputPath), { recursive: true });
    if (vectorsFrom && resumeFrom) throw new ProbeFailure("VECTOR_SOURCE_OPTIONS_ARE_EXCLUSIVE");
    const imported = vectorsFrom ? readDatabaseVectorFixture(corpus, vectorsFrom) : null;
    const resumed = resumeFrom ? readAcquisitionCheckpoint(corpus, resumeFrom) : null;
    const keys = loadKeys(envFile, { gemini: !imported, anthropic: !vectorsOnly });
    const google = imported ? null : new GoogleGenAI({ apiKey: keys.gemini!, httpOptions: { retryOptions: { attempts: 1 } } });
    const anthropic = createAnthropic({ apiKey: keys.anthropic });
    const scheduler = new ProviderScheduler();
    scheduler.events = resumed?.events ?? [];
    scheduler.requests = scheduler.events.length;
    const bank: VectorBank = imported?.bank ?? resumed?.bank ?? new Map();
    const records: QualityRecord[] = [];
    const embeddingResponses: EmbeddingResponseRecord[] = resumed?.responses ?? [];
    const counters = resumed?.counters ?? { embeddingInputs: 0, embeddingInputBytes: 0, generationAttempts: 0, reservedGenerationTokens: 0 };
    const startedAt = new Date().toISOString();
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    const modulePaths = ["lib/server/personal-evidence-ranking.ts", "lib/server/library-evidence.ts", "lib/server/personal-retrieval.ts", "app/api/chat/route.ts", "app/api/chat/notes/route.ts"];
    const moduleHashes = Object.fromEntries(modulePaths.map((path) => [path, sha(readFileSync(resolve(ROOT, path), "utf8"))]));
    let failure: ReturnType<typeof safeProviderFailure> | null = null;
    const save = () => writeFileSync(outputPath, JSON.stringify({ ...plan(corpus), mode: "actual-provider-synthetic-quality-diagnostic",
        startedAt, updatedAt: new Date().toISOString(), revision, moduleHashes, configurationOverrides: "none",
        importedVectorFixture: imported ? { sha256: imported.sha256, validation: "Frozen corpus hash, model, dimensions, exact input set, base64 encoding and finite nonzero vectors; mappings rebuilt from frozen local corpus. This validates integrity, not provider origin by itself." } : null,
        resumedAcquisition: resumed ? { sha256: resumed.sha256, successfulInputsReused: resumed.reusedInputs, missingInputsAtResume: resumed.missingInputs,
            validation: "Exact frozen config/hash, allowed unique input subset, finite vectors, successful batch/event counts and prior budget counters. Previous uncertain failed requests remain counted." } : null,
        providerVectorAcquisition: "Real Google vectors, one acquisition per distinct synthetic input; reused unchanged for all three rankings. Rank-all personal selection is diagnostic after the persistent-index architecture change. Neither personal nor source preselection invokes the production DB function. This removes request latency from ranking and is not a production indexing/performance test.",
        tokenMeasurement: "Anthropic count_tokens(model-specific provider estimate) for evidence-only user message INCLUDING message overhead, and full generation prompt; generation usage records actual billed input/output units where returned. Bytes are separately recorded, never called tokens.",
        tokenReference: "https://platform.claude.com/docs/en/build-with-claude/token-counting",
        monetaryCost: { usd: null, reason: "No account billing/pricing queried. Hard request/input/reserved-token caps bound work; no unverified dollar estimate." },
        counters, events: scheduler.events, embeddingResponses, failure, records, score: scoreQuality(corpus, records),
        reviewInstructions: "For every modelCalled record, independent review must bind responseSha256, grounded and abstained; mixed attention also requires noteAttributionCorrect. Do not modify frozen labels or tune thresholds from this output.",
    }, null, 2) + "\n");
    try {
        const texts = embeddingInputs(corpus).filter((text) => !bank.has(text));
        for (let start = 0; !imported && start < texts.length; start += QUALITY_CONFIG.embeddingBatchSize) {
            const inputs = texts.slice(start, start + QUALITY_CONFIG.embeddingBatchSize);
            const response = await scheduler.run("google-embedding", async () => {
                counters.embeddingInputs += inputs.length;
                counters.embeddingInputBytes += inputs.reduce((sum, text) => sum + Buffer.byteLength(text, "utf8"), 0);
                if (counters.embeddingInputs > QUALITY_CONFIG.maxEmbeddingInputsIncludingRetries || counters.embeddingInputBytes > QUALITY_CONFIG.maxEmbeddingInputBytesIncludingRetries) throw new ProbeFailure("EMBEDDING_BUDGET_EXHAUSTED");
                return google!.models.embedContent({ model: QUALITY_CONFIG.embeddingModel, contents: inputs,
                    config: { outputDimensionality: QUALITY_CONFIG.dimensions, abortSignal: AbortSignal.timeout(QUALITY_CONFIG.requestTimeoutMs) } });
            });
            const vectors = (response.embeddings ?? []).map((item) => item.values ?? []);
            if (vectors.length !== inputs.length) throw new ProbeFailure("INCOMPLETE_PROVIDER_VECTORS");
            vectors.forEach((vector) => cosine(vector, vector));
            inputs.forEach((text, index) => bank.set(text, vectors[index]));
            const counts = response.embeddings?.map((item) => item.statistics?.tokenCount);
            embeddingResponses.push({ texts: inputs, vectors,
                tokenCount: counts?.every((value) => typeof value === "number") ? counts.reduce((sum, count) => sum! + count!, 0)! : null,
                billableCharacters: response.metadata?.billableCharacterCount ?? null });
            save();
        }
        writeFileSync(`${outputPath}.vectors.json`, JSON.stringify(databaseVectorFixture(corpus, bank), null, 2) + "\n");
        if (vectorsOnly) { save(); return; }
        for (let run = 1; run <= QUALITY_CONFIG.runs; run++) for (const testCase of corpus.cases) {
            let record: QualityRecord = { caseId: testCase.id, run, outcome: "error", selectedIds: [], contextText: "", responseText: null,
                branch: "error", modelCalled: false, evidenceTokenCount: null };
            try {
                const result = await retrieveFixtureCase(corpus, testCase, bank);
                record = { ...record, ...result, input: { ...result, query: testCase.query }, responseText: result.deterministicText };
                record.evidenceTokenCount = await scheduler.run("anthropic-evidence-token-count", () => countTokens(keys.anthropic!, result.model, undefined, result.contextText));
                if (record.evidenceTokenCount > QUALITY_CONFIG.evidenceTokens) throw new ProbeFailure("EVIDENCE_TOKEN_BUDGET_EXCEEDED");
                if (result.branch === "model") {
                    const estimatedInput = await scheduler.run("anthropic-prompt-token-count", () => countTokens(keys.anthropic!, result.model, result.system, testCase.query));
                    if (estimatedInput > QUALITY_CONFIG.maxSinglePromptTokens) throw new ProbeFailure("PROMPT_TOKEN_BUDGET_EXCEEDED");
                    const generated = await scheduler.run("anthropic-generation", async () => {
                        counters.generationAttempts++;
                        // Reserve a hard worst-case input cap, not the estimate, including failed/rate-limited attempts.
                        counters.reservedGenerationTokens += QUALITY_CONFIG.maxSinglePromptTokens + result.maxOutputTokens;
                        if (counters.generationAttempts > QUALITY_CONFIG.maxGenerationAttempts || counters.reservedGenerationTokens > QUALITY_CONFIG.maxReservedGenerationTokens) throw new ProbeFailure("GENERATION_BUDGET_EXHAUSTED");
                        record.modelCalled = true;
                        return generateText({ model: anthropic(result.model), system: result.system, prompt: testCase.query,
                            maxOutputTokens: result.maxOutputTokens, maxRetries: 0, abortSignal: AbortSignal.timeout(QUALITY_CONFIG.requestTimeoutMs) });
                    });
                    record.responseText = generated.text;
                    record.modelResult = { text: generated.text, finishReason: generated.finishReason, responseId: generated.response.id,
                        modelId: generated.response.modelId, inputTokens: generated.usage.inputTokens ?? null,
                        outputTokens: generated.usage.outputTokens ?? null, totalTokens: generated.usage.totalTokens ?? null,
                        promptCountEstimate: estimatedInput };
                }
                record.outcome = "complete";
            } catch (error) {
                const safe = safeProviderFailure(error);
                record.errorCode = safe.code;
                records.push(record); save();
                // Stop on operational failure: never flood quota or quietly drop failed cases.
                throw error;
            }
            records.push(record); save();
            console.log(JSON.stringify({ caseId: testCase.id, run, branch: record.branch, outcome: record.outcome }));
        }
    } catch (error) { failure = safeProviderFailure(error); save(); throw new ProbeFailure(failure.code, failure.status, failure.retryAfterMs); }
    finally { readFrozenCorpus(corpus.version === "personal-retrieval-v2" ? "v2" : "v1"); }
    save();
}

export type CapturedSelectorCase = {
    caseId: string; inputSha256: string; request: CanonicalPersonalEvidenceSelectionRequest;
    candidateFixtureIds: Record<string, string>; diagnosticOnlyAllCandidateIds: string[];
};
export type CapturedSelectorInputs = {
    version: "personal-retrieval-selection-inputs-v1"; corpusSha256: string; vectorFixtureSha256: string;
    modelConfig: typeof PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG;
    records: CapturedSelectorCase[]; revokedCaseIds: string[]; deterministicEmptyCaseIds: string[];
};
export const SELECTOR_EVALUATION_LIMITS = Object.freeze({ runs: 3, maxGenerationAttempts: 200, maxObservedInputTokens: 2_000_000 });
export function readCapturedSelectorInputs(corpus: Corpus, path: string, vectorFixtureSha256?: string) {
    const raw = readFileSync(path, "utf8");
    const artifact = JSON.parse(raw) as CapturedSelectorInputs;
    const config = PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG;
    if (artifact.version !== "personal-retrieval-selection-inputs-v1" || artifact.corpusSha256 !== corpusHash(corpus)
        || !/^[0-9a-f]{64}$/.test(artifact.vectorFixtureSha256 ?? "")
        || (vectorFixtureSha256 !== undefined && artifact.vectorFixtureSha256 !== vectorFixtureSha256)
        || !artifact.modelConfig || Object.keys(artifact.modelConfig).length !== Object.keys(config).length
        || !Object.entries(config).every(([key, value]) => artifact.modelConfig[key as keyof typeof config] === value)
        || !Array.isArray(artifact.records) || !Array.isArray(artifact.revokedCaseIds) || !Array.isArray(artifact.deterministicEmptyCaseIds)) {
        throw new ProbeFailure("SELECTOR_CAPTURE_CONFIGURATION_MISMATCH");
    }
    const knownCases = new Map(corpus.cases.map((item) => [item.id, item]));
    const knownRows = new Map(expandedEvidence(corpus).map((item) => [item.id, item]));
    const seen = new Set<string>();
    for (const item of artifact.records) {
        const testCase = knownCases.get(item.caseId);
        if (!testCase || seen.has(item.caseId)) throw new ProbeFailure("SELECTOR_CAPTURE_CASE_MISMATCH");
        seen.add(item.caseId);
        const request = canonicalPersonalEvidenceSelectionRequest(item.request);
        if (personalEvidenceSelectionRequestHash(request, config) !== item.inputSha256) throw new ProbeFailure("SELECTOR_CAPTURE_HASH_MISMATCH");
        const input = JSON.parse(request.prompt) as { question: string; candidates: PersonalEvidenceSelectionCandidate[] };
        if (input.question !== testCase.query || input.candidates.length === 0 || !item.candidateFixtureIds
            || Object.keys(item.candidateFixtureIds).length !== input.candidates.length
            || JSON.stringify(item.diagnosticOnlyAllCandidateIds) !== JSON.stringify(input.candidates.map((candidate) => candidate.id))) {
            throw new ProbeFailure("SELECTOR_CAPTURE_INPUT_MISMATCH");
        }
        for (const candidate of input.candidates) {
            const row = knownRows.get(item.candidateFixtureIds[candidate.id]);
            if (!row || row.type !== candidate.type) throw new ProbeFailure("SELECTOR_CAPTURE_NON_SYNTHETIC_IDENTITY");
            const titles = new Set([...knownRows.values()].filter((item) => item.contentId === row.contentId).map((item) => item.title));
            const withdrawnSource = row.lifecycle ? row.lifecycle.source === "withdrawn" : row.state === "withdrawn";
            if (!titles.has(candidate.title) && !(withdrawnSource && candidate.title === "Source unavailable")) throw new ProbeFailure("SELECTOR_CAPTURE_NON_SYNTHETIC_TITLE");
            const texts = { sourceText: row.type === "source_segment" ? row.text : null,
                highlightedText: row.type === "highlight" ? row.text : null, noteBody: row.type === "highlight" ? row.note : null,
                reflectionText: row.type === "reflection" ? row.text : null, prompt: row.type === "reflection" ? row.prompt : null };
            for (const field of candidate.fields) {
                const stored = texts[field.name];
                if (!stored || !stored.includes(field.text)) throw new ProbeFailure("SELECTOR_CAPTURE_NON_SYNTHETIC_TEXT");
            }
        }
    }
    for (const caseId of artifact.revokedCaseIds) {
        const testCase = knownCases.get(caseId);
        if (seen.has(caseId) || !testCase || !(testCase.request ? testCase.request.sessionState === "revoked" : testCase.kind === "revoked")) throw new ProbeFailure("SELECTOR_CAPTURE_REVOKED_CASE_MISMATCH");
        seen.add(caseId);
    }
    for (const caseId of artifact.deterministicEmptyCaseIds) {
        if (seen.has(caseId) || !knownCases.has(caseId)) throw new ProbeFailure("SELECTOR_CAPTURE_EMPTY_CASE_MISMATCH");
        seen.add(caseId);
    }
    if (seen.size !== corpus.cases.length) throw new ProbeFailure("SELECTOR_CAPTURE_INCOMPLETE");
    return { artifact, sha256: sha(raw) };
}
export type ProviderSelectorRecord = {
    caseId: string; run: number; inputSha256: string; outcome: "complete" | "error";
    output: { ids: string[] } | null; providerOutput?: unknown; usage?: Partial<LanguageModelUsage>; model: string; provider: string;
    rawText?: string; rawTextTruncated?: boolean; rawTextBytes?: number; rawTextSha256?: string; responseId?: string; durationMs: number; errorCode?: string;
};
/** Replay the raw model judgment through production validation; IDs alone are insufficient evidence. */
export function validateRecordedProviderSelectionOutput(
    record: Pick<ProviderSelectorRecord, "output" | "providerOutput">,
    request: Pick<PersonalEvidenceSelectionRequest, "schema">,
): unknown {
    if (!record.providerOutput || !record.output || !Array.isArray(record.output.ids)) throw new ProbeFailure("SELECTOR_RAW_OUTPUT_REQUIRED");
    const ids = derivePersonalEvidenceSelectionIds(record.providerOutput, request);
    if (JSON.stringify(ids) !== JSON.stringify(record.output.ids)) throw new ProbeFailure("SELECTOR_DERIVED_IDS_MISMATCH");
    return record.providerOutput;
}
export function safeSelectorOutputFailure(error: unknown) {
    if (!NoObjectGeneratedError.isInstance(error)) return undefined;
    const raw = typeof error.text === "string" ? error.text : "";
    const bytes = Buffer.from(raw, "utf8"); const truncated = bytes.length > 256 * 1024;
    let text = truncated ? bytes.subarray(0, 256 * 1024).toString("utf8") : raw;
    while (Buffer.byteLength(text, "utf8") > 256 * 1024) text = text.slice(0, -1);
    const count = (value: unknown): number | undefined => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    const usage: Partial<LanguageModelUsage> = { inputTokens: count(error.usage?.inputTokens), outputTokens: count(error.usage?.outputTokens), totalTokens: count(error.usage?.totalTokens) };
    let output: unknown = null;
    if (!truncated) { try { output = JSON.parse(text); } catch { /* Retain raw synthetic model output, not an invented structure. */ } }
    return { text, output, responseId: typeof error.response?.id === "string" && /^[A-Za-z0-9_:-]{1,200}$/.test(error.response.id) ? error.response.id : "unavailable",
        usage, rawTextTruncated: truncated, rawTextBytes: bytes.length, rawTextSha256: sha(raw) };
}
export function selectorOnlyMetrics(corpus: Corpus, inputs: CapturedSelectorInputs, records: ProviderSelectorRecord[]) {
    const results = Array.from({ length: SELECTOR_EVALUATION_LIMITS.runs }, (_, index) => {
        const run = index + 1;
        const mapped = new Map(inputs.records.map((input) => {
            const record = records.find((item) => item.caseId === input.caseId && item.run === run && item.outcome === "complete");
            return [input.caseId, record?.output?.ids.map((id) => input.candidateFixtureIds[id]) ?? null];
        }));
        const capturedCases = corpus.cases.filter((item) => mapped.has(item.id));
        const perClass = Object.fromEntries(CLASSES.map((type) => {
            const cases = corpus.cases.filter((item) => item.requiredIds.some((id) => corpus.evidence.find((row) => row.id === id)?.type === type));
            const scores = cases.map((item) => {
                const required = item.requiredIds.filter((id) => corpus.evidence.find((row) => row.id === id)?.type === type);
                return required.filter((id) => mapped.get(item.id)?.includes(id)).length / required.length;
            });
            return [type, ratio(scores.reduce((a, b) => a + b, 0), cases.length)];
        })) as Record<EvidenceClass, ReturnType<typeof ratio>>;
        const quotes = capturedCases.filter((item) => item.exactQuote !== null);
        const abstentions = capturedCases.filter((item) => item.abstentionRequired);
        return { run, perClass, recallMacro: CLASSES.reduce((sum, type) => sum + perClass[type].rate!, 0) / CLASSES.length,
            irrelevantRejectionAmongCapturedCases: ratio(capturedCases.filter((item) => mapped.get(item.id)?.every((id) => item.eligibleIds.includes(id))).length, capturedCases.length),
            emptySelectionForCapturedAbstentions: ratio(abstentions.filter((item) => mapped.get(item.id)?.length === 0).length, abstentions.length),
            exactQuoteTargetIdentification: ratio(quotes.filter((item) => mapped.get(item.id)?.length === 1 && item.requiredIds.includes(mapped.get(item.id)![0])).length, quotes.length) };
    });
    return { runs: results, boundaries: "Selection IDs before final context composition only. These are not quote fidelity or final-answer scores. Denominators for rejection/abstention here cover captured model requests; real revoked/empty cases and full frozen thresholds are evaluated by production database replay.",
        releaseGate: "NOT_ASSESSED: requires real database replay of every run, final context/quote checks, answer generation and independent adjudication." };
}
export function capturedSelectorPlan(inputs: CapturedSelectorInputs) {
    return { mode: "offline-selector-plan-no-provider-requests", modelConfig: PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG,
        cases: inputs.records.length, runs: SELECTOR_EVALUATION_LIMITS.runs, plannedGenerationCalls: inputs.records.length * SELECTOR_EVALUATION_LIMITS.runs,
        maximumOutputTokensPlanned: inputs.records.length * SELECTOR_EVALUATION_LIMITS.runs * PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG.maxOutputTokens,
        revokedCaseIds: inputs.revokedCaseIds, deterministicEmptyCaseIds: inputs.deterministicEmptyCaseIds,
        maximumCandidates: Math.max(0, ...inputs.records.map((item) => item.request.outputSchema.allowedIds.length)),
        maximumPromptBytes: Math.max(0, ...inputs.records.map((item) => Buffer.byteLength(item.request.system + item.request.prompt, "utf8"))),
        limits: SELECTOR_EVALUATION_LIMITS, selectorLimits: PERSONAL_EVIDENCE_SELECTOR_LIMITS, providerRequestsAlreadyMade: 0 };
}
async function executeCapturedSelectors(corpus: Corpus, inputPath: string, vectorsPath: string, outputPath: string, envFile: string) {
    if (existsSync(outputPath)) throw new ProbeFailure("OUTPUT_ALREADY_EXISTS_USE_NEW_PATH");
    const vectorFixture = readDatabaseVectorFixture(corpus, vectorsPath);
    const capture = readCapturedSelectorInputs(corpus, inputPath, vectorFixture.sha256);
    const inputs = capture.artifact;
    if (inputs.records.length * SELECTOR_EVALUATION_LIMITS.runs > SELECTOR_EVALUATION_LIMITS.maxGenerationAttempts) throw new ProbeFailure("SELECTOR_PLAN_EXCEEDS_ATTEMPT_BUDGET");
    const keys = loadKeys(envFile, { gemini: false, anthropic: true });
    const anthropic = createAnthropic({ apiKey: keys.anthropic! });
    const config = PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG;
    const scheduler = new ProviderScheduler(0);
    const records: ProviderSelectorRecord[] = [];
    const totals = { attempts: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const startedAt = new Date().toISOString();
    let failure: ReturnType<typeof safeProviderFailure> | null = null;
    mkdirSync(dirname(outputPath), { recursive: true });
    const save = () => writeFileSync(outputPath, JSON.stringify({
        version: "personal-retrieval-provider-selections-v2", mode: "actual-provider-on-captured-production-inputs",
        corpusSha256: corpusHash(corpus), vectorFixtureSha256: inputs.vectorFixtureSha256, modelConfig: config,
        captureFileSha256: capture.sha256, capturedInputs: inputs.records,
        revokedCaseIds: inputs.revokedCaseIds, deterministicEmptyCaseIds: inputs.deterministicEmptyCaseIds,
        startedAt, updatedAt: new Date().toISOString(), limits: SELECTOR_EVALUATION_LIMITS,
        complete: records.length === inputs.records.length * SELECTOR_EVALUATION_LIMITS.runs && records.every((record) => record.outcome === "complete"),
        totals, failure, events: scheduler.events, records, selectionOnlyMetrics: selectorOnlyMetrics(corpus, inputs, records),
        boundaries: ["Three distinct real Anthropic calls for each captured authorized production selector request; no expected IDs/title heuristics drive selection.",
            "Inputs were checked to contain only exact synthetic fixture fields/spans, titles and questions. Raw structured output and actual provider usage are recorded.",
            "No new embeddings were requested. Recorded vector fixture and captured production input hashes are bound to this artifact.",
            "Intermediate selector usage is separate from final answer context/generation. No final-answer or full release quality pass is claimed.",
            "USD cost was not queried; actual input/output usage and attempt limits are reported without an unverified dollar estimate."],
    }, null, 2) + "\n");
    save();
    try {
        for (let run = 1; run <= SELECTOR_EVALUATION_LIMITS.runs; run++) for (const input of inputs.records) {
            const parsed = JSON.parse(input.request.prompt) as { question: string; exactQuote: boolean; candidates: PersonalEvidenceSelectionCandidate[] };
            const started = performance.now();
            let rawResult: { text: string; output: unknown; responseId: string; usage: Partial<LanguageModelUsage>; rawTextTruncated?: boolean; rawTextBytes?: number; rawTextSha256?: string } | undefined;
            const record: ProviderSelectorRecord = { caseId: input.caseId, run, inputSha256: input.inputSha256, outcome: "error", output: null,
                model: config.model, provider: config.provider, durationMs: 0 };
            try {
                const result = await scheduler.run("anthropic-selector", async () => {
                    if (totals.attempts >= SELECTOR_EVALUATION_LIMITS.maxGenerationAttempts || totals.inputTokens >= SELECTOR_EVALUATION_LIMITS.maxObservedInputTokens) throw new ProbeFailure("SELECTOR_BUDGET_EXHAUSTED");
                    let safeFailure: ReturnType<typeof safeProviderFailure> | undefined;
                    try {
                        return await selectPersonalEvidence({ ...parsed, generate: async (request) => {
                            if (personalEvidenceSelectionRequestHash(request, config) !== input.inputSha256) throw new ProbeFailure("SELECTOR_PRODUCTION_REQUEST_CHANGED");
                            totals.attempts++;
                            let usageCounted = false;
                            try {
                                const generated = await generateText({ model: anthropic(config.model), system: request.system, prompt: request.prompt,
                                    output: Output.object({ schema: request.schema }), maxOutputTokens: request.maxOutputTokens,
                                    maxRetries: 0, abortSignal: request.signal });
                                const usage = generated.usage;
                                rawResult = { text: generated.text, output: generated.output, responseId: generated.response.id,
                                    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens,
                                        inputTokenDetails: usage.inputTokenDetails, outputTokenDetails: usage.outputTokenDetails } };
                                if (!Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens)
                                    || usage.inputTokens! < 0 || usage.outputTokens! < 0) throw new ProbeFailure("SELECTOR_ACTUAL_USAGE_MISSING");
                                totals.inputTokens += usage.inputTokens!; totals.outputTokens += usage.outputTokens!;
                                totals.totalTokens += usage.totalTokens ?? usage.inputTokens! + usage.outputTokens!;
                                usageCounted = true;
                                if (generated.response.modelId !== config.model) throw new ProbeFailure("SELECTOR_PROVIDER_MODEL_MISMATCH");
                                return { output: generated.output, usage: rawResult.usage, model: generated.response.modelId, provider: config.provider };
                            } catch (error) {
                                const failedOutput = safeSelectorOutputFailure(error);
                                if (failedOutput) {
                                    rawResult = failedOutput;
                                    if (!usageCounted) {
                                        totals.inputTokens += failedOutput.usage.inputTokens ?? 0;
                                        totals.outputTokens += failedOutput.usage.outputTokens ?? 0;
                                        totals.totalTokens += failedOutput.usage.totalTokens ?? (failedOutput.usage.inputTokens ?? 0) + (failedOutput.usage.outputTokens ?? 0);
                                    }
                                }
                                safeFailure = safeProviderFailure(error); throw error;
                            }
                        } });
                    } catch (error) {
                        if (error instanceof PersonalEvidenceSelectionError && ["DEADLINE_EXCEEDED", "CANCELLED"].includes(error.code)) throw error;
                        if (safeFailure) throw new ProbeFailure(safeFailure.code, safeFailure.status, safeFailure.retryAfterMs);
                        throw error;
                    }
                });
                if (!rawResult) throw new ProbeFailure("SELECTOR_RAW_RESULT_MISSING");
                record.output = { ids: result.ids }; record.providerOutput = rawResult.output; record.usage = rawResult.usage;
                record.rawText = rawResult.text; record.responseId = rawResult.responseId; record.outcome = "complete";
            } catch (error) {
                record.errorCode = safeProviderFailure(error).code;
                record.durationMs = Math.round(performance.now() - started);
                if (rawResult) { record.providerOutput = rawResult.output; record.rawText = rawResult.text; record.usage = rawResult.usage; record.responseId = rawResult.responseId;
                    record.rawTextTruncated = rawResult.rawTextTruncated; record.rawTextBytes = rawResult.rawTextBytes; record.rawTextSha256 = rawResult.rawTextSha256; }
                records.push(record); save(); throw error;
            }
            record.durationMs = Math.round(performance.now() - started); records.push(record); save();
            console.log(JSON.stringify({ caseId: input.caseId, run, outcome: record.outcome, selected: record.output!.ids.length,
                inputTokens: record.usage?.inputTokens, outputTokens: record.usage?.outputTokens, totalAttempts: totals.attempts }));
        }
    } catch (error) { failure = safeProviderFailure(error); save(); throw new ProbeFailure(failure.code, failure.status, failure.retryAfterMs); }
    finally { readFrozenCorpus(corpus.version === "personal-retrieval-v2" ? "v2" : "v1"); }
    save();
    console.log(JSON.stringify({ complete: true, records: records.length, totals, outputPath }));
}

/** Hash the actual route, prompt, ranking, selection and authorization implementation used by the DB capture. */
export function productionRetrievalHashes() {
    const files = ["app/api/chat/route.ts", "app/api/chat/notes/route.ts", "lib/server/personal-retrieval.ts",
        "lib/server/library-evidence.ts", "lib/server/retrieval-generation.ts", "lib/server/retrieval-user-context.ts",
        "lib/server/personal-evidence-selector.ts", "lib/server/personal-evidence-ranking.ts",
        "lib/server/personal-retrieval-session.ts", "tests/database/personal-retrieval-quality-runtime.test.ts"];
    return Object.fromEntries(files.map((file) => [file, sha(readFileSync(resolve(ROOT, file), "utf8"))]));
}
export type DatabaseGenerationInput = {
    query: string; system: string; model: string; maxOutputTokens: number;
    branch: RetrievedCase["branch"]; deterministicText: string | null;
};
export type DatabaseGenerationRecord = {
    caseId: string; run: number; outcome: "complete" | "error"; selectedIds: string[]; contextText: string;
    deniedRevokedSession: boolean; generationInput?: DatabaseGenerationInput; generationInputSha256?: string;
};
export function databaseGenerationInputHash(record: Pick<DatabaseGenerationRecord, "caseId" | "run" | "selectedIds" | "contextText" | "deniedRevokedSession" | "generationInput">) {
    return sha(JSON.stringify({ caseId: record.caseId, run: record.run, selectedIds: record.selectedIds,
        contextText: record.contextText, deniedRevokedSession: record.deniedRevokedSession, generationInput: record.generationInput ?? null }));
}
export function readDatabaseGenerationInputs(corpus: Corpus, path: string) {
    const raw = readFileSync(path, "utf8");
    const artifact = JSON.parse(raw) as { version: string; mode: string; corpusSha256: string;
        productionHashes: Record<string, string>; vectorFixtureSha256: string; selectionFixtureSha256: string;
        expectedCases: number; executedCases: number; records: DatabaseGenerationRecord[] };
    if (artifact.version !== "personal-retrieval-database-quality-v1" || artifact.mode !== "recorded-provider-selection-replay"
        || artifact.corpusSha256 !== corpusHash(corpus) || !Array.isArray(artifact.records)
        || artifact.expectedCases !== corpus.cases.length * QUALITY_CONFIG.runs || artifact.executedCases !== artifact.expectedCases
        || artifact.records.length !== artifact.expectedCases || !/^[a-f0-9]{64}$/.test(artifact.vectorFixtureSha256)
        || !/^[a-f0-9]{64}$/.test(artifact.selectionFixtureSha256)) throw new ProbeFailure("DATABASE_GENERATION_CAPTURE_INVALID");
    const hashes = productionRetrievalHashes();
    if (!artifact.productionHashes || Object.keys(artifact.productionHashes).length !== Object.keys(hashes).length
        || Object.entries(hashes).some(([file, value]) => artifact.productionHashes[file] !== value)) throw new ProbeFailure("DATABASE_GENERATION_IMPLEMENTATION_CHANGED");
    const seen = new Set<string>(); const ids = new Set(expandedEvidence(corpus).map((row) => row.id));
    for (const record of artifact.records) {
        const testCase = corpus.cases.find((item) => item.id === record.caseId); const key = `${record.run}:${record.caseId}`;
        if (!testCase || !Number.isInteger(record.run) || record.run < 1 || record.run > QUALITY_CONFIG.runs || seen.has(key)
            || record.outcome !== "complete" || !Array.isArray(record.selectedIds) || record.selectedIds.length > QUALITY_CONFIG.evidenceItems
            || new Set(record.selectedIds).size !== record.selectedIds.length || record.selectedIds.some((id) => !ids.has(id))
            || typeof record.contextText !== "string" || Buffer.byteLength(record.contextText) > QUALITY_CONFIG.evidenceBytes
            || record.generationInputSha256 !== databaseGenerationInputHash(record)) throw new ProbeFailure("DATABASE_GENERATION_RECORD_INVALID");
        seen.add(key);
        const revoked = testCase.request ? testCase.request.sessionState === "revoked" : testCase.kind === "revoked";
        if (revoked) {
            if (!record.deniedRevokedSession || record.generationInput || record.selectedIds.length || record.contextText) throw new ProbeFailure("DATABASE_GENERATION_REVOCATION_INVALID");
            continue;
        }
        const input = record.generationInput; const library = testCase.request ? testCase.request.surface === "library" : testCase.scope.includes("source_segment");
        const expectedModel = library ? getAnthropicModelName(detectAskIntent(testCase.query)) : getNotesAnthropicModelName(testCase.query);
        const expectedCap = library ? getOutputTokenCap(detectAskIntent(testCase.query)) : getNotesOutputTokenCap(testCase.query);
        if (record.deniedRevokedSession || !input || input.query !== testCase.query || input.model !== expectedModel || input.maxOutputTokens !== expectedCap
            || typeof input.system !== "string" || input.system.length > 100_000 || !input.system.includes(record.contextText)
            || !["model", "exact_quote", "no_evidence", "quote_too_large"].includes(input.branch)
            || (input.branch === "model" ? input.deterministicText !== null : typeof input.deterministicText !== "string")) throw new ProbeFailure("DATABASE_GENERATION_PROMPT_INVALID");
    }
    return { artifact, sha256: sha(raw) };
}
export function databaseGenerationPlan(corpus: Corpus, capture: ReturnType<typeof readDatabaseGenerationInputs>) {
    return { mode: "offline-database-generation-plan", corpusSha256: corpusHash(corpus), inputSha256: capture.sha256,
        records: capture.artifact.records.length, generationCallsUpperBound: capture.artifact.records.filter((item) => item.generationInput?.branch === "model").length,
        config: QUALITY_CONFIG, independentAdjudication: "Required separately, with reviewer kind and rubric/response hashes. Independent AI review is reported as AI, never human.",
        boundaries: "Uses captured production DB retrieval and exact generation prompts. No rank-all diagnostic adapter. No automatic release pass." };
}
export type TokenMeasurement = { count: number; cacheHit: boolean; inputSha256: string; source: "provider-count-tokens-this-execution" | "no-evidence-no-model-request" };
/** Execution-local only; model + exact provider request body determine cache identity. */
export function createExecutionTokenCounter(measure: (model: string, system: string | undefined, text: string) => Promise<number>) {
    const cache = new Map<string, number>();
    return async (model: string, system: string | undefined, text: string): Promise<TokenMeasurement> => {
        const normalizedText = text || " ";
        const inputSha256 = sha(JSON.stringify({ model, ...(system ? { system } : {}), messages: [{ role: "user", content: normalizedText }] }));
        const existing = cache.get(inputSha256);
        if (existing !== undefined) return { count: existing, cacheHit: true, inputSha256, source: "provider-count-tokens-this-execution" };
        const count = await measure(model, system, normalizedText);
        if (!Number.isInteger(count) || count < 0) throw new ProbeFailure("INVALID_TOKEN_COUNT");
        cache.set(inputSha256, count);
        return { count, cacheHit: false, inputSha256, source: "provider-count-tokens-this-execution" };
    };
}
/** There is no evidence message to tokenize in this deterministic branch. */
export function emptyEvidenceMeasurement(branch: string, text: string, selectedIds: readonly string[]): TokenMeasurement | null {
    if (branch !== "no_evidence" || text !== "" || selectedIds.length !== 0) return null;
    return { count: 0, cacheHit: false, inputSha256: sha(JSON.stringify({ branch, evidenceMessage: null, modelRequest: null })), source: "no-evidence-no-model-request" };
}
export function readGenerationContinuation(corpus: Corpus, capture: ReturnType<typeof readDatabaseGenerationInputs>, path: string) {
    const raw = readFileSync(path, "utf8");
    const previous = JSON.parse(raw) as { mode: string; corpusSha256: string; inputSha256: string; config: unknown;
        productionHashes: Record<string, string>; records: QualityRecord[]; events: ProviderEvent[];
        counters: { generationAttempts: number; reservedGenerationTokens: number }; failure: { code: string; status: number }; continuation?: unknown };
    const reject = () => { throw new ProbeFailure("GENERATION_CONTINUATION_INVALID_OR_AMBIGUOUS"); };
    if (previous.mode !== "actual-generation-from-production-database-capture" || previous.corpusSha256 !== corpusHash(corpus)
        || previous.inputSha256 !== capture.sha256 || JSON.stringify(previous.config) !== JSON.stringify(QUALITY_CONFIG)
        || JSON.stringify(previous.productionHashes) !== JSON.stringify(capture.artifact.productionHashes)
        || previous.continuation || !Array.isArray(previous.records) || previous.records.length < 1
        || previous.records.length > capture.artifact.records.length || !Array.isArray(previous.events)
        || previous.failure?.code !== "TOKEN_COUNT_FAILED" || previous.failure.status !== 400) reject();
    let attempts = 0; let reserved = 0;
    previous.records.forEach((record, index) => {
        const source = capture.artifact.records[index]; const input = source.generationInput;
        if (record.caseId !== source.caseId || record.run !== source.run || record.contextText !== source.contextText
            || JSON.stringify(record.selectedIds) !== JSON.stringify(source.selectedIds) || record.branch !== (input?.branch ?? "no_evidence")) reject();
        if (index === previous.records.length - 1) {
            if (record.outcome !== "error" || record.errorCode !== "TOKEN_COUNT_FAILED" || record.modelCalled || record.modelResult
                || record.evidenceTokenCount !== null || record.tokenMeasurements?.evidence
                || !emptyEvidenceMeasurement(record.branch, record.contextText, record.selectedIds)) reject();
            return;
        }
        if (record.outcome !== "complete" || record.errorCode || !Number.isInteger(record.evidenceTokenCount) || record.evidenceTokenCount! < 0) reject();
        if (input?.branch === "model") {
            const result = record.modelResult;
            if (!record.modelCalled || !result || result.modelId !== input.model || result.text !== record.responseText
                || !result.responseId || ![result.inputTokens, result.outputTokens, result.totalTokens].every((v) => Number.isInteger(v) && v! >= 0)
                || !record.tokenMeasurements?.prompt || result.promptCountEstimate !== record.tokenMeasurements.prompt.count) reject();
            attempts++; reserved += QUALITY_CONFIG.maxSinglePromptTokens + input.maxOutputTokens;
        } else if (record.modelCalled || record.modelResult || record.responseText !== (source.deniedRevokedSession ? "Request rejected: revoked session." : input?.deterministicText)) reject();
        if (!source.deniedRevokedSession) {
            for (const [kind, measurement] of Object.entries(record.tokenMeasurements ?? {})) {
                const expected = sha(JSON.stringify({ model: input!.model, ...(kind === "prompt" ? { system: input!.system } : {}),
                    messages: [{ role: "user", content: (kind === "prompt" ? input!.query : source.contextText) || " " }] }));
                if (!measurement || measurement.source !== "provider-count-tokens-this-execution" || measurement.inputSha256 !== expected
                    || !Number.isInteger(measurement.count) || measurement.count < 0) reject();
            }
            if (record.tokenMeasurements?.evidence?.count !== record.evidenceTokenCount) reject();
        }
    });
    const events = previous.events;
    if (previous.counters?.generationAttempts !== attempts || previous.counters.reservedGenerationTokens !== reserved
        || events.length > QUALITY_CONFIG.maxProviderRequestsIncludingRetries
        || events.filter((event) => event.kind === "anthropic-generation").length !== attempts
        || events.some((event, index) => !["anthropic-generation", "anthropic-token-count"].includes(event.kind)
            || event.attempt !== 0 || !Number.isFinite(event.durationMs) || event.durationMs < 0
            || (index === events.length - 1 ? event.kind !== "anthropic-token-count" || event.outcome !== "TOKEN_COUNT_FAILED" || event.status !== 400 : event.outcome !== "success"))) reject();
    return { sourceSha256: sha(raw), records: previous.records.slice(0, -1), counters: previous.counters, events,
        previousFailure: previous.failure, retriedRecord: previous.records.at(-1)!, remainingModelCalls: capture.artifact.records.slice(previous.records.length - 1).filter((r) => r.generationInput?.branch === "model").length };
}
async function executeDatabaseGeneration(corpus: Corpus, inputPath: string, outputPath: string, envFile: string, resumePath?: string) {
    const capture = readDatabaseGenerationInputs(corpus, inputPath);
    if (existsSync(outputPath)) throw new ProbeFailure("OUTPUT_ALREADY_EXISTS_USE_NEW_PATH");
    const continuation = resumePath ? readGenerationContinuation(corpus, capture, resumePath) : null;
    mkdirSync(dirname(outputPath), { recursive: true });
    const keys = loadKeys(envFile, { gemini: false, anthropic: true }); const anthropic = createAnthropic({ apiKey: keys.anthropic });
    const scheduler = new ProviderScheduler(); const records: QualityRecord[] = continuation ? [...continuation.records] : [];
    if (continuation) { scheduler.events = [...continuation.events]; scheduler.requests = continuation.events.length; }
    const measuredTokens = createExecutionTokenCounter((model, system, text) => scheduler.run("anthropic-token-count", () => countTokens(keys.anthropic!, model, system, text)));
    const counters = continuation ? { ...continuation.counters } : { generationAttempts: 0, reservedGenerationTokens: 0 }; let failure: ReturnType<typeof safeProviderFailure> | null = null;
    const save = () => writeFileSync(outputPath, JSON.stringify({ ...databaseGenerationPlan(corpus, capture),
        mode: "actual-generation-from-production-database-capture", productionHashes: capture.artifact.productionHashes,
        generationHarnessSha256: sha(readFileSync(SCRIPT_PATH, "utf8")),
        continuation: continuation ? { sourceSha256: continuation.sourceSha256, reusedCompleteRecords: continuation.records.length, previousFailure: continuation.previousFailure, retriedRecord: continuation.retriedRecord, tokenCache: "new execution; copied records retain original measurement provenance" } : undefined,
        records, counters, events: scheduler.events, failure, score: scoreQuality(corpus, records, [], true),
        reviewInstructions: "Every generated response requires response-SHA-bound independent review with reviewerKind human or ai, independent=true and rubricSha256 matching this frozen corpus. Require answerComplete=true only when the answer covers every requested facet (including personal comparisons), as well as grounded=true. A grounded source-only answer to a requested personal comparison is incomplete. Never label AI review as human or use the generator to silently grade itself.",
    }, null, 2) + "\n");
    save();
    try {
        for (const source of capture.artifact.records.slice(continuation?.records.length ?? 0)) {
            const input = source.generationInput;
            const record: QualityRecord = { caseId: source.caseId, run: source.run, outcome: "error", selectedIds: source.selectedIds,
                contextText: source.contextText, responseText: input?.deterministicText ?? null, branch: input?.branch ?? "no_evidence",
                modelCalled: false, evidenceTokenCount: null };
            try {
                if (source.deniedRevokedSession) { record.evidenceTokenCount = 0; record.responseText = "Request rejected: revoked session."; }
                else if (input) {
                    record.tokenMeasurements = { evidence: emptyEvidenceMeasurement(input.branch, source.contextText, source.selectedIds) ?? await measuredTokens(input.model, undefined, source.contextText) };
                    record.evidenceTokenCount = record.tokenMeasurements.evidence!.count;
                    if (record.evidenceTokenCount > QUALITY_CONFIG.evidenceTokens) throw new ProbeFailure("EVIDENCE_TOKEN_BUDGET_EXCEEDED");
                    if (input.branch === "model") {
                        record.tokenMeasurements.prompt = await measuredTokens(input.model, input.system, input.query);
                        const estimatedInput = record.tokenMeasurements.prompt.count;
                        if (estimatedInput > QUALITY_CONFIG.maxSinglePromptTokens) throw new ProbeFailure("PROMPT_TOKEN_BUDGET_EXCEEDED");
                        const generated = await scheduler.run("anthropic-generation", async () => {
                            counters.generationAttempts++; counters.reservedGenerationTokens += QUALITY_CONFIG.maxSinglePromptTokens + input.maxOutputTokens;
                            if (counters.generationAttempts > QUALITY_CONFIG.maxGenerationAttempts || counters.reservedGenerationTokens > QUALITY_CONFIG.maxReservedGenerationTokens) throw new ProbeFailure("GENERATION_BUDGET_EXHAUSTED");
                            record.modelCalled = true;
                            return generateText({ model: anthropic(input.model), system: input.system, prompt: input.query,
                                maxOutputTokens: input.maxOutputTokens, maxRetries: 0, abortSignal: AbortSignal.timeout(QUALITY_CONFIG.requestTimeoutMs) });
                        });
                        if (generated.response.modelId !== input.model) throw new ProbeFailure("GENERATION_PROVIDER_MODEL_MISMATCH");
                        record.responseText = generated.text;
                        record.modelResult = { text: generated.text, finishReason: generated.finishReason, responseId: generated.response.id,
                            modelId: generated.response.modelId, inputTokens: generated.usage.inputTokens ?? null, outputTokens: generated.usage.outputTokens ?? null,
                            totalTokens: generated.usage.totalTokens ?? null, promptCountEstimate: estimatedInput };
                    }
                }
                record.outcome = "complete";
            } catch (error) { record.errorCode = safeProviderFailure(error).code; records.push(record); save(); throw error; }
            records.push(record); save();
        }
    } catch (error) { failure = safeProviderFailure(error); save(); throw error; }
    finally { readDatabaseGenerationInputs(corpus, inputPath); if (resumePath && sha(readFileSync(resumePath, "utf8")) !== continuation!.sourceSha256) throw new ProbeFailure("GENERATION_CONTINUATION_SOURCE_CHANGED"); }
}

async function main() {
    const args = process.argv.slice(2);
    const corpus = readFrozenCorpus(args.find((arg) => arg.startsWith("--corpus="))?.slice("--corpus=".length) ?? "v1");
    const databaseResults = args.find((arg) => arg.startsWith("--database-results="))?.slice("--database-results=".length);
    if (databaseResults) {
        const capture = readDatabaseGenerationInputs(corpus, resolve(databaseResults));
        const resumePath = args.find((arg) => arg.startsWith("--resume-generation-from="))?.slice("--resume-generation-from=".length);
        const continuation = resumePath ? readGenerationContinuation(corpus, capture, resolve(resumePath)) : null;
        if (!args.includes("--execute")) { console.log(JSON.stringify({ ...databaseGenerationPlan(corpus, capture), continuation: continuation ? { sourceSha256: continuation.sourceSha256, reusedCompleteRecords: continuation.records.length, remainingModelCalls: continuation.remainingModelCalls, cumulativeCounters: continuation.counters, priorProviderRequests: continuation.events.length } : null }, null, 2)); return; }
        const output = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
        if (!output) throw new ProbeFailure("EXPLICIT_NEW_OUTPUT_PATH_REQUIRED");
        const envFile = args.find((arg) => arg.startsWith("--env-file="))?.slice("--env-file=".length) ?? resolve(ROOT, ".env.local");
        await executeDatabaseGeneration(corpus, resolve(databaseResults), resolve(output), resolve(envFile), resumePath ? resolve(resumePath) : undefined); return;
    }
    const selectorInputs = args.find((arg) => arg.startsWith("--selector-inputs="))?.slice("--selector-inputs=".length);
    if (selectorInputs) {
        const vectorsPath = args.find((arg) => arg.startsWith("--vectors-from="))?.slice("--vectors-from=".length)
            ?? resolve(ROOT, `tests/fixtures/retrieval/provider-vectors-${corpus.version === "personal-retrieval-v2" ? "v2" : "v1"}.json`);
        const vectors = readDatabaseVectorFixture(corpus, resolve(vectorsPath));
        const captured = readCapturedSelectorInputs(corpus, resolve(selectorInputs), vectors.sha256);
        if (!args.includes("--execute")) { console.log(JSON.stringify(capturedSelectorPlan(captured.artifact), null, 2)); return; }
        const output = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
        if (!output) throw new ProbeFailure("EXPLICIT_NEW_OUTPUT_PATH_REQUIRED");
        const envFile = args.find((arg) => arg.startsWith("--env-file="))?.slice("--env-file=".length) ?? resolve(ROOT, ".env.local");
        await executeCapturedSelectors(corpus, resolve(selectorInputs), resolve(vectorsPath), resolve(output), resolve(envFile));
        return;
    }
    const scorePath = args.find((arg) => arg.startsWith("--score="))?.slice("--score=".length);
    if (scorePath) {
        const artifact = JSON.parse(readFileSync(resolve(scorePath), "utf8")) as { corpusSha256: string; mode?: string; records: QualityRecord[] };
        if (artifact.corpusSha256 !== corpusHash(corpus)) throw new ProbeFailure("SCORE_CORPUS_HASH_MISMATCH");
        const reviewsPath = args.find((arg) => arg.startsWith("--reviews="))?.slice("--reviews=".length);
        const reviews = reviewsPath ? JSON.parse(readFileSync(resolve(reviewsPath), "utf8")) as Adjudication[] : [];
        const score = scoreQuality(corpus, artifact.records, reviews, artifact.mode === "actual-generation-from-production-database-capture");
        console.log(JSON.stringify(score, null, 2));
        process.exitCode = qualityScoreExitCode(score);
        return;
    }
    if (!args.includes("--execute")) { console.log(JSON.stringify(plan(corpus), null, 2)); return; }
    const output = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
    if (!output) throw new ProbeFailure("EXPLICIT_NEW_OUTPUT_PATH_REQUIRED");
    const envFile = args.find((arg) => arg.startsWith("--env-file="))?.slice("--env-file=".length)
        ?? resolve(ROOT, ".env.local");
    const vectorsFrom = args.find((arg) => arg.startsWith("--vectors-from="))?.slice("--vectors-from=".length);
    const resumeFrom = args.find((arg) => arg.startsWith("--resume-acquisition-from="))?.slice("--resume-acquisition-from=".length);
    await execute(corpus, resolve(output), resolve(envFile), args.includes("--vectors-only"), vectorsFrom ? resolve(vectorsFrom) : undefined,
        resumeFrom ? resolve(resumeFrom) : undefined);
}
if (!process.env.VITEST && process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main().catch((error: unknown) => { console.error(JSON.stringify(safeProviderFailure(error))); process.exitCode = 1; });
}
