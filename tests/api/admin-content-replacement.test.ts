import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), db: vi.fn(), rpc: vi.fn(), from: vi.fn(), rate: vi.fn(), queue: vi.fn(), process: vi.fn(), after: vi.fn() }));
vi.mock("next/server", async () => ({ ...await vi.importActual<typeof import("next/server")>("next/server"), after: mocks.after }));
vi.mock("@/lib/admin/auth", () => ({ verifyAdminSession: mocks.admin }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.db }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: mocks.rate }));
vi.mock("@/lib/server/narration-queue", () => ({ queueNarrationJobIfEligible: mocks.queue }));
vi.mock("@/lib/server/narration-processor", () => ({ processNextNarrationJob: mocks.process }));
vi.mock("@/lib/server/revalidation", () => ({
    getSeriesSlugsByIds: vi.fn().mockResolvedValue([]), revalidateContentDeleted: vi.fn(),
    revalidateContentUpdated: vi.fn(), revalidateReplacementRoutes: vi.fn(),
}));
vi.mock("@/lib/server/api", async (original) => ({
    ...await original<typeof import("@/lib/server/api")>(), logApiError: vi.fn(),
}));
import { GET, POST } from "@/app/api/admin/content/[id]/replacement/route";
const source = "11111111-1111-4111-8111-111111111111";
const kept = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id: source }) };
const input = { replacementId: kept, sourceUpdatedAt: "2026-10-22T00:00:00+00:00", replacementUpdatedAt: "2026-10-22T00:00:00+00:00" };
function request(body = input) {
    return new NextRequest(`http://localhost/api/admin/content/${source}/replacement`, { method: "POST", body: JSON.stringify(body) });
}

describe("admin replacement API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("AUTO_GENERATE_NARRATION_ON_PUBLISH", "false");
        mocks.admin.mockResolvedValue(true);
        mocks.rate.mockResolvedValue({ success: true });
        mocks.queue.mockResolvedValue({ queued: true });
        mocks.rpc.mockResolvedValue({ data: { preserved_library_records: 2 }, error: null });
        mocks.from.mockReturnValue({ select: () => ({ in: () => Promise.resolve({ data: [
            { id: source, title: "Original", series_id: null }, { id: kept, title: "Kept", series_id: null },
        ], error: null }) }) });
        mocks.db.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });
    it("rejects an ordinary session before reading records", async () => {
        mocks.admin.mockResolvedValue(false);
        expect((await POST(request(), context)).status).toBe(401);
        expect((await GET(new NextRequest("http://localhost/"), context)).status).toBe(401);
        expect(mocks.db).not.toHaveBeenCalled();
    });
    it("requires a preview's timestamps and a different destination", async () => {
        expect((await POST(request({ ...input, replacementId: source }), context)).status).toBe(400);
        expect((await POST(new NextRequest("http://localhost/", { method: "POST", body: JSON.stringify({ replacementId: kept }) }), context)).status).toBe(400);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it("uses one atomic replacement operation without changing reader records in the API", async () => {
        const response = await POST(request(), context);
        expect(response.status).toBe(200);
        expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_replace_content", {
            p_source_id: source, p_replacement_id: kept,
            p_source_updated_at: input.sourceUpdatedAt, p_replacement_updated_at: input.replacementUpdatedAt,
        });
        expect(mocks.from.mock.calls.every(([table]) => table === "content_item")).toBe(true);
        expect(mocks.queue).not.toHaveBeenCalled();
    });
    it("queues narration when an updated draft becomes verified", async () => {
        vi.stubEnv("AUTO_GENERATE_NARRATION_ON_PUBLISH", "true");
        mocks.from.mockReturnValue({ select: () => ({ in: () => Promise.resolve({ data: [
            { id: source, title: "Original", series_id: null, status: "verified" },
            { id: kept, title: "Updated version", series_id: null, status: "draft", audio_url: null, narration_status: "idle" },
        ], error: null }) }) });

        const response = await POST(request(), context);

        expect(response.status).toBe(200);
        expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            contentId: kept,
            row: expect.objectContaining({ status: "draft", audio_url: null }),
        }));
        expect(mocks.after).toHaveBeenCalledTimes(1);
    });
    it("requires a fresh preview after a concurrent content edit", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
        expect((await POST(request(), context)).status).toBe(409);
    });
    it("does not claim replacement success when the transaction fails", async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
        expect((await POST(request(), context)).status).toBe(500);
    });
    it("reports incomplete publication and identity conflicts without pretending the draft must already be public", async () => {
        mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"22023"}});
        const missing=await POST(request(),context);
        expect(missing.status).toBe(400);
        expect((await missing.json()).error.message).toContain("Complete required publish fields");
        mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"23505"}});
        expect((await POST(request(),context)).status).toBe(409);
    });

});
