import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/focus/route";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    bestEffortRateLimit: vi.fn(),
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
    const mockOrder = vi.fn(() => ({ limit: mockLimit }));
    const mockGt = vi.fn(() => ({ order: mockOrder }));
    const mockNot = vi.fn(() => ({ order: mockOrder, gt: mockGt }));
    const mockIs = vi.fn(() => ({ not: mockNot }));
    const mockEq = vi.fn(() => ({ is: mockIs }));
    let carryRequestedIds: string[] = [];
    let carryRows: any[] = [];
    const mockCarryNot = vi.fn(() => Promise.resolve({
        data: carryRows.filter((item) => carryRequestedIds.includes(item.id)),
        error: null,
    }));
    const mockCarryIs = vi.fn(() => ({ not: mockCarryNot }));
    const mockCarryEq = vi.fn(() => ({ is: mockCarryIs }));
    const mockIn = vi.fn((_column: string, ids: string[]) => {
        carryRequestedIds = ids;
        return { eq: mockCarryEq };
    });
    const mockSelect = vi.fn(() => ({ eq: mockEq, in: mockIn }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));

    beforeEach(() => {
        vi.clearAllMocks();
        mockLimit.mockReset();
        mockCarryNot.mockClear();
        carryRequestedIds = [];
        carryRows = [];
        (createPublicServerClient as any).mockReturnValue({
            from: mockFrom,
        });
        (bestEffortRateLimit as any).mockResolvedValue({ success: true });
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

    it("validates exclude IDs", async () => {
        const request = new NextRequest(
            new URL("http://localhost/api/focus?excludeIds=not-a-uuid")
        );

        const response = await GET(request);

        expect(response.status).toBe(400);
    });

    it("returns quick-mode items, filters excluded IDs, and includes page info", async () => {
        const request = new NextRequest(
            new URL(
                "http://localhost/api/focus?limit=2&excludeIds=123e4567-e89b-12d3-a456-426614174000"
            )
        );

        const response = await GET(request);
        const json = await response.json();

        expect(mockFrom).toHaveBeenCalledWith("content_item");
        expect(mockNot).toHaveBeenCalledWith("quick_mode_json", "is", null);
        expect(mockOrder).toHaveBeenCalledWith("id", { ascending: true });
        expect(mockLimit).toHaveBeenCalledWith(48);
        expect(json).toEqual({
            items: [
                expect.objectContaining({
                id: "123e4567-e89b-12d3-a456-426614174001",
                title: "Second Item",
                }),
                expect.objectContaining({
                    id: "123e4567-e89b-12d3-a456-426614174002",
                    title: "Third Item",
                }),
            ],
            pageInfo: {
                hasMore: false,
                nextCursor: null,
            },
        });
    });

    it("continues scanning later pages when the first page is exhausted by exclusions", async () => {
        mockLimit
            .mockResolvedValueOnce({
                data: Array.from({ length: 48 }, (_, index) => ({
                    id: `123e4567-e89b-12d3-a456-426614174${String(100 + index).padStart(3, "0")}`,
                    title: `Excluded Item ${index + 1}`,
                    type: "book",
                    author: "Author A",
                    category: "Mindset",
                    cover_image_url: null,
                    duration_seconds: 180,
                    quick_mode_json: {
                        hook: "A",
                        big_idea: "B",
                        key_takeaways: ["C"],
                    },
                })),
                error: null,
            })
            .mockResolvedValueOnce({
                data: [
                    {
                        id: "123e4567-e89b-12d3-a456-426614174200",
                        title: "Second Page First Item",
                        type: "book",
                        author: "Author B",
                        category: "Mindset",
                        cover_image_url: null,
                        duration_seconds: 180,
                        quick_mode_json: {
                            hook: "A",
                            big_idea: "B",
                            key_takeaways: ["C"],
                        },
                    },
                    {
                        id: "123e4567-e89b-12d3-a456-426614174201",
                        title: "Second Page Second Item",
                        type: "book",
                        author: "Author C",
                        category: "Mindset",
                        cover_image_url: null,
                        duration_seconds: 180,
                        quick_mode_json: {
                            hook: "A",
                            big_idea: "B",
                            key_takeaways: ["C"],
                        },
                    },
                ],
                error: null,
            });

        const request = new NextRequest(
            new URL(
                `http://localhost/api/focus?limit=2&excludeIds=${Array.from({ length: 48 }, (_, index) =>
                    `123e4567-e89b-12d3-a456-426614174${String(100 + index).padStart(3, "0")}`
                ).join(",")}`
            )
        );

        const response = await GET(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(mockLimit).toHaveBeenCalledTimes(2);
        expect(mockGt).toHaveBeenCalledWith("id", "123e4567-e89b-12d3-a456-426614174147");
        expect(json.items).toHaveLength(2);
        expect(json.items.map((item: { id: string }) => item.id).sort()).toEqual([
            "123e4567-e89b-12d3-a456-426614174200",
            "123e4567-e89b-12d3-a456-426614174201",
        ]);
        expect(json.pageInfo).toEqual({
            hasMore: false,
            nextCursor: null,
        });
    });

    it("uses a deterministic diversified selection and carries undisplayed scanned items forward", async () => {
        const fullPage = Array.from({ length: 48 }, (_, index) => ({
            id: `123e4567-e89b-12d3-a456-42661417${String(5000 + index).padStart(4, "0")}`,
            title: `Item ${index + 1}`,
            type: "book",
            author: `Author ${index + 1}`,
            category: "Mindset",
            cover_image_url: null,
            duration_seconds: 180,
            quick_mode_json: {
                hook: "A",
                big_idea: "B",
                key_takeaways: ["C"],
            },
        }));

        const trailingPage = [
            {
                id: "123e4567-e89b-12d3-a456-426614176000",
                title: "Trailing Item",
                type: "book",
                author: "Author 49",
                category: "Mindset",
                cover_image_url: null,
                duration_seconds: 180,
                quick_mode_json: {
                    hook: "A",
                    big_idea: "B",
                    key_takeaways: ["C"],
                },
            },
        ];

        mockLimit
            .mockResolvedValueOnce({
                data: fullPage,
                error: null,
            })
            .mockResolvedValueOnce({
                data: fullPage.slice(20).concat(trailingPage),
                error: null,
            });
        carryRows = fullPage;

        const firstResponse = await GET(new NextRequest(new URL("http://localhost/api/focus?limit=6")));
        const firstJson = await firstResponse.json();

        expect(firstResponse.status).toBe(200);
        expect(firstJson.items).toHaveLength(6);
        expect(firstJson.items.map((item: { id: string }) => item.id)).toEqual([
            "123e4567-e89b-12d3-a456-426614175008",
            "123e4567-e89b-12d3-a456-426614175009",
            "123e4567-e89b-12d3-a456-426614175012",
            "123e4567-e89b-12d3-a456-426614175013",
            "123e4567-e89b-12d3-a456-426614175018",
            "123e4567-e89b-12d3-a456-426614175019",
        ]);
        expect(firstJson.pageInfo).toEqual({
            hasMore: true,
            nextCursor: expect.stringMatching(/^v1_/),
        });

        const secondResponse = await GET(
            new NextRequest(new URL(`http://localhost/api/focus?limit=6&cursor=${firstJson.pageInfo.nextCursor}`))
        );
        const secondJson = await secondResponse.json();

        expect(secondResponse.status).toBe(200);
        expect(mockIn).toHaveBeenCalledWith("id", expect.arrayContaining([
            "123e4567-e89b-12d3-a456-426614175000",
            "123e4567-e89b-12d3-a456-426614175047",
        ]));
        expect(secondJson.items).toHaveLength(6);
        expect(secondJson.items.map((item: { id: string }) => item.id)).not.toContain(
            "123e4567-e89b-12d3-a456-426614176000"
        );
        expect(new Set([
            ...firstJson.items.map((item: { id: string }) => item.id),
            ...secondJson.items.map((item: { id: string }) => item.id),
        ])).toHaveProperty("size", 12);
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
        expect(json).toEqual({
            items: [
                expect.objectContaining({
                    id: "123e4567-e89b-12d3-a456-426614174011",
                    title: "Valid Item",
                }),
            ],
            pageInfo: {
                hasMore: false,
                nextCursor: null,
            },
        });
        expect(json.pageInfo).toEqual({
            hasMore: false,
            nextCursor: null,
        });
    });

    it("balances category and type from a larger candidate window", async () => {
        mockLimit.mockResolvedValue({
            data: [
                ...Array.from({ length: 6 }, (_, index) => ({
                    id: `123e4567-e89b-12d3-a456-42661417410${index}`,
                    title: `Productivity Book ${index + 1}`,
                    type: "book",
                    author: "Author A",
                    category: "Productivity",
                    cover_image_url: null,
                    duration_seconds: 180,
                    quick_mode_json: {
                        hook: "A",
                        big_idea: "B",
                        key_takeaways: ["C"],
                    },
                })),
                {
                    id: "123e4567-e89b-12d3-a456-426614174200",
                    title: "History Podcast",
                    type: "podcast",
                    author: "Author B",
                    category: "History",
                    cover_image_url: null,
                    duration_seconds: 180,
                    quick_mode_json: {
                        hook: "A",
                        big_idea: "B",
                        key_takeaways: ["C"],
                    },
                },
                {
                    id: "123e4567-e89b-12d3-a456-426614174201",
                    title: "Science Article",
                    type: "article",
                    author: "Author C",
                    category: "Science",
                    cover_image_url: null,
                    duration_seconds: 180,
                    quick_mode_json: {
                        hook: "A",
                        big_idea: "B",
                        key_takeaways: ["C"],
                    },
                },
            ],
            error: null,
        });

        const response = await GET(
            new NextRequest(new URL("http://localhost/api/focus?limit=3&seed=steady"))
        );
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toHaveLength(3);
        expect(new Set(json.items.map((item: { category: string }) => item.category))).toEqual(
            new Set(["Productivity", "History", "Science"])
        );
        expect(new Set(json.items.map((item: { type: string }) => item.type))).toEqual(
            new Set(["book", "podcast", "article"])
        );
    });

    it("keeps serving focus items when rate limiting degrades safely", async () => {
        (bestEffortRateLimit as any).mockResolvedValueOnce({ success: true });

        const request = new NextRequest(new URL("http://localhost/api/focus?limit=1"));

        const response = await GET(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(Array.isArray(json.items)).toBe(true);
        expect(json.items).toHaveLength(1);
    });
});
