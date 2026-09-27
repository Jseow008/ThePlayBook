import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: vi.fn() }));
vi.mock("@/lib/server/api", () => ({
    getRequestId: () => "request-id", logApiError: vi.fn(),
    apiError: (code: string, message: string, status: number) => Response.json({ error: { code, message } }, { status }),
}));
vi.mock("@/lib/server/rate-limit", () => ({
    strictPublicRateLimit: vi.fn(),
    rateLimitFailureResponseWithTelemetry: vi.fn(({ result }) => new Response(null, { status: result.unavailable ? 503 : 429 })),
}));

const settings = { fontSize: "large", fontFamily: "sans", readerTheme: "sepia", lineHeight: "relaxed", updatedAt: "2026-09-27T00:00:00.000Z" };
const request = (body: unknown = { expectedAccountId: "account-a", settings }) => new NextRequest("http://localhost/api/reader-settings", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/reader-settings", () => {
    const getUser = vi.fn();
    const update = vi.fn();
    const eq = vi.fn();
    const single = vi.fn();
    const from = vi.fn();
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createClient).mockResolvedValue({ auth: { getUser } } as unknown as Awaited<ReturnType<typeof createClient>>);
        getUser.mockResolvedValue({ data: { user: { id: "account-a" } }, error: null });
        vi.mocked(strictPublicRateLimit).mockResolvedValue({ success: true });
        vi.mocked(getAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof getAdminClient>);
        from.mockReturnValue({ update });
        update.mockReturnValue({ eq });
        eq.mockReturnValue({ select: () => ({ single }) });
        single.mockResolvedValue({ data: { id: "account-a" }, error: null });
    });

    it("updates only the authenticated account's reader_settings after admission", async () => {
        expect((await POST(request())).status).toBe(200);
        expect(strictPublicRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ identifier: "account-a", limit: 30, windowMs: 60_000 }));
        expect(from).toHaveBeenCalledWith("profiles");
        expect(update).toHaveBeenCalledWith({ reader_settings: settings });
        expect(eq).toHaveBeenCalledWith("id", "account-a");
        expect(getUser.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getAdminClient).mock.invocationCallOrder[0]);
    });

    it.each([null, { id: "account-a" }])("rejects missing or failed auth before privileged access (%s)", async user => {
        getUser.mockResolvedValue({ data: { user }, error: { message: "Invalid session" } });
        expect((await POST(request())).status).toBe(401);
        expect(getAdminClient).not.toHaveBeenCalled();
    });

    it.each([false, true])("fails closed for exhausted or unavailable admission (%s)", async unavailable => {
        vi.mocked(strictPublicRateLimit).mockResolvedValue({ success: false, unavailable });
        expect((await POST(request())).status).toBe(unavailable ? 503 : 429);
        expect(getAdminClient).not.toHaveBeenCalled();
    });

    it("rejects an account change", async () => {
        expect((await POST(request({ expectedAccountId: "account-b", settings }))).status).toBe(409);
        expect(getAdminClient).not.toHaveBeenCalled();
    });

    it.each([
        { ...settings, role: "admin" }, { ...settings, fontSize: "huge" },
        { ...settings, updatedAt: "yesterday" }, { fontSize: "small" }, null,
    ])("rejects invalid or extra settings fields", async invalid => {
        expect((await POST(request({ expectedAccountId: "account-a", settings: invalid }))).status).toBe(400);
        expect(getAdminClient).not.toHaveBeenCalled();
    });

    it("rejects top-level privilege fields", async () => {
        expect((await POST(request({ expectedAccountId: "account-a", settings, role: "admin" }))).status).toBe(400);
        expect(getAdminClient).not.toHaveBeenCalled();
    });

    it("bounds the streamed body even without Content-Length", async () => {
        expect((await POST(request({ padding: "x".repeat(2048) }))).status).toBe(413);
        expect(getAdminClient).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON", async () => {
        expect((await POST(new NextRequest("http://localhost/api/reader-settings", { method: "POST", body: "{" }))).status).toBe(400);
    });

    it.each([{ data: null, error: null }, { data: null, error: { message: "Database unavailable" } }])("does not report a failed update as saved", async result => {
        single.mockResolvedValue(result);
        expect((await POST(request())).status).toBe(503);
    });
});
