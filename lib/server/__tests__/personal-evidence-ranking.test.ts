import { describe, expect, it, vi } from "vitest";
import type { HighlightEvidenceCandidate, ReflectionEvidenceCandidate } from "@/lib/personal-evidence";
import {
    chunkPersonalEvidenceText,
    formatRankedPersonalEvidence,
    PERSONAL_EMBEDDING_DIMENSIONS,
    PERSONAL_RETRIEVAL_LIMITS,
    PersonalEvidenceVectorCache,
    rankPersonalEvidence,
    rankSourceEvidenceSpans,
    type PersonalEvidenceEmbedBatch,
} from "@/lib/server/personal-evidence-ranking";

function vector(relevant = true): number[] {
    const values = Array(PERSONAL_EMBEDDING_DIMENSIONS).fill(0) as number[];
    values[relevant ? 0 : 1] = 1;
    return values;
}

function highlight(id: string, overrides: Partial<HighlightEvidenceCandidate> = {}): HighlightEvidenceCandidate {
    return {
        type: "highlight", evidenceId: `highlight:${id}`, id, userId: "owner-a", contentItemId: "source-a",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", fingerprint: id,
        sourceStatus: "available", source: { id: "source-a", title: "Source", author: "Author", updatedAt: "2026-01-01T00:00:00Z" },
        highlightedText: "TARGET selected passage", noteBody: null, color: "yellow", segmentId: "segment-a",
        anchorStart: 4, anchorEnd: 28, segment: null, readerAnchor: null,
        ...overrides,
    };
}

function reflection(id: string, overrides: Partial<ReflectionEvidenceCandidate> = {}): ReflectionEvidenceCandidate {
    return {
        type: "reflection", evidenceId: `reflection:${id}`, id, userId: "owner-a", contentItemId: "source-a",
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", fingerprint: id,
        sourceStatus: "unavailable", source: null, prompt: "What changed?", reflectionText: "TARGET my interpretation",
        ...overrides,
    };
}

const embed: PersonalEvidenceEmbedBatch = async (texts) => texts.map((text) => vector(text.includes("TARGET")));
const defaults = () => ({ ownerId: "owner-a", question: "TARGET question", embedBatch: embed, cache: new PersonalEvidenceVectorCache() });

describe("personal evidence semantic ranking boundaries", () => {
    it("evaluates older evidence beyond 1,000 candidates rather than a lexical or client shortlist", async () => {
        const candidates = Array.from({ length: 1_005 }, (_, index) => highlight(String(index), { highlightedText: "Warehouse shipping inventory" }));
        candidates.push(highlight("older", { highlightedText: "TARGET decisive older passage", createdAt: "2020-01-01T00:00:00Z" }));
        const seen: string[] = [];
        const result = await rankPersonalEvidence({ ...defaults(), candidates, embedBatch: async (texts, options) => {
            seen.push(...texts);
            return embed(texts, options);
        } });
        expect(seen).toHaveLength(1_007);
        expect(result.items.map((item) => item.evidence.id)).toEqual(["older"]);
        expect(result.stats).toMatchObject({ complete: true, candidateCount: 1_006, eligibleCount: 1, selectedCount: 1 });
    });

    it("keeps highlight, user note, and reflection identities and full stored text separate", async () => {
        const selected = highlight("h", { highlightedText: "The editorial view", noteBody: "TARGET I disagree with the author" });
        const personal = reflection("r");
        const result = await rankPersonalEvidence({ ...defaults(), candidates: [selected, personal] });
        expect(result.items).toHaveLength(2);
        expect(result.items[0].evidence).toEqual(selected);
        expect(result.items[0].spans.map((span) => span.field)).toEqual(["highlightedText", "noteBody"]);
        expect(result.items[1].spans.map((span) => span.field)).toEqual(["prompt", "reflectionText"]);
        expect(result.contextText).toContain("USER NOTE");
        expect(result.contextText).toContain("USER REFLECTION");
        expect(result.contextText).toContain("TARGET I disagree with the author");
        expect(result.contextText).toContain("What changed?");
        expect(result.contextText).toContain("TARGET my interpretation");
        expect(result.contextText).toContain("Source unavailable");
    });

    it("never qualifies a reflection from its prompt alone or drops a conflicting user note", async () => {
        const result = await rankPersonalEvidence({ ...defaults(), candidates: [
            reflection("prompt-only", { prompt: "TARGET matching question", reflectionText: "Unrelated personal answer" }),
            highlight("conflict", { highlightedText: "TARGET authoritative source view", noteBody: "I disagree; caring responsibilities change this advice." }),
        ] });
        expect(result.items.map((item) => item.evidence.id)).toEqual(["conflict"]);
        expect(result.contextText).toContain("STORED HIGHLIGHT");
        expect(result.contextText).toContain("USER NOTE");
        expect(result.contextText).toContain("I disagree; caring responsibilities change this advice.");
    });

    it("selects a decisive later span without clipping the stored evidence at 220 characters", async () => {
        const text = `${"unrelated ".repeat(420)}TARGET decisive later evidence`;
        const candidate = highlight("long", { highlightedText: text });
        const result = await rankPersonalEvidence({ ...defaults(), candidates: [candidate] });
        const span = result.items[0].spans[0];
        expect(span.start).toBeGreaterThan(220);
        expect(span.text).toContain("TARGET decisive later evidence");
        expect(text.slice(span.start, span.end)).toBe(span.text);
        expect(result.items[0].evidence).toEqual(candidate);
    });

    it("rejects foreign ownership and duplicate identity before embedding", async () => {
        const embedBatch = vi.fn(embed);
        await expect(rankPersonalEvidence({ ...defaults(), embedBatch, candidates: [highlight("foreign", { userId: "owner-b" })] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        await expect(rankPersonalEvidence({ ...defaults(), embedBatch, candidates: [highlight("same"), highlight("same")] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(embedBatch).not.toHaveBeenCalled();
    });

    it("explicitly fails oversized candidate count or bytes", async () => {
        await expect(rankPersonalEvidence({ ...defaults(), candidates: Array.from({ length: 10_001 }, (_, index) => highlight(String(index))) })).rejects.toMatchObject({ code: "SCOPE_TOO_LARGE" });
        await expect(rankPersonalEvidence({ ...defaults(), candidates: [highlight("huge", { highlightedText: "x".repeat(PERSONAL_RETRIEVAL_LIMITS.candidateBytes) })] })).rejects.toMatchObject({ code: "SCOPE_TOO_LARGE" });
    });

    it("never turns provider errors, incomplete batches, non-finite, zero, or wrong-dimensional vectors into fallback results", async () => {
        const badEmbedders: PersonalEvidenceEmbedBatch[] = [
            async () => { throw new Error("provider private detail"); },
            async () => [],
            async (texts) => texts.map(() => [1]),
            async (texts) => texts.map(() => Array(PERSONAL_EMBEDDING_DIMENSIONS).fill(NaN)),
            async (texts) => texts.map(() => Array(PERSONAL_EMBEDDING_DIMENSIONS).fill(Infinity)),
            async (texts) => texts.map(() => Array(PERSONAL_EMBEDDING_DIMENSIONS).fill(0)),
        ];
        for (const embedBatch of badEmbedders) {
            await expect(rankPersonalEvidence({ ...defaults(), candidates: [highlight("h")], embedBatch })).rejects.toMatchObject({
                name: "PersonalEvidenceRankingError",
            });
        }
    });

    it("limits batches to 100 and active provider calls to four", async () => {
        let active = 0;
        let maximum = 0;
        const sizes: number[] = [];
        const result = await rankPersonalEvidence({ ...defaults(), candidates: Array.from({ length: 401 }, (_, index) => highlight(String(index))), embedBatch: async (texts, options) => {
            sizes.push(texts.length);
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => setTimeout(resolve, 1));
            active -= 1;
            return embed(texts, options);
        } });
        expect(maximum).toBe(4);
        expect(Math.max(...sizes)).toBe(100);
        expect(result.stats.embeddingBatches).toBe(5);
        expect(result.items).toHaveLength(8);
        expect(result.stats.omittedByLimit).toBe(393);
    });

    it("honors cancellation even if an injected provider never settles", async () => {
        const controller = new AbortController();
        const pending = rankPersonalEvidence({ ...defaults(), candidates: [highlight("h")], signal: controller.signal, embedBatch: async () => new Promise(() => {}) });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    });

    it("honors the overall deadline without depending on provider abort support", async () => {
        await expect(rankPersonalEvidence({ ...defaults(), candidates: [highlight("h")], deadlineAt: Date.now() + 15, embedBatch: async () => new Promise(() => {}) })).rejects.toMatchObject({ code: "DEADLINE_EXCEEDED" });
    });

    it("uses the explicit semantic threshold and abstains rather than return irrelevant scope order", async () => {
        const result = await rankPersonalEvidence({ ...defaults(), candidates: [highlight("noise", { highlightedText: "Warehouse only" })], similarityThreshold: 0.55 });
        expect(result.items).toEqual([]);
        expect(result.contextText).toBe("");
        expect(result.stats.eligibleCount).toBe(0);
    });

    it("reuses a validated query embedding without embedding the query again", async () => {
        const embedBatch = vi.fn(embed);
        await rankPersonalEvidence({ ...defaults(), candidates: [highlight("h")], embedBatch, queryEmbedding: vector() });
        expect(embedBatch.mock.calls[0][0]).toEqual(["TARGET selected passage"]);
        await expect(rankPersonalEvidence({ ...defaults(), candidates: [highlight("h")], queryEmbedding: [1] })).rejects.toMatchObject({ code: "INVALID_EMBEDDING" });
    });

    it("uses stable evidence identity for equal semantic scores", async () => {
        const result = await rankPersonalEvidence({ ...defaults(), candidates: [highlight("z"), highlight("a")] });
        expect(result.items.map((item) => item.evidence.id)).toEqual(["a", "z"]);
    });
});

describe("UTF-8 chunks and bounded context", () => {
    it("semantically selects later editorial spans without representing sources as personal highlights", async () => {
        const text = `${"source introduction ".repeat(200)}TARGET decisive source ending`;
        const result = await rankSourceEvidenceSpans({ ...defaults(), sources: [{ id: "source-segment", text }], queryEmbedding: vector() });
        expect(result.spans).toHaveLength(1);
        expect(result.spans[0].start).toBeGreaterThan(220);
        expect(result.spans[0].text).toContain("TARGET decisive source ending");
        expect(text.slice(result.spans[0].start, result.spans[0].end)).toBe(result.spans[0].text);
        expect(result.spans[0]).not.toHaveProperty("type");
        expect(result.stats.chunkCount).toBeGreaterThan(1);
    });

    it("covers all Unicode code points with valid original offsets, overlap, and <=1,500-byte inputs", () => {
        const text = "A🧠漢字é".repeat(600);
        const chunks = chunkPersonalEvidenceText(text);
        const covered = Array(text.length).fill(false);
        chunks.forEach((chunk, index) => {
            expect(Buffer.byteLength(chunk.text, "utf8")).toBeLessThanOrEqual(1_500);
            expect(chunk.text).toBe(text.slice(chunk.start, chunk.end));
            expect(chunk.text).not.toContain("�");
            for (let position = chunk.start; position < chunk.end; position += 1) covered[position] = true;
            if (index > 0) expect(chunk.start).toBeLessThan(chunks[index - 1].end);
        });
        expect(covered.every(Boolean)).toBe(true);
    });

    it("counts formatting and Unicode within the 4,000-byte ceiling without claiming a token count", async () => {
        const result = await rankPersonalEvidence({ ...defaults(), candidates: Array.from({ length: 8 }, (_, index) => highlight(String(index), { highlightedText: `TARGET ${"漢".repeat(450)}` })) });
        expect(Buffer.byteLength(result.contextText, "utf8")).toBeLessThanOrEqual(4_000);
        expect(result.stats.contextBytes).toBe(Buffer.byteLength(result.contextText, "utf8"));
        expect(result.stats.omittedByContext).toBeGreaterThan(0);
        expect(result.stats).not.toHaveProperty("tokens");
        const reformatted = formatRankedPersonalEvidence(result.items, { maxEvidenceItems: 1, maxContextBytes: 2_000 });
        expect(reformatted.items).toHaveLength(1);
        expect(reformatted.contextBytes).toBeLessThanOrEqual(2_000);
    });

    it("returns full exact stored text for the highest eligible matching field", async () => {
        const fullQuote = `TARGET ${"long stored quote, ".repeat(120)}`;
        const result = await rankPersonalEvidence({ ...defaults(), candidates: [highlight("a", { highlightedText: "Warehouse" }), highlight("b", { highlightedText: fullQuote, noteBody: "TARGET separate note" })], exactQuote: { field: "highlightedText" } });
        expect(result.items).toHaveLength(1);
        expect(result.items[0].evidence.id).toBe("b");
        expect(result.items[0].exactQuote).toBe(fullQuote);
        expect(result.items[0].spans[0]).toMatchObject({ start: 0, end: fullQuote.length, text: fullQuote });
        expect(result.contextText).toContain(fullQuote);
    });

    it("rejects unauthorized exact IDs and never truncates a quote that cannot fit", async () => {
        await expect(rankPersonalEvidence({ ...defaults(), candidates: [highlight("a")], exactQuote: { evidenceId: "highlight:foreign", field: "highlightedText" } })).rejects.toMatchObject({ code: "EXACT_QUOTE_UNAVAILABLE" });
        await expect(rankPersonalEvidence({ ...defaults(), candidates: [highlight("a", { highlightedText: `TARGET ${"x".repeat(4_000)}` })], exactQuote: { field: "highlightedText" } })).rejects.toMatchObject({ code: "EXACT_QUOTE_TOO_LARGE" });
        await expect(rankPersonalEvidence({ ...defaults(), candidates: [highlight("a")], maxContextBytes: 25, exactQuote: { field: "highlightedText" } })).rejects.toMatchObject({ code: "EXACT_QUOTE_TOO_LARGE" });
    });

    it("abstains when no relevant exact-quote field exists", async () => {
        const result = await rankPersonalEvidence({ ...defaults(), candidates: [highlight("a")], exactQuote: { field: "noteBody" } });
        expect(result.items).toEqual([]);
    });
});

describe("ephemeral vector cache", () => {
    it("reuses only vectors and cannot restore deleted evidence or reuse another owner's vectors", async () => {
        const cache = new PersonalEvidenceVectorCache();
        const embedBatch = vi.fn(embed);
        await rankPersonalEvidence({ ...defaults(), cache, embedBatch, candidates: [highlight("a")] });
        const second = await rankPersonalEvidence({ ...defaults(), cache, embedBatch, candidates: [highlight("a")] });
        expect(embedBatch).toHaveBeenCalledTimes(1);
        expect(second.stats.cacheHits).toBe(2);
        const deleted = await rankPersonalEvidence({ ...defaults(), cache, embedBatch, candidates: [] });
        expect(deleted.items).toEqual([]);
        await rankPersonalEvidence({ ...defaults(), ownerId: "owner-b", cache, embedBatch, candidates: [highlight("a", { userId: "owner-b" })] });
        expect(embedBatch).toHaveBeenCalledTimes(2);
        await rankPersonalEvidence({ ...defaults(), cache, embedBatch, candidates: [highlight("a", { fingerprint: "edited", highlightedText: "TARGET changed" })] });
        expect(embedBatch).toHaveBeenCalledTimes(3);
    });

    it("expires and evicts entries and protects cached vectors from mutation", () => {
        const cache = new PersonalEvidenceVectorCache(2, 10);
        cache.set("a", [1], 0);
        cache.set("b", [2], 0);
        const cached = cache.get("a", 1)!;
        cached[0] = 99;
        cache.set("c", [3], 1);
        expect(cache.get("b", 2)).toBeUndefined();
        expect(cache.get("a", 2)).toEqual([1]);
        expect(cache.get("a", 10)).toBeUndefined();
    });
});
