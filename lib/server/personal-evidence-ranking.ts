import "server-only";
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import type { PersonalEvidenceCandidate } from "@/lib/personal-evidence";

export const PERSONAL_EMBEDDING_MODEL = "gemini-embedding-001";
export const PERSONAL_EMBEDDING_DIMENSIONS = 768;
export const PERSONAL_RETRIEVAL_LIMITS = {
    candidates: 10_000,
    candidateBytes: 25 * 1024 * 1024,
    embeddingBytes: 1_500,
    overlapBytes: 180,
    batchSize: 100,
    concurrency: 4,
    evidenceItems: 8,
    contextBytes: 4_000,
    timeoutMs: 40_000,
} as const;

export type PersonalEvidenceTextField = "highlightedText" | "noteBody" | "prompt" | "reflectionText";
export type PersonalEvidenceSpan = {
    field: PersonalEvidenceTextField;
    /** UTF-16 offsets into the full stored field, matching JavaScript slice. */
    start: number;
    end: number;
    text: string;
    score: number;
};
export type RankedPersonalEvidence = {
    evidence: PersonalEvidenceCandidate;
    score: number;
    spans: PersonalEvidenceSpan[];
    exactQuote: string | null;
};

export class PersonalEvidenceRankingError extends Error {
    constructor(
        public readonly code: "INVALID_INPUT" | "SCOPE_TOO_LARGE" | "EMBEDDING_UNAVAILABLE" | "INVALID_EMBEDDING" | "CANCELLED" | "DEADLINE_EXCEEDED" | "EXACT_QUOTE_UNAVAILABLE" | "EXACT_QUOTE_TOO_LARGE",
        message: string,
    ) {
        super(message);
        this.name = "PersonalEvidenceRankingError";
    }
}

export type PersonalEvidenceEmbedBatch = (texts: string[], options: { signal: AbortSignal }) => Promise<number[][]>;

/** No text, account IDs, or source records are retained in cache values/keys. */
export class PersonalEvidenceVectorCache {
    private readonly entries = new Map<string, { vector: number[]; expiresAt: number }>();

    constructor(private readonly maxEntries = 2_048, private readonly ttlMs = 5 * 60_000) {
        if (!Number.isInteger(maxEntries) || maxEntries < 1 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error("Invalid personal evidence vector cache limits");
        }
    }

    get(key: string, now = Date.now()): number[] | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= now) {
            this.entries.delete(key);
            return undefined;
        }
        this.entries.delete(key);
        this.entries.set(key, entry);
        return [...entry.vector];
    }

    set(key: string, vector: number[], now = Date.now()): void {
        this.entries.delete(key);
        this.entries.set(key, { vector: [...vector], expiresAt: now + this.ttlMs });
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.entries.delete(oldest);
        }
    }
}

const vectorCache = new PersonalEvidenceVectorCache();

export function chunkPersonalEvidenceText(text: string, maxBytes = PERSONAL_RETRIEVAL_LIMITS.embeddingBytes, overlapBytes = PERSONAL_RETRIEVAL_LIMITS.overlapBytes) {
    if (!Number.isInteger(maxBytes) || maxBytes < 4 || overlapBytes < 0 || overlapBytes >= maxBytes) {
        throw new PersonalEvidenceRankingError("INVALID_INPUT", "Invalid evidence chunk limits.");
    }
    const points = Array.from(text);
    const offsets = [0];
    const bytes = points.map((point) => Buffer.byteLength(point, "utf8"));
    points.forEach((point) => offsets.push(offsets[offsets.length - 1] + point.length));
    const chunks: Array<{ start: number; end: number; text: string }> = [];
    let first = 0;
    while (first < points.length) {
        let last = first;
        let size = 0;
        while (last < points.length && size + bytes[last] <= maxBytes) size += bytes[last++];
        chunks.push({ start: offsets[first], end: offsets[last], text: text.slice(offsets[first], offsets[last]) });
        if (last === points.length) break;
        let next = last;
        let overlap = 0;
        while (next > first + 1 && overlap + bytes[next - 1] <= overlapBytes) overlap += bytes[--next];
        first = next;
    }
    return chunks;
}

function textFields(evidence: PersonalEvidenceCandidate): Array<{ field: PersonalEvidenceTextField; text: string }> {
    return evidence.type === "highlight"
        ? [{ field: "highlightedText", text: evidence.highlightedText }, { field: "noteBody", text: evidence.noteBody ?? "" }]
        : [{ field: "prompt", text: evidence.prompt }, { field: "reflectionText", text: evidence.reflectionText }];
}

function validateVector(vector: number[] | undefined): asserts vector is number[] {
    if (!Array.isArray(vector) || vector.length !== PERSONAL_EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite)) {
        throw new PersonalEvidenceRankingError("INVALID_EMBEDDING", "The embedding service returned an invalid vector.");
    }
    const magnitude = Math.hypot(...vector);
    if (!Number.isFinite(magnitude) || magnitude === 0) {
        throw new PersonalEvidenceRankingError("INVALID_EMBEDDING", "The embedding service returned a zero or invalid vector.");
    }
}

function cosine(left: number[], right: number[]): number {
    const leftMagnitude = Math.hypot(...left);
    const rightMagnitude = Math.hypot(...right);
    // Normalize before multiplication to avoid overflow from finite large inputs.
    return left.reduce((sum, value, index) => sum + (value / leftMagnitude) * (right[index] / rightMagnitude), 0);
}

function cacheKey(ownerId: string, fingerprint: string, text: string): string {
    return createHash("sha256").update(JSON.stringify([
        ownerId, fingerprint, PERSONAL_EMBEDDING_MODEL, PERSONAL_EMBEDDING_DIMENSIONS, "default-task-v1", text,
    ])).digest("hex");
}

export function createGooglePersonalEvidenceEmbedder(apiKey: string): PersonalEvidenceEmbedBatch {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
    return async (texts, { signal }) => {
        const response = await ai.models.embedContent({
            model: PERSONAL_EMBEDDING_MODEL,
            contents: texts,
            // Match the existing source vectors' default task type.
            config: { outputDimensionality: PERSONAL_EMBEDDING_DIMENSIONS, abortSignal: signal },
        });
        return (response.embeddings ?? []).map((embedding) => embedding.values ?? []);
    };
}

function abortError(signal: AbortSignal): PersonalEvidenceRankingError {
    return signal.reason instanceof PersonalEvidenceRankingError
        ? signal.reason
        : new PersonalEvidenceRankingError("CANCELLED", "Personal evidence retrieval was cancelled.");
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(abortError(signal));
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
        operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
}

type EmbeddingInput = { text: string; key: string; vector?: number[] };
type EvidenceChunk = { evidence: PersonalEvidenceCandidate; field: PersonalEvidenceTextField; start: number; end: number; input: EmbeddingInput };

async function populateEmbeddingVectors(inputs: EmbeddingInput[], options: {
    embedBatch?: PersonalEvidenceEmbedBatch;
    apiKey?: string;
    cache?: PersonalEvidenceVectorCache;
    controller: AbortController;
    checkActive: () => void;
}) {
    const cache = options.cache ?? vectorCache;
    let cacheHits = 0;
    const missing: EmbeddingInput[] = [];
    for (const input of inputs) {
        input.vector = cache.get(input.key);
        if (input.vector) { validateVector(input.vector); cacheHits += 1; }
        else missing.push(input);
    }
    const embed = options.embedBatch ?? (options.apiKey ? createGooglePersonalEvidenceEmbedder(options.apiKey) : null);
    if (!embed && missing.length > 0) {
        throw new PersonalEvidenceRankingError("EMBEDDING_UNAVAILABLE", "Personal semantic retrieval is not configured.");
    }
    let nextBatch = 0;
    let embeddingBatches = 0;
    let embeddedInputs = 0;
    const batches = Array.from({ length: Math.ceil(missing.length / PERSONAL_RETRIEVAL_LIMITS.batchSize) }, (_, index) =>
        missing.slice(index * PERSONAL_RETRIEVAL_LIMITS.batchSize, (index + 1) * PERSONAL_RETRIEVAL_LIMITS.batchSize));
    const worker = async () => {
        while (nextBatch < batches.length) {
            options.checkActive();
            const batch = batches[nextBatch++];
            embeddingBatches += 1;
            const vectors = await withAbort(embed!(batch.map((input) => input.text), { signal: options.controller.signal }), options.controller.signal);
            options.checkActive();
            if (vectors.length !== batch.length) throw new PersonalEvidenceRankingError("INVALID_EMBEDDING", "The embedding service returned an incomplete batch.");
            vectors.forEach(validateVector);
            batch.forEach((input, index) => {
                input.vector = vectors[index];
                cache.set(input.key, vectors[index]);
            });
            embeddedInputs += batch.length;
        }
    };
    try {
        await Promise.all(Array.from({ length: Math.min(PERSONAL_RETRIEVAL_LIMITS.concurrency, batches.length) }, worker));
    } catch (error) {
        options.controller.abort(error);
        if (error instanceof PersonalEvidenceRankingError) throw error;
        throw new PersonalEvidenceRankingError("EMBEDDING_UNAVAILABLE", "Personal semantic retrieval is temporarily unavailable. Please try again.");
    }
    return { cacheHits, embeddingBatches, embeddedInputs };
}

/** Semantic span selection within editorial rows already authorized/retrieved by the caller. */
export async function rankSourceEvidenceSpans(options: {
    sources: readonly { id: string; text: string; fingerprint?: string }[];
    ownerId: string;
    queryEmbedding: number[];
    embedBatch?: PersonalEvidenceEmbedBatch;
    apiKey?: string;
    cache?: PersonalEvidenceVectorCache;
    signal?: AbortSignal;
    deadlineAt?: number;
}) {
    validateVector(options.queryEmbedding);
    if (!options.ownerId || options.sources.length > 32
        || new Set(options.sources.map((source) => source.id)).size !== options.sources.length) {
        throw new PersonalEvidenceRankingError("INVALID_INPUT", "Invalid source evidence span request.");
    }
    if (options.sources.reduce((total, source) => total + Buffer.byteLength(source.text, "utf8"), 0) > PERSONAL_RETRIEVAL_LIMITS.candidateBytes) {
        throw new PersonalEvidenceRankingError("SCOPE_TOO_LARGE", "Source evidence exceeds the retrieval limit.");
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort(new PersonalEvidenceRankingError("CANCELLED", "Source evidence retrieval was cancelled."));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    const deadline = Math.min(options.deadlineAt ?? Infinity, Date.now() + PERSONAL_RETRIEVAL_LIMITS.timeoutMs);
    const deadlineError = () => new PersonalEvidenceRankingError("DEADLINE_EXCEEDED", "Source evidence retrieval timed out.");
    const timer = setTimeout(() => controller.abort(deadlineError()), Math.max(0, deadline - Date.now()));
    const checkActive = () => {
        if (Date.now() >= deadline) controller.abort(deadlineError());
        if (controller.signal.aborted) throw abortError(controller.signal);
    };
    try {
        checkActive();
        const chunks = options.sources.flatMap((source) => chunkPersonalEvidenceText(source.text).map((span) => ({
            id: source.id, ...span,
            input: { text: span.text, key: cacheKey(options.ownerId, source.fingerprint ?? source.id, `source:${span.start}:${span.text}`) } as EmbeddingInput,
        })));
        const stats = await populateEmbeddingVectors(chunks.map((chunk) => chunk.input), { ...options, controller, checkActive });
        checkActive();
        const best = new Map<string, { id: string; text: string; start: number; end: number; score: number }>();
        for (const chunk of chunks) {
            const score = cosine(options.queryEmbedding, chunk.input.vector!);
            const previous = best.get(chunk.id);
            if (!previous || score > previous.score) best.set(chunk.id, { id: chunk.id, text: chunk.text, start: chunk.start, end: chunk.end, score });
        }
        return {
            spans: options.sources.flatMap((source) => best.get(source.id) ? [best.get(source.id)!] : []),
            stats: { ...stats, chunkCount: chunks.length },
        };
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
    }
}

/** Format already-authorized results, including after a final freshness recheck. */
export function formatRankedPersonalEvidence(ranked: readonly RankedPersonalEvidence[], options: {
    maxEvidenceItems?: number;
    maxContextBytes?: number;
} = {}) {
    const maxItems = options.maxEvidenceItems ?? PERSONAL_RETRIEVAL_LIMITS.evidenceItems;
    const maxBytes = options.maxContextBytes ?? PERSONAL_RETRIEVAL_LIMITS.contextBytes;
    if (!Number.isInteger(maxItems) || maxItems < 0 || maxItems > PERSONAL_RETRIEVAL_LIMITS.evidenceItems
        || !Number.isInteger(maxBytes) || maxBytes < 0 || maxBytes > PERSONAL_RETRIEVAL_LIMITS.contextBytes) {
        throw new PersonalEvidenceRankingError("INVALID_INPUT", "Invalid personal evidence context limits.");
    }
    const items: RankedPersonalEvidence[] = [];
    let contextText = "";
    let omittedByContext = 0;
    let omittedByLimit = 0;
    for (const item of ranked) {
        if (items.length >= maxItems) { omittedByLimit += 1; continue; }
        if (item.spans.length === 0) continue;
        const sourceTitle = item.evidence.source?.title ?? "Source unavailable";
        const fields = item.spans.map((span) => {
            const label = span.field === "highlightedText" ? "STORED HIGHLIGHT" : span.field === "noteBody" ? "USER NOTE" : span.field === "prompt" ? "REFLECTION PROMPT" : "USER REFLECTION";
            return `${label} [${span.start}:${span.end}]:\n${item.exactQuote ?? span.text}`;
        });
        const entry = `[${item.evidence.evidenceId} | ${JSON.stringify(sourceTitle)}]\n${fields.join("\n\n")}`;
        const joined = contextText ? `${contextText}\n\n---\n\n${entry}` : entry;
        if (Buffer.byteLength(joined, "utf8") > maxBytes) {
            if (item.exactQuote !== null) throw new PersonalEvidenceRankingError("EXACT_QUOTE_TOO_LARGE", "The full stored quote exceeds the answer context limit. Open the saved evidence instead.");
            omittedByContext += 1;
            continue;
        }
        contextText = joined;
        items.push(item);
    }
    return { items, contextText, omittedByLimit, omittedByContext, contextBytes: Buffer.byteLength(contextText, "utf8") };
}

export type PersonalEvidenceRankingResult = {
    items: RankedPersonalEvidence[];
    contextText: string;
    stats: {
        rankingMode: "semantic";
        complete: true;
        candidateCount: number;
        chunkCount: number;
        cacheHits: number;
        embeddedInputs: number;
        embeddingBatches: number;
        eligibleCount: number;
        selectedCount: number;
        omittedByLimit: number;
        omittedByContext: number;
        contextBytes: number;
        /** This is a UTF-8 byte ceiling, not measured model tokens. */
        contextByteLimit: number;
        similarityThreshold: number;
    };
};

/** Call only after complete, live, owner-scoped loading; cache never loads evidence. */
export async function rankPersonalEvidence(options: {
    candidates: readonly PersonalEvidenceCandidate[];
    ownerId: string;
    question: string;
    embedBatch?: PersonalEvidenceEmbedBatch;
    apiKey?: string;
    cache?: PersonalEvidenceVectorCache;
    signal?: AbortSignal;
    deadlineAt?: number;
    similarityThreshold?: number;
    maxEvidenceItems?: number;
    maxContextBytes?: number;
    /** Must use this module's model, dimensionality, and default task type. */
    queryEmbedding?: number[];
    exactQuote?: { evidenceId?: string; field: PersonalEvidenceTextField };
}): Promise<PersonalEvidenceRankingResult> {
    const threshold = options.similarityThreshold ?? 0.55;
    const maxItems = options.maxEvidenceItems ?? PERSONAL_RETRIEVAL_LIMITS.evidenceItems;
    const maxBytes = options.maxContextBytes ?? PERSONAL_RETRIEVAL_LIMITS.contextBytes;
    if (!options.ownerId || !options.question.trim() || Buffer.byteLength(options.question, "utf8") > 16_000 || !Number.isFinite(threshold) || threshold < -1 || threshold > 1
        || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > PERSONAL_RETRIEVAL_LIMITS.evidenceItems
        || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > PERSONAL_RETRIEVAL_LIMITS.contextBytes) {
        throw new PersonalEvidenceRankingError("INVALID_INPUT", "Invalid personal evidence ranking request.");
    }
    if (options.candidates.length > PERSONAL_RETRIEVAL_LIMITS.candidates) {
        throw new PersonalEvidenceRankingError("SCOPE_TOO_LARGE", "This evidence scope is too large. Narrow the scope and try again.");
    }
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort(new PersonalEvidenceRankingError("CANCELLED", "Personal evidence retrieval was cancelled."));
    options.signal?.addEventListener("abort", onCallerAbort, { once: true });
    if (options.signal?.aborted) onCallerAbort();
    const deadline = Math.min(options.deadlineAt ?? Infinity, Date.now() + PERSONAL_RETRIEVAL_LIMITS.timeoutMs);
    const deadlineError = () => new PersonalEvidenceRankingError("DEADLINE_EXCEEDED", "Personal evidence retrieval timed out. Narrow the scope or try again.");
    const timer = setTimeout(() => controller.abort(deadlineError()), Math.max(0, deadline - Date.now()));
    const checkActive = () => {
        if (Date.now() >= deadline) controller.abort(deadlineError());
        if (controller.signal.aborted) throw abortError(controller.signal);
    };

    try {
        checkActive();
        const seen = new Set<string>();
        let candidateBytes = 0;
        const chunks: EvidenceChunk[] = [];
        const inputs: EmbeddingInput[] = [];
        for (const evidence of options.candidates) {
            checkActive();
            if (evidence.userId !== options.ownerId || seen.has(evidence.evidenceId)) {
                throw new PersonalEvidenceRankingError("INVALID_INPUT", "Evidence ownership or identity is invalid.");
            }
            seen.add(evidence.evidenceId);
            candidateBytes += Buffer.byteLength(JSON.stringify(evidence), "utf8");
            if (candidateBytes > PERSONAL_RETRIEVAL_LIMITS.candidateBytes) {
                throw new PersonalEvidenceRankingError("SCOPE_TOO_LARGE", "This evidence scope is too large. Narrow the scope and try again.");
            }
            for (const { field, text } of textFields(evidence)) {
                if (!text.trim()) continue;
                for (const span of chunkPersonalEvidenceText(text)) {
                    const input = { text: span.text, key: cacheKey(options.ownerId, evidence.fingerprint, `${field}:${span.start}:${span.text}`) };
                    inputs.push(input);
                    chunks.push({ evidence, field, start: span.start, end: span.end, input });
                }
            }
        }

        const quoteEvidence = options.exactQuote?.evidenceId && options.candidates.find((candidate) => candidate.evidenceId === options.exactQuote?.evidenceId);
        const quote = quoteEvidence && textFields(quoteEvidence).find(({ field }) => field === options.exactQuote?.field)?.text;
        if (options.exactQuote?.evidenceId && !quote) {
            throw new PersonalEvidenceRankingError("EXACT_QUOTE_UNAVAILABLE", "The requested stored quote is not available in this authorized scope.");
        }
        if (quote && Buffer.byteLength(quote, "utf8") > maxBytes) {
            throw new PersonalEvidenceRankingError("EXACT_QUOTE_TOO_LARGE", "The full stored quote exceeds the answer context limit. Open the saved evidence instead.");
        }

        if (options.queryEmbedding) validateVector(options.queryEmbedding);
        const queryInputs = options.queryEmbedding ? [] : chunkPersonalEvidenceText(options.question).map(({ text }) => ({
            text, key: cacheKey(options.ownerId, "query-v1", text),
        } as EmbeddingInput));
        inputs.push(...queryInputs);
        const { cacheHits, embeddedInputs, embeddingBatches } = chunks.length > 0
            ? await populateEmbeddingVectors(inputs, { ...options, controller, checkActive })
            : { cacheHits: 0, embeddedInputs: 0, embeddingBatches: 0 };
        checkActive();

        const queryMagnitudes = queryInputs.map((input) => input.vector ? Math.hypot(...input.vector) : 1);
        const queryVector = options.queryEmbedding ?? Array.from({ length: PERSONAL_EMBEDDING_DIMENSIONS }, (_, index) =>
            queryInputs.reduce((sum, input, inputIndex) => sum + (input.vector?.[index] ?? 0) / queryMagnitudes[inputIndex], 0));
        if (chunks.length > 0) validateVector(queryVector);
        const bestByField = new Map<string, Map<PersonalEvidenceTextField, PersonalEvidenceSpan>>();
        for (const chunk of chunks) {
            if (options.exactQuote && chunk.field !== options.exactQuote.field) continue;
            const score = cosine(queryVector, chunk.input.vector!);
            const fields = bestByField.get(chunk.evidence.evidenceId) ?? new Map<PersonalEvidenceTextField, PersonalEvidenceSpan>();
            const previous = fields.get(chunk.field);
            if (!previous || score > previous.score) {
                fields.set(chunk.field, { field: chunk.field, start: chunk.start, end: chunk.end, text: chunk.input.text, score });
            }
            bestByField.set(chunk.evidence.evidenceId, fields);
        }
        const scored: RankedPersonalEvidence[] = options.candidates.flatMap((evidence) => {
            const fields = bestByField.get(evidence.evidenceId);
            if (!fields) return [];
            const spans = textFields(evidence).flatMap(({ field }) => fields.get(field) ? [fields.get(field)!] : []);
            // A question/prompt is context, never sufficient proof that the user's
            // reflection contains an answer. Attached notes remain distinct from
            // source quotations even when the quotation scores more strongly.
            const relevantSpans = evidence.type === "reflection" && !options.exactQuote
                ? spans.filter((span) => span.field === "reflectionText")
                : spans;
            if (relevantSpans.length === 0) return [];
            return [{ evidence, spans, score: Math.max(...relevantSpans.map((span) => span.score)), exactQuote: null }];
        });
        let ranked = scored.filter((item) => item.score >= threshold || item.evidence.evidenceId === options.exactQuote?.evidenceId)
            .sort((a, b) => {
                if (a.evidence.evidenceId === options.exactQuote?.evidenceId) return -1;
                if (b.evidence.evidenceId === options.exactQuote?.evidenceId) return 1;
                return b.score - a.score || a.evidence.evidenceId.localeCompare(b.evidence.evidenceId);
            });
        if (options.exactQuote) {
            // A natural quotation request resolves to one best eligible stored field.
            // An explicit ID is a lookup within the already-authorized candidate set.
            const target = ranked[0];
            ranked = target ? [{
                ...target,
                exactQuote: textFields(target.evidence).find(({ field }) => field === options.exactQuote?.field)!.text,
                spans: [{
                    ...target.spans[0], start: 0,
                    end: textFields(target.evidence).find(({ field }) => field === options.exactQuote?.field)!.text.length,
                    text: textFields(target.evidence).find(({ field }) => field === options.exactQuote?.field)!.text,
                }],
            }] : [];
        }
        checkActive();
        const { items, contextText, omittedByLimit, omittedByContext, contextBytes } = formatRankedPersonalEvidence(ranked, { maxEvidenceItems: maxItems, maxContextBytes: maxBytes });
        return {
            items, contextText,
            stats: {
                rankingMode: "semantic", complete: true, candidateCount: options.candidates.length,
                chunkCount: chunks.length, cacheHits, embeddedInputs, embeddingBatches,
                eligibleCount: ranked.length, selectedCount: items.length, omittedByLimit, omittedByContext,
                contextBytes, contextByteLimit: maxBytes, similarityThreshold: threshold,
            },
        };
    } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onCallerAbort);
    }
}
