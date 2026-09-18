import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertActivePersonalRetrievalSession } from "@/lib/server/personal-retrieval-session";
const abortSignal = vi.fn();
const rpc = vi.fn(() => ({ abortSignal }));
const supabase = { rpc } as unknown as Parameters<typeof assertActivePersonalRetrievalSession>[0]["supabase"];
const scope = { version: 1, itemType: "all" } as const;
const ready = { status: "ready", total_records: 2, ready_records: 2, pending_records: 0, failed_records: 0 };
beforeEach(() => { vi.clearAllMocks(); abortSignal.mockResolvedValue({ data: ready, error: null }); });
describe("final retrieval session boundary", () => {
    it("checks the live session-guarded RPC with the actual scope", async () => {
        const signal = new AbortController().signal;
        await assertActivePersonalRetrievalSession({ supabase, scope, signal });
        expect(rpc).toHaveBeenCalledWith("personal_evidence_index_status", { p_scope: scope });
        expect(abortSignal).toHaveBeenCalledWith(signal);
    });
    it("rejects revoked sessions, malformed status and newly pending evidence", async () => {
        for (const result of [
            { data: null, error: { code: "42501" } },
            { data: {}, error: null },
            { data: { ...ready, ready_records: 1, pending_records: 1, status: "pending" }, error: null },
            { data: { ...ready, ready_records: 1 }, error: null },
        ]) {
            abortSignal.mockResolvedValueOnce(result);
            await expect(assertActivePersonalRetrievalSession({ supabase, scope, signal: new AbortController().signal })).rejects.toThrow("RETRIEVAL_SESSION_OR_INDEX_CHANGED");
        }
    });
    it("refuses delivery if cancelled during the final check", async () => {
        const controller = new AbortController();
        abortSignal.mockImplementationOnce(async () => { controller.abort(); return { data: ready, error: null }; });
        await expect(assertActivePersonalRetrievalSession({ supabase, scope, signal: controller.signal })).rejects.toThrow();
    });
});
