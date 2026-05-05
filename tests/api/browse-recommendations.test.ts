import { POST } from "@/app/api/recommendations/browse/route";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    bestEffortRateLimit: vi.fn(),
}));

const RECENT_SEED_ID = "123e4567-e89b-12d3-a456-426614174000";
const LIBRARY_SEED_ID = "123e4567-e89b-12d3-a456-426614174001";
const KNOWN_ID = "123e4567-e89b-12d3-a456-426614174002";

function createRecommendation(id: string, title: string, similarity = 0.9) {
    return {
        id,
        title,
        type: "book",
        source_url: null,
        status: "verified",
        quick_mode_json: null,
        duration_seconds: 300,
        author: "Author",
        cover_image_url: null,
        hero_image_url: null,
        category: "Business",
        is_featured: false,
        audio_url: null,
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
        deleted_at: null,
        similarity,
    };
}

function createLatestQuery(data: Array<ReturnType<typeof createRecommendation>> = [], error: unknown = null) {
    const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        is: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => query),
        not: vi.fn(() => query),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error })),
    };

    return query;
}

function createRequest(body: unknown) {
    return new NextRequest(new URL("http://localhost/api/recommendations/browse"), {
        method: "POST",
        body: JSON.stringify(body),
    });
}

describe("Browse recommendations API", () => {
    const mockRpc = vi.fn();
    const mockFrom = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(createPublicServerClient).mockReturnValue({
            rpc: mockRpc,
            from: mockFrom,
        } as any);
        vi.mocked(bestEffortRateLimit).mockResolvedValue({ success: true });
        mockRpc.mockResolvedValue({ data: [], error: null });
        mockFrom.mockReturnValue(createLatestQuery());
    });

    it("validates request payloads", async () => {
        const response = await POST(createRequest({
            recentSeedId: "not-a-uuid",
        }));

        expect(response.status).toBe(400);
        expect(mockRpc).not.toHaveBeenCalled();
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns one deduped response and fills the library lane from latest verified content", async () => {
        const recentItem = createRecommendation("123e4567-e89b-12d3-a456-426614174100", "Recent match", 0.95);
        const semanticLibraryItem = createRecommendation("123e4567-e89b-12d3-a456-426614174101", "Library match", 0.92);
        const fillItems = [
            createRecommendation("123e4567-e89b-12d3-a456-426614174102", "Latest fill one"),
            createRecommendation("123e4567-e89b-12d3-a456-426614174103", "Latest fill two"),
        ];
        const latestQuery = createLatestQuery(fillItems);

        mockRpc
            .mockResolvedValueOnce({ data: [recentItem], error: null })
            .mockResolvedValueOnce({ data: [recentItem, semanticLibraryItem], error: null });
        mockFrom.mockReturnValueOnce(latestQuery);

        const response = await POST(createRequest({
            recentSeedId: RECENT_SEED_ID,
            librarySeedIds: [LIBRARY_SEED_ID, LIBRARY_SEED_ID],
            excludeIds: [KNOWN_ID],
            targetCount: 3,
        }));

        expect(response.status).toBe(200);
        expect(mockRpc).toHaveBeenCalledTimes(2);
        expect(mockRpc).toHaveBeenNthCalledWith(1, "match_recommendations", {
            seed_ids: [RECENT_SEED_ID],
            exclude_ids: [RECENT_SEED_ID, KNOWN_ID, LIBRARY_SEED_ID],
            match_count: 12,
        });
        expect(mockRpc).toHaveBeenNthCalledWith(2, "match_recommendations", {
            seed_ids: [LIBRARY_SEED_ID],
            exclude_ids: [LIBRARY_SEED_ID, KNOWN_ID, RECENT_SEED_ID],
            match_count: 24,
        });
        expect(latestQuery.limit).toHaveBeenCalledWith(2);
        expect(latestQuery.not).toHaveBeenCalledWith(
            "id",
            "in",
            "(123e4567-e89b-12d3-a456-426614174002,123e4567-e89b-12d3-a456-426614174001,123e4567-e89b-12d3-a456-426614174000,123e4567-e89b-12d3-a456-426614174100,123e4567-e89b-12d3-a456-426614174101)",
        );

        const json = await response.json();
        expect(json.recentItems.map((item: { id: string }) => item.id)).toEqual([recentItem.id]);
        expect(json.libraryItems.map((item: { id: string }) => item.id)).toEqual([
            semanticLibraryItem.id,
            fillItems[0]!.id,
            fillItems[1]!.id,
        ]);
    });

    it("does not run the library fallback fill when there are no library seeds", async () => {
        const recentItem = createRecommendation("123e4567-e89b-12d3-a456-426614174110", "Recent match", 0.95);

        mockRpc.mockResolvedValueOnce({ data: [recentItem], error: null });

        const response = await POST(createRequest({
            recentSeedId: RECENT_SEED_ID,
            librarySeedIds: [],
            excludeIds: [KNOWN_ID],
            targetCount: 3,
        }));

        expect(response.status).toBe(200);
        expect(mockRpc).toHaveBeenCalledTimes(1);
        expect(mockFrom).not.toHaveBeenCalled();

        const json = await response.json();
        expect(json).toEqual({
            recentItems: [recentItem],
            libraryItems: [],
        });
    });
});
