import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Redis } from "@upstash/redis";

vi.mock("@upstash/redis", () => ({
    Redis: vi.fn(),
}));

const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const mockGet = vi.fn();
const mockSet = vi.fn();

async function loadCache() {
    vi.resetModules();
    return import("@/lib/server/browse-recommendation-cache");
}

describe("browse recommendation response cache", () => {
    beforeEach(() => {
        process.env.UPSTASH_REDIS_REST_URL = "https://upstash.example";
        process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
        mockGet.mockReset();
        mockSet.mockReset();
        vi.mocked(Redis).mockReset();
        vi.mocked(Redis).mockImplementation(function MockRedis() {
            return {
                get: mockGet,
                set: mockSet,
            } as never;
        });
    });

    afterEach(() => {
        if (originalRedisUrl === undefined) {
            delete process.env.UPSTASH_REDIS_REST_URL;
        } else {
            process.env.UPSTASH_REDIS_REST_URL = originalRedisUrl;
        }
        if (originalRedisToken === undefined) {
            delete process.env.UPSTASH_REDIS_REST_TOKEN;
        } else {
            process.env.UPSTASH_REDIS_REST_TOKEN = originalRedisToken;
        }
    });

    it("uses the same hashed key for equivalent normalized requests", async () => {
        const { getBrowseRecommendationCacheKey } = await loadCache();

        const firstKey = getBrowseRecommendationCacheKey({
            recentSeedId: "123E4567-E89B-12D3-A456-426614174000",
            librarySeedIds: ["123e4567-e89b-12d3-a456-426614174001", "123e4567-e89b-12d3-a456-426614174002"],
            excludeIds: ["123e4567-e89b-12d3-a456-426614174003", "123e4567-e89b-12d3-a456-426614174004"],
            targetCount: 10,
        });
        const secondKey = getBrowseRecommendationCacheKey({
            recentSeedId: "123e4567-e89b-12d3-a456-426614174000",
            librarySeedIds: ["123e4567-e89b-12d3-a456-426614174002", "123e4567-e89b-12d3-a456-426614174001"],
            excludeIds: ["123e4567-e89b-12d3-a456-426614174004", "123e4567-e89b-12d3-a456-426614174003"],
            targetCount: 10,
        });

        expect(firstKey).toBe(secondKey);
        expect(firstKey).toMatch(/^netflux:browse-recommendations:v1:[a-f0-9]{64}$/);
    });

    it("separates cache keys when exclusions or target count differ", async () => {
        const { getBrowseRecommendationCacheKey } = await loadCache();
        const commonRequest = {
            recentSeedId: null,
            librarySeedIds: ["123e4567-e89b-12d3-a456-426614174001"],
            excludeIds: ["123e4567-e89b-12d3-a456-426614174003"],
            targetCount: 10,
        };

        const key = getBrowseRecommendationCacheKey(commonRequest);
        expect(getBrowseRecommendationCacheKey({ ...commonRequest, targetCount: 8 })).not.toBe(key);
        expect(getBrowseRecommendationCacheKey({
            ...commonRequest,
            excludeIds: ["123e4567-e89b-12d3-a456-426614174004"],
        })).not.toBe(key);
    });

    it("returns cache misses and writes entries with the ten-minute expiry", async () => {
        const {
            BROWSE_RECOMMENDATION_CACHE_TTL_SECONDS,
            readBrowseRecommendationCache,
            writeBrowseRecommendationCache,
        } = await loadCache();
        mockGet.mockResolvedValueOnce(null);
        mockSet.mockResolvedValueOnce("OK");

        await expect(readBrowseRecommendationCache("cache-key")).resolves.toEqual({ status: "miss", value: null });
        await expect(writeBrowseRecommendationCache("cache-key", { recentItems: [], libraryItems: [] })).resolves.toBe(true);

        expect(mockSet).toHaveBeenCalledWith("cache-key", { recentItems: [], libraryItems: [] }, {
            ex: BROWSE_RECOMMENDATION_CACHE_TTL_SECONDS,
        });
        expect(BROWSE_RECOMMENDATION_CACHE_TTL_SECONDS).toBe(600);
    });

    it("returns cached values as hits", async () => {
        const { readBrowseRecommendationCache } = await loadCache();
        const value = { recentItems: [{ id: "recent" }], libraryItems: [{ id: "library" }] };
        mockGet.mockResolvedValueOnce(value);

        await expect(readBrowseRecommendationCache("cache-key")).resolves.toEqual({ status: "hit", value });
    });
});
