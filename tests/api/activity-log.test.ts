import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/activity/log/route";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

describe("Activity Log API", () => {
    const mockRpc = vi.fn();
    const mockGetUser = vi.fn();
    const mockSupabaseClient = {
        auth: { getUser: mockGetUser },
        rpc: mockRpc,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabaseClient);
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            retryAfterMs: 0,
        });
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-123" } } });
        mockRpc.mockResolvedValue({ error: null });
    });

    it("requires authentication", async () => {
        mockGetUser.mockResolvedValueOnce({ data: { user: null } });

        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({ duration_seconds: 90 }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it("validates the request payload", async () => {
        const req = new NextRequest(new URL("http://localhost/api/activity/log"), {
            method: "POST",
            body: JSON.stringify({ duration_seconds: 0 }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
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
        expect(mockRpc).toHaveBeenCalledWith("log_reading_activity", {
            p_activity_date: "2026-03-11",
            p_duration_seconds: 120,
            p_content_id: "123e4567-e89b-12d3-a456-426614174000",
        });
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
        expect(mockRpc).toHaveBeenCalledWith("increment_reading_activity", {
            p_activity_date: "2026-03-11",
            p_duration_seconds: 120,
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
