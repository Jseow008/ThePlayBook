import { POST } from "@/app/api/content/batch/route";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    strictPublicRateLimit: vi.fn(),
    rateLimitFailureResponse: vi.fn((result: { unavailable?: boolean }) => Response.json(
        {
            error: {
                code: result.unavailable ? "RATE_LIMIT_UNAVAILABLE" : "RATE_LIMITED",
                message: result.unavailable ? "Service temporarily unavailable." : "Too many requests.",
            },
        },
        { status: result.unavailable ? 503 : 429 }
    )),
}));

function createRequest(body: unknown) {
    return new NextRequest("http://localhost/api/content/batch", {
        method: "POST",
        body: JSON.stringify(body),
    });
}

describe("Content batch API", () => {
    const mockIs = vi.fn();
    const mockEq = vi.fn(() => ({ is: mockIs }));
    const mockIn = vi.fn(() => ({ eq: mockEq }));
    const mockSelect = vi.fn(() => ({ in: mockIn }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(strictPublicRateLimit).mockResolvedValue({ success: true });
        mockIs.mockResolvedValue({
            data: [{ id: "123e4567-e89b-12d3-a456-426614174000", title: "Verified Item" }],
            error: null,
        });
        vi.mocked(createPublicServerClient).mockReturnValue({
            from: mockFrom,
        } as any);
    });

    it("fetches verified content by ID", async () => {
        const id = "123e4567-e89b-12d3-a456-426614174000";
        const response = await POST(createRequest({ ids: [id] }));

        expect(response.status).toBe(200);
        expect(mockFrom).toHaveBeenCalledWith("content_item");
        expect(mockIn).toHaveBeenCalledWith("id", [id]);
        expect(mockEq).toHaveBeenCalledWith("status", "verified");
        expect(mockIs).toHaveBeenCalledWith("deleted_at", null);
        await expect(response.json()).resolves.toEqual([
            { id, title: "Verified Item" },
        ]);
    });

    it("rejects malformed payloads before querying", async () => {
        const response = await POST(createRequest({ ids: ["not-a-uuid"] }));

        expect(response.status).toBe(400);
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it("fails closed before querying when strict rate limiting is unavailable", async () => {
        vi.mocked(strictPublicRateLimit).mockResolvedValueOnce({
            success: false,
            retryAfterMs: 60_000,
            unavailable: true,
        });

        const response = await POST(createRequest({
            ids: ["123e4567-e89b-12d3-a456-426614174000"],
        }));

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "RATE_LIMIT_UNAVAILABLE",
                message: "Service temporarily unavailable.",
            },
        });
        expect(mockFrom).not.toHaveBeenCalled();
    });
});
