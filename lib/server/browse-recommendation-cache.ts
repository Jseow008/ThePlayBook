import "server-only";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";

export const BROWSE_RECOMMENDATION_CACHE_TTL_SECONDS = 10 * 60;

const CACHE_KEY_PREFIX = "netflux:browse-recommendations:v1:";

export type BrowseRecommendationCacheStatus = "hit" | "miss" | "bypass";

export interface BrowseRecommendationCacheEntry<T> {
    status: BrowseRecommendationCacheStatus;
    value: T | null;
}

interface BrowseRecommendationCacheKeyInput {
    recentSeedId: string | null;
    librarySeedIds: string[];
    excludeIds: string[];
    targetCount: number;
}

let redis: Redis | null = null;

function hasRedisConfig() {
    return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function normalizeIds(ids: string[]) {
    return Array.from(new Set(ids.map((id) => id.toLowerCase()))).sort();
}

function getRedis() {
    if (!hasRedisConfig()) {
        return null;
    }

    if (!redis) {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL!,
            token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        });
    }

    return redis;
}

/**
 * The Redis key carries only a hash. Inputs are normalized so equivalent UUID
 * ordering produces one shared entry without exposing library data to Redis keys.
 */
export function getBrowseRecommendationCacheKey(input: BrowseRecommendationCacheKeyInput) {
    const normalized = JSON.stringify({
        algorithm_version: "v1",
        recent_seed_id: input.recentSeedId?.toLowerCase() ?? null,
        library_seed_ids: normalizeIds(input.librarySeedIds),
        exclude_ids: normalizeIds(input.excludeIds),
        target_count: input.targetCount,
    });
    const digest = createHash("sha256").update(normalized).digest("hex");

    return `${CACHE_KEY_PREFIX}${digest}`;
}

export async function readBrowseRecommendationCache<T>(key: string): Promise<BrowseRecommendationCacheEntry<T>> {
    const client = getRedis();
    if (!client) {
        return { status: "bypass", value: null };
    }

    try {
        const value = await client.get<T>(key);
        return value == null ? { status: "miss", value: null } : { status: "hit", value };
    } catch (error) {
        console.warn("Browse recommendation cache read failed; bypassing cache", {
            error_name: error instanceof Error ? error.name : "unknown",
        });
        return { status: "bypass", value: null };
    }
}

export async function writeBrowseRecommendationCache<T>(key: string, value: T): Promise<boolean> {
    const client = getRedis();
    if (!client) {
        return false;
    }

    try {
        await client.set(key, value, { ex: BROWSE_RECOMMENDATION_CACHE_TTL_SECONDS });
        return true;
    } catch (error) {
        console.warn("Browse recommendation cache write failed", {
            error_name: error instanceof Error ? error.name : "unknown",
        });
        return false;
    }
}
