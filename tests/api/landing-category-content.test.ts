import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/landing/category-content/route";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";

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

function createQuery(data: unknown[] = [], error: unknown = null) {
    const query: any = {
        select: vi.fn(() => query),
        in: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn().mockResolvedValue({ data, error }),
    };

    return query;
}

describe("Landing category content API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(strictPublicRateLimit).mockResolvedValue({ success: true });
    });

    it("loads verified content using the canonical category and its aliases", async () => {
        const query = createQuery([{ id: "content-1", category: "Finance" }]);
        vi.mocked(createPublicServerClient).mockReturnValue({
            from: vi.fn(() => query),
        } as any);

        const response = await GET(
            new NextRequest(
                "http://localhost/api/landing/category-content?category=Money%20%26%20Investments&value=%27Finance%27&value=Business"
            )
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe(
            "public, s-maxage=300, stale-while-revalidate=3600"
        );
        expect(query.in).toHaveBeenCalledWith("category", [
            "Money & Investments",
            "Finance",
            "Money & Finance",
            "Wealth",
            "'Finance'",
        ]);
        expect(query.eq).toHaveBeenCalledWith("status", "verified");
        expect(query.is).toHaveBeenCalledWith("deleted_at", null);
        expect(query.order).toHaveBeenNthCalledWith(1, "is_featured", { ascending: false });
        expect(query.order).toHaveBeenNthCalledWith(2, "published_at", { ascending: false });
        expect(query.limit).toHaveBeenCalledWith(16);
        await expect(response.json()).resolves.toEqual({
            items: [{ id: "content-1", category: "Finance" }],
        });
    });

    it("rejects an empty category", async () => {
        const response = await GET(
            new NextRequest("http://localhost/api/landing/category-content")
        );

        expect(response.status).toBe(400);
        expect(createPublicServerClient).not.toHaveBeenCalled();
    });

    it("fails closed before querying when strict rate limiting is unavailable", async () => {
        vi.mocked(strictPublicRateLimit).mockResolvedValueOnce({
            success: false,
            retryAfterMs: 60_000,
            unavailable: true,
        });

        const response = await GET(
            new NextRequest("http://localhost/api/landing/category-content?category=Psychology&value=Psychology")
        );

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "RATE_LIMIT_UNAVAILABLE",
                message: "Service temporarily unavailable.",
            },
        });
        expect(createPublicServerClient).not.toHaveBeenCalled();
    });
});
