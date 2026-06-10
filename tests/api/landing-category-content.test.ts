import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/landing/category-content/route";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    bestEffortRateLimit: vi.fn(),
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
        vi.mocked(bestEffortRateLimit).mockResolvedValue({ success: true });
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
});
