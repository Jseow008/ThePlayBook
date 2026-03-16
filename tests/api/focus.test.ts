import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/focus/route";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

vi.mock("@/lib/server/api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/api")>("@/lib/server/api");
    return {
        ...actual,
        getRequestId: vi.fn(() => "focus-test-request"),
        logApiError: vi.fn(),
    };
});

describe("Focus API", () => {
    const mockLimit = vi.fn();
    const mockNot = vi.fn(() => ({ limit: mockLimit }));
    const mockIs = vi.fn(() => ({ not: mockNot }));
    const mockEq = vi.fn(() => ({ is: mockIs }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        (createPublicServerClient as any).mockReturnValue({
            from: mockFrom,
        });
        (rateLimit as any).mockResolvedValue({ success: true });
        randomSpy = vi.spyOn(Math, "random");
        mockLimit.mockResolvedValue({
            data: [
                {
                    id: "123e4567-e89b-12d3-a456-426614174000",
                    title: "First Item",
                    type: "book",
                    author: "Author 1",
                    category: "Mindset",
                    cover_image_url: null,
                    duration_seconds: 300,
                    quick_mode_json: {
                        hook: "A",
                        big_idea: "B",
                        key_takeaways: ["C"],
                    },
                },
                {
                    id: "123e4567-e89b-12d3-a456-426614174001",
                    title: "Second Item",
                    type: "article",
                    author: "Author 2",
                    category: "Productivity",
                    cover_image_url: null,
                    duration_seconds: 240,
                    quick_mode_json: {
                        hook: "A",
                        big_idea: "B",
                        key_takeaways: ["C"],
                    },
                },
                {
                    id: "123e4567-e89b-12d3-a456-426614174002",
                    title: "Third Item",
                    type: "podcast",
                    author: "Author 3",
                    category: "History",
                    cover_image_url: null,
                    duration_seconds: 200,
                    quick_mode_json: {
                        hook: "A",
                        big_idea: "B",
                        key_takeaways: ["C"],
                    },
                },
            ],
            error: null,
        });
    });

    afterEach(() => {
        randomSpy.mockRestore();
    });

    it("validates exclude IDs", async () => {
        const request = new NextRequest(
            new URL("http://localhost/api/focus?excludeIds=not-a-uuid")
        );

        const response = await GET(request);

        expect(response.status).toBe(400);
    });

    it("returns shuffled quick-mode items and filters excluded IDs", async () => {
        randomSpy.mockReturnValueOnce(0).mockReturnValueOnce(0);

        const request = new NextRequest(
            new URL(
                "http://localhost/api/focus?limit=2&excludeIds=123e4567-e89b-12d3-a456-426614174000"
            )
        );

        const response = await GET(request);
        const json = await response.json();

        expect(mockFrom).toHaveBeenCalledWith("content_item");
        expect(mockNot).toHaveBeenCalledWith("quick_mode_json", "is", null);
        expect(mockLimit).toHaveBeenCalledWith(48);
        expect(json).toEqual([
            expect.objectContaining({
                id: "123e4567-e89b-12d3-a456-426614174002",
                title: "Third Item",
            }),
            expect.objectContaining({
                id: "123e4567-e89b-12d3-a456-426614174001",
                title: "Second Item",
            }),
        ]);
    });

    it("drops rows with invalid quick mode payloads without failing the request", async () => {
        mockLimit.mockResolvedValue({
            data: [
                {
                    id: "123e4567-e89b-12d3-a456-426614174010",
                    title: "Broken Item",
                    type: "book",
                    author: "Author 0",
                    category: "Mindset",
                    cover_image_url: null,
                    duration_seconds: 180,
                    quick_mode_json: {
                        hook: "Missing takeaways",
                        big_idea: "Broken payload",
                    },
                },
                {
                    id: "123e4567-e89b-12d3-a456-426614174011",
                    title: "Valid Item",
                    type: "book",
                    author: "Author 1",
                    category: "Mindset",
                    cover_image_url: null,
                    duration_seconds: 300,
                    quick_mode_json: {
                        hook: "A",
                        big_idea: "B",
                        key_takeaways: ["C"],
                    },
                },
            ],
            error: null,
        });

        const request = new NextRequest(new URL("http://localhost/api/focus?limit=2"));

        const response = await GET(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json).toEqual([
            expect.objectContaining({
                id: "123e4567-e89b-12d3-a456-426614174011",
                title: "Valid Item",
            }),
        ]);
        expect(logApiError).toHaveBeenCalledWith(
            expect.objectContaining({
                requestId: "focus-test-request",
                route: "/api/focus",
                message: "Dropped invalid focus feed rows",
                error: { invalid_row_count: 1 },
            })
        );
    });
});
