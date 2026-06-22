import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/activity/log/route";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server/rate-limit";
import { createAnonymousActivitySession } from "@/lib/server/anonymous-activity-token";

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

describe("Activity Log API", () => {
    const mockAdminRpc = vi.fn();
    const mockContentMaybeSingle = vi.fn();
    const mockContentIs = vi.fn();
    const mockContentStatusEq = vi.fn();
    const mockContentIdEq = vi.fn();
    const mockContentSelect = vi.fn();
    const mockFrom = vi.fn();
    const mockGetUser = vi.fn();
    const mockAuthClient = {
        auth: { getUser: mockGetUser },
    };
    const mockAdminClient = {
        rpc: mockAdminRpc,
        from: mockFrom,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockAuthClient);
        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockAdminClient);
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            retryAfterMs: 0,
        });
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
        mockAdminRpc.mockResolvedValue({ error: null });
        mockContentMaybeSingle.mockResolvedValue({
            data: { id: "123e4567-e89b-12d3-a456-426614174000" },
            error: null,
        });
        mockContentIs.mockReturnValue({ maybeSingle: mockContentMaybeSingle });
        mockContentStatusEq.mockReturnValue({ is: mockContentIs });
        mockContentIdEq.mockReturnValue({ eq: mockContentStatusEq });
        mockContentSelect.mockReturnValue({ eq: mockContentIdEq });
        mockFrom.mockReturnValue({ select: mockContentSelect });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it("requires authentication when anonymous content identifiers are absent", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({ duration_seconds: 90 }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it("rejects invalid JSON bodies", async () => {
        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: "{bad-json",
            headers: { "Content-Type": "application/json" },
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it("logs anonymous content-level activity when a visitor ID is present", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                activity_date: "2026-04-07",
                content_id: "123e4567-e89b-12d3-a456-426614174000",
                visitor_id: "123e4567-e89b-12d3-a456-426614174111",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(mockAdminRpc).toHaveBeenCalledWith("log_anonymous_reading_activity", {
            p_activity_date: "2026-04-08",
            p_duration_seconds: 45,
            p_content_id: "123e4567-e89b-12d3-a456-426614174000",
            p_visitor_id: "123e4567-e89b-12d3-a456-426614174111",
        });
        expect(mockFrom).toHaveBeenCalledWith("content_item");
    });

    it("rejects anonymous activity with invalid or unverified content before logging", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
        mockContentMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
                visitor_id: "123e4567-e89b-12d3-a456-426614174111",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(404);
        expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("rejects authenticated content activity with invalid or unverified content before logging", async () => {
        mockContentMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(404);
        expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("rejects missing signed anonymous visitor tokens in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("ANONYMOUS_ACTIVITY_SECRET", "test-anonymous-secret");
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
                visitor_id: "123e4567-e89b-12d3-a456-426614174111",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(403);
        expect(mockFrom).not.toHaveBeenCalledWith("content_item");
        expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("allows anonymous activity with a valid signed visitor token", async () => {
        vi.stubEnv("ANONYMOUS_ACTIVITY_SECRET", "test-anonymous-secret");
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
        const session = createAnonymousActivitySession();

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
                visitor_id: session.visitorId,
                visitor_token: session.visitorToken,
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(mockAdminRpc).toHaveBeenCalledWith("log_anonymous_reading_activity", {
            p_activity_date: "2026-04-08",
            p_duration_seconds: 45,
            p_content_id: "123e4567-e89b-12d3-a456-426614174000",
            p_visitor_id: session.visitorId,
        });
    });

    it("throttles repeated anonymous activity from one client before logging", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
        (rateLimit as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ success: true, retryAfterMs: 0 })
            .mockResolvedValueOnce({ success: false, retryAfterMs: 10_000 });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
                visitor_id: "123e4567-e89b-12d3-a456-426614174111",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(429);
        expect(mockFrom).not.toHaveBeenCalledWith("content_item");
        expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("throttles repeated anonymous activity for one visitor before logging", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
        (rateLimit as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ success: true, retryAfterMs: 0 })
            .mockResolvedValueOnce({ success: true, retryAfterMs: 0 })
            .mockResolvedValueOnce({ success: false, retryAfterMs: 10_000 });

        const visitorId = "123e4567-e89b-12d3-a456-426614174111";
        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
                visitor_id: visitorId,
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(429);
        expect(rateLimit).toHaveBeenNthCalledWith(3, req, expect.objectContaining({
            key: "anonymous-activity-visitor",
            identifier: visitorId,
        }));
        expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("returns 500 when anonymous content logging fails", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
        mockAdminRpc.mockResolvedValueOnce({ error: new Error("db failure") });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
                visitor_id: "123e4567-e89b-12d3-a456-426614174111",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(500);
    });

    it("returns 500 when session verification fails unexpectedly", async () => {
        mockGetUser.mockResolvedValueOnce({
            data: { user: null },
            error: new Error("auth unavailable"),
        });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
                visitor_id: "123e4567-e89b-12d3-a456-426614174111",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(500);
        expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("validates the request payload", async () => {
        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({ duration_seconds: 0 }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
    });

    it("requires a visitor ID for anonymous content activity", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 45,
                content_id: "123e4567-e89b-12d3-a456-426614174000",
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it("uses the server UTC date instead of a client-supplied activity_date", async () => {
        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 120,
                activity_date: "2020-01-01",
                content_id: "123e4567-e89b-12d3-a456-426614174000",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(mockAdminRpc).toHaveBeenCalledWith("log_reading_activity_for_user", {
            p_activity_date: "2026-04-08",
            p_duration_seconds: 120,
            p_content_id: "123e4567-e89b-12d3-a456-426614174000",
            p_user_id: "user-123",
        });
        expect(mockFrom).toHaveBeenCalledWith("content_item");
    });

    it("logs content-level activity when content_id is present", async () => {
        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 120,
                activity_date: "2026-03-11",
                content_id: "123e4567-e89b-12d3-a456-426614174000",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(mockAdminRpc).toHaveBeenCalledWith("log_reading_activity_for_user", {
            p_activity_date: "2026-04-08",
            p_duration_seconds: 120,
            p_content_id: "123e4567-e89b-12d3-a456-426614174000",
            p_user_id: "user-123",
        });
        expect(mockFrom).toHaveBeenCalledWith("content_item");
    });

    it("falls back to daily activity logging when content_id is omitted", async () => {
        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({
                duration_seconds: 120,
                activity_date: "2026-03-11",
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(mockAdminRpc).toHaveBeenCalledWith("increment_reading_activity_for_user", {
            p_activity_date: "2026-04-08",
            p_duration_seconds: 120,
            p_user_id: "user-123",
        });
    });

    it("returns 429 when rate limited", async () => {
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            success: false,
            retryAfterMs: 10_000,
        });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({ duration_seconds: 120 }),
        });

        const res = await POST(req);
        expect(res.status).toBe(429);
    });
});
