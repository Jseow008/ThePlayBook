import { afterEach, describe, expect, it, vi } from "vitest";
import { createIndexEmbedder, processPersonalEvidenceIndex, type IndexRpc } from "@/lib/server/personal-evidence-indexer";
import { GET } from "@/app/api/admin/personal-evidence/process/route";
import { NextRequest } from "next/server";
const vector = () => Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
const workerLease = { worker_token: "00000000-0000-4000-8000-000000000099", worker_expires_at: "2099-01-01T00:00:00+00:00" };
function claim(id = "one", type = "highlight") {
    return { evidence_type: type, evidence_id: id === "one" ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002", revision: "00000000-0000-4000-8000-000000000003", lease_token: "00000000-0000-4000-8000-000000000004", index_version: "gemini-embedding-001:768:personal-v1", attempts: 1, highlighted_text: "A saved passage", note_body: "A personal note", prompt: "Reflection question", reflection_text: "My reflection" };
}
function database(claims = [claim()]) {
    let claimed = false;
    const rpc = vi.fn<IndexRpc>(async name => ({ data: name === "acquire_personal_evidence_worker" ? workerLease : name === "claim_personal_evidence_index" ? (claimed ? [] : (claimed = true, claims)) : name === "seed_personal_evidence_index" ? { seeded_records: 0 } : true, error: null }));
    return rpc;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("bounded personal evidence index worker", () => {
    it("embeds full source fields with exact UTF16 offsets and no batch larger than two", async () => {
        const item = { ...claim(), highlighted_text: "😀 long passage ".repeat(200) };
        const rpc = database([item, claim("two", "reflection")]);
        const embed = vi.fn(async (texts: string[]) => texts.map(vector));
        const result = await processPersonalEvidenceIndex({ rpc, embed });
        expect(result.completed).toBe(2);
        expect(embed.mock.calls.every(([texts]) => texts.length <= 2)).toBe(true);
        const writes = rpc.mock.calls.filter(([name]) => name === "complete_personal_evidence_index");
        const chunks = writes[0][1].p_chunks as { field: string; chunk_index: number; start_offset: number; end_offset: number; embedding: number[]; text?: string }[];
        const passage = chunks.filter(c => c.field === "highlightedText");
        expect(passage[0].start_offset).toBe(0);
        expect(passage.at(-1)?.end_offset).toBe(item.highlighted_text.length);
        expect(passage.map(c => c.chunk_index)).toEqual(passage.map((_, i) => i));
        for (const chunk of passage) {
            expect(Buffer.byteLength(item.highlighted_text.slice(chunk.start_offset, chunk.end_offset))).toBeLessThanOrEqual(1500);
            expect(chunk).not.toHaveProperty("text");
        }
        expect((writes[1][1].p_chunks as { field: string }[]).map(c => c.field)).toEqual(["prompt", "reflectionText"]);
        expect(writes[0][1]).toMatchObject({ p_revision: claim().revision, p_lease_token: claim().lease_token });
        expect(rpc.mock.calls[0][0]).toBe("acquire_personal_evidence_worker");
        expect(rpc.mock.calls.filter(([name]) => name === "claim_personal_evidence_index").every(([, args]) => args.p_worker_token === workerLease.worker_token)).toBe(true);
        expect(rpc.mock.lastCall?.slice(0, 2)).toEqual(["release_personal_evidence_worker", { p_worker_token: workerLease.worker_token }]);
    });
    it("continues bounded claims without exceeding twenty records per invocation", async () => {
        const rpc = database();
        rpc.mockImplementation(async name => ({ data: name === "acquire_personal_evidence_worker" ? workerLease : name === "claim_personal_evidence_index" ? [claim(), claim("two")] : true, error: null }));
        const result = await processPersonalEvidenceIndex({ rpc, embed: async texts => texts.map(vector) });
        expect(result).toMatchObject({ claimed: 20, completed: 20, stopReason: "batch_limit" });
        expect(rpc.mock.calls.filter(([name]) => name === "claim_personal_evidence_index")).toHaveLength(10);
    });
    it("does no backfill or provider work while another invocation owns admission", async () => {
        const rpc = database();
        rpc.mockImplementation(async () => ({ data: null, error: null }));
        const embed = vi.fn();
        expect(await processPersonalEvidenceIndex({ rpc, embed })).toMatchObject({ claimed: 0, stopReason: "worker_busy_or_provider_cooldown" });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(embed).not.toHaveBeenCalled();
    });
    it("releases invocation admission even when seeding fails before any claim", async () => {
        const rpc = database();
        rpc.mockImplementation(async name => ({ data: name === "acquire_personal_evidence_worker" ? workerLease : true,
            error: name === "seed_personal_evidence_index" ? new Error("database unavailable") : null }));
        await expect(processPersonalEvidenceIndex({ rpc, embed: vi.fn() })).rejects.toThrow("Personal index database operation failed");
        expect(rpc.mock.lastCall?.slice(0, 2)).toEqual(["release_personal_evidence_worker", { p_worker_token: workerLease.worker_token }]);
    });
    it("sends the approved model, dimensionality and independent texts through the transport", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ embeddings: [{ values: vector() }, { values: vector() }] })));
        vi.stubGlobal("fetch", fetcher);
        await createIndexEmbedder("test-secret")(["first", "second"], new AbortController().signal);
        const [url, request] = fetcher.mock.calls[0];
        expect(url.endsWith("models/gemini-embedding-001:batchEmbedContents")).toBe(true);
        expect(JSON.parse(request.body).requests).toEqual(["first", "second"].map(text => ({ model: "models/gemini-embedding-001", content: { parts: [{ text }] }, outputDimensionality: 768 })));
        expect(request.headers["x-goog-api-key"]).toBe("test-secret");
    });
    it("honors provider Retry-After without retrying and defers all outstanding claims", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "private source must never escape" } }), { status: 429, headers: { "Retry-After": "900" } }));
        vi.stubGlobal("fetch", fetcher);
        const rpc = database([claim(), claim("two")]);
        const result = await processPersonalEvidenceIndex({ rpc, embed: createIndexEmbedder("secret") });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ completed: 0, deferred: 2, retryAfterSeconds: 900 });
        expect(rpc.mock.calls.filter(([name]) => name === "fail_personal_evidence_index").map(([, args]) => args.p_retry_after_seconds)).toEqual([900, 900]);
        expect(rpc.mock.calls.filter(([name]) => name === "fail_personal_evidence_index").every(([, args]) => args.p_rate_limited === true)).toBe(true);
        expect(rpc.mock.calls.some(([name]) => name === "complete_personal_evidence_index")).toBe(false);
        expect(JSON.stringify(result)).not.toContain("private source");
    });
    it("uses Google retry details when no Retry-After header is supplied", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { details: [{ retryDelay: "120.5s" }] } }), { status: 429 })));
        const result = await processPersonalEvidenceIndex({ rpc: database(), embed: createIndexEmbedder("secret") });
        expect(result.retryAfterSeconds).toBe(121);
    });
    it("terminally rejects oversized records before spending provider quota", async () => {
        const rpc = database([{ ...claim(), highlighted_text: "x".repeat(65 * 1024) }]);
        const embed = vi.fn();
        expect(await processPersonalEvidenceIndex({ rpc, embed })).toMatchObject({ failed: 1, completed: 0 });
        expect(embed).not.toHaveBeenCalled();
        expect(rpc.mock.calls.find(([name]) => name === "fail_personal_evidence_index")?.[1]).toMatchObject({ p_terminal: true });
    });
    it("fails closed on malformed claim identity", async () => {
        const rpc = database([{ ...claim(), lease_token: "invalid" }]);
        const embed = vi.fn();
        await expect(processPersonalEvidenceIndex({ rpc, embed })).rejects.toThrow();
        expect(embed).not.toHaveBeenCalled();
    });
    it("never commits malformed vectors or partial embeddings", async () => {
        const rpc = database();
        await processPersonalEvidenceIndex({ rpc, embed: async () => [[1]] });
        expect(rpc.mock.calls.some(([name]) => name === "complete_personal_evidence_index")).toBe(false);
        expect(rpc.mock.calls.some(([name]) => name === "fail_personal_evidence_index")).toBe(true);
        expect(rpc.mock.calls.find(([name]) => name === "fail_personal_evidence_index")?.[1].p_rate_limited).toBe(false);
    });
    it("does not report a stale fenced completion as indexed", async () => {
        const rpc = database();
        let claimed = false;
        rpc.mockImplementation(async name => ({ data: name === "acquire_personal_evidence_worker" ? workerLease : name === "claim_personal_evidence_index" ? (claimed ? [] : (claimed = true, [claim()])) : name === "complete_personal_evidence_index" ? false : true, error: null }));
        expect(await processPersonalEvidenceIndex({ rpc, embed: async texts => texts.map(vector) })).toMatchObject({ completed: 0, stale: 1 });
    });
    it("releases outstanding leases after cancellation and never commits a late provider response", async () => {
        const controller = new AbortController();
        const rpc = database([claim(), claim("two")]);
        const embed = vi.fn(async (texts: string[]) => { controller.abort(); return texts.map(vector); });
        const result = await processPersonalEvidenceIndex({ rpc, embed, signal: controller.signal });
        expect(result.deferred).toBe(2);
        expect(embed).toHaveBeenCalledTimes(1);
        expect(rpc.mock.calls.some(([name]) => name === "complete_personal_evidence_index")).toBe(false);
        const releases = rpc.mock.calls.filter(([name]) => name === "fail_personal_evidence_index");
        expect(releases.every(([, , signal]) => !signal.aborted)).toBe(true);
        expect(rpc.mock.lastCall?.[0]).toBe("release_personal_evidence_worker");
        expect(rpc.mock.lastCall?.[2].aborted).toBe(false);
    });
    it("rejects a pre-cancelled invocation without database or provider work", async () => {
        const rpc = database(); const embed = vi.fn();
        await expect(processPersonalEvidenceIndex({ rpc, embed, signal: AbortSignal.abort() })).rejects.toThrow();
        expect(rpc).not.toHaveBeenCalled(); expect(embed).not.toHaveBeenCalled();
    });
    it("refuses unauthenticated cron requests before provider/database configuration", async () => {
        vi.stubEnv("CRON_SECRET", "expected");
        expect((await GET(new NextRequest("http://localhost/api/admin/personal-evidence/process"))).status).toBe(401);
        vi.stubEnv("CRON_SECRET", "");
        expect((await GET(new NextRequest("http://localhost/api/admin/personal-evidence/process", { headers: { authorization: "Bearer " } }))).status).toBe(401);
    });
});
