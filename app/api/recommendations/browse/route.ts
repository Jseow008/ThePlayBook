import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import {
    getBrowseRecommendationCacheKey,
    readBrowseRecommendationCache,
    writeBrowseRecommendationCache,
} from "@/lib/server/browse-recommendation-cache";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";
import type { Database } from "@/types/database";

const BrowseRecommendationsRequestSchema = z.object({
    recentSeedId: z.string().uuid().nullable().optional(),
    librarySeedIds: z.array(z.string().uuid()).max(50).default([]),
    excludeIds: z.array(z.string().uuid()).max(500).default([]),
    targetCount: z.coerce.number().int().min(1).max(10).default(10),
});

const BROWSE_RECOMMENDATION_SELECT =
    "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, published_at, updated_at, deleted_at";

type RecommendationItem = Database["public"]["Functions"]["match_recommendations"]["Returns"][number];

const BROWSE_RECOMMENDATIONS_ROUTE = "/api/recommendations/browse";
const BROWSE_RECOMMENDATIONS_CACHE_STATUS = "bypass";

function logBrowseRecommendationTiming(fields: Record<string, number | string>) {
    // Keep this event aggregate-only: seed, exclusion, and returned-item values
    // are logged as counts. Do not add content, library, user, or request IDs.
    console.info("Browse recommendations timing", {
        observability_version: "v1",
        route: BROWSE_RECOMMENDATIONS_ROUTE,
        cache_status: BROWSE_RECOMMENDATIONS_CACHE_STATUS,
        ...fields,
    });
}

function recommendationResponse(payload: {
    recentItems: RecommendationItem[];
    libraryItems: RecommendationItem[];
}, timings: {
    recentMs: number;
    libraryMs: number;
    fillMs: number;
    totalMs: number;
    cacheMs: number;
    cacheStatus: string;
}) {
    return NextResponse.json(
        payload,
        {
            headers: {
                "Cache-Control": "private, no-store",
                "Server-Timing": [
                    `recent;dur=${timings.recentMs}`,
                    `library;dur=${timings.libraryMs}`,
                    `fill;dur=${timings.fillMs}`,
                    `total;dur=${timings.totalMs}`,
                    `cache;dur=${timings.cacheMs};desc="${timings.cacheStatus}"`,
                ].join(", "),
            },
        },
    );
}
async function timeAsync<T>(operation: () => Promise<T>) {
    const startedAt = Date.now();
    const result = await operation();

    return {
        result,
        durationMs: Date.now() - startedAt,
    };
}

function dedupeIds(ids: Array<string | null | undefined>) {
    return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

function dedupeItems<T extends { id: string }>(items: T[]) {
    return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function getFreshnessBoost(publishedAt: string | null | undefined, fallbackScore: number) {
    const parsed = publishedAt ? Date.parse(publishedAt) : Number.NaN;
    if (!Number.isFinite(parsed)) {
        return fallbackScore;
    }

    const ageDays = Math.max(0, (Date.now() - parsed) / (1000 * 60 * 60 * 24));
    return Math.max(0, 1 - ageDays / 180);
}

function rerankRecommendations(candidates: RecommendationItem[], matchCount: number) {
    const remaining = dedupeItems(candidates);
    const selected: RecommendationItem[] = [];

    while (remaining.length > 0 && selected.length < matchCount) {
        let bestIndex = 0;
        let bestScore = Number.NEGATIVE_INFINITY;

        remaining.forEach((candidate, index) => {
            const similarityScore = Number.isFinite(candidate.similarity)
                ? Math.max(candidate.similarity, 0)
                : 0;
            const freshnessBoost = getFreshnessBoost(candidate.published_at, 0.15);
            const hasAuthorCollision = Boolean(
                candidate.author
                && selected.some((item) => item.author && item.author === candidate.author),
            );
            const hasCategoryCollision = Boolean(
                candidate.category
                && selected.some((item) => item.category && item.category === candidate.category),
            );

            const score = similarityScore
                + (freshnessBoost * 0.18)
                - (hasAuthorCollision ? 0.14 : 0)
                - (hasCategoryCollision ? 0.08 : 0)
                - (index * 0.0025);

            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });

        selected.push(remaining.splice(bestIndex, 1)[0]!);
    }

    return selected;
}

async function loadSemanticRecommendations(params: {
    supabase: ReturnType<typeof createPublicServerClient>;
    seedIds: string[];
    excludeIds: string[];
    targetCount: number;
}) {
    if (params.seedIds.length === 0) {
        return { data: [] as RecommendationItem[], error: null };
    }

    const candidateCount = Math.min(Math.max(params.targetCount * 4, 12), 40);
    const { data, error } = await params.supabase.rpc("match_recommendations", {
        seed_ids: params.seedIds,
        exclude_ids: dedupeIds([...params.seedIds, ...params.excludeIds]),
        match_count: candidateCount,
    });

    if (error) {
        return { data: [] as RecommendationItem[], error };
    }

    return {
        data: rerankRecommendations((data ?? []) as RecommendationItem[], params.targetCount),
        error: null,
    };
}

async function loadLatestFill(params: {
    supabase: ReturnType<typeof createPublicServerClient>;
    excludeIds: string[];
    limit: number;
}) {
    if (params.limit <= 0) {
        return { data: [] as RecommendationItem[], error: null };
    }

    let query = params.supabase
        .from("content_item")
        .select(BROWSE_RECOMMENDATION_SELECT)
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(params.limit);

    const excludeIds = dedupeIds(params.excludeIds);
    if (excludeIds.length > 0) {
        query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data, error } = await query;

    return {
        data: (data ?? []) as RecommendationItem[],
        error,
    };
}

export async function POST(request: NextRequest) {
    const requestStartedAt = Date.now();
    const requestId = getRequestId();
    const rateLimitStartedAt = Date.now();
    const rl = await strictPublicRateLimit(request, {
        limit: 10,
        windowMs: 60_000,
        routeLabel: BROWSE_RECOMMENDATIONS_ROUTE,
    });
    const rateLimitDurationMs = Date.now() - rateLimitStartedAt;

    if (!rl.success) {
        logBrowseRecommendationTiming({
            outcome: "rate_limited",
            rate_limit_ms: rateLimitDurationMs,
            total_ms: Date.now() - requestStartedAt,
        });
        return rateLimitFailureResponse(rl);
    }

    try {
        const parsed = BrowseRecommendationsRequestSchema.safeParse(await request.json());
        if (!parsed.success) {
            logBrowseRecommendationTiming({
                outcome: "validation_error",
                rate_limit_ms: rateLimitDurationMs,
                total_ms: Date.now() - requestStartedAt,
            });
            return apiError("VALIDATION_ERROR", "Invalid request payload", 400, requestId);
        }

        const supabase = createPublicServerClient();
        const recentSeedId = parsed.data.recentSeedId ?? null;
        const librarySeedIds = dedupeIds(parsed.data.librarySeedIds);
        const targetCount = parsed.data.targetCount;
        const baseExcludeIds = dedupeIds([
            ...parsed.data.excludeIds,
            ...librarySeedIds,
            recentSeedId,
        ]);
        const cacheKey = getBrowseRecommendationCacheKey({
            recentSeedId,
            librarySeedIds,
            excludeIds: baseExcludeIds,
            targetCount,
        });
        const timedCacheRead = await timeAsync(() => readBrowseRecommendationCache<{
            recentItems: RecommendationItem[];
            libraryItems: RecommendationItem[];
        }>(cacheKey));
        const cacheEntry = timedCacheRead.result;

        if (cacheEntry.value) {
            const totalDurationMs = Date.now() - requestStartedAt;
            logBrowseRecommendationTiming({
                outcome: "success",
                cache_status: cacheEntry.status,
                rate_limit_ms: rateLimitDurationMs,
                recent_ms: 0,
                library_ms: 0,
                fill_ms: 0,
                cache_read_ms: timedCacheRead.durationMs,
                cache_write_ms: 0,
                total_ms: totalDurationMs,
                recent_seed_count: recentSeedId ? 1 : 0,
                library_seed_count: librarySeedIds.length,
                exclude_count: baseExcludeIds.length,
                target_count: targetCount,
                recent_result_count: cacheEntry.value.recentItems.length,
                library_semantic_result_count: 0,
                library_fill_result_count: 0,
                library_result_count: cacheEntry.value.libraryItems.length,
            });
            return recommendationResponse(cacheEntry.value, {
                recentMs: 0,
                libraryMs: 0,
                fillMs: 0,
                totalMs: totalDurationMs,
                cacheMs: timedCacheRead.durationMs,
                cacheStatus: cacheEntry.status,
            });
        }

        const [timedRecentResult, timedLibraryResult] = await Promise.all([
            timeAsync(() => loadSemanticRecommendations({
                supabase,
                seedIds: recentSeedId ? [recentSeedId] : [],
                excludeIds: baseExcludeIds,
                targetCount,
            })),
            timeAsync(() => loadSemanticRecommendations({
                supabase,
                seedIds: librarySeedIds,
                excludeIds: baseExcludeIds,
                targetCount: targetCount * 2,
            })),
        ]);
        const recentResult = timedRecentResult.result;
        const libraryResult = timedLibraryResult.result;

        if (recentResult.error) {
            logApiError({
                requestId,
                route: BROWSE_RECOMMENDATIONS_ROUTE,
                message: "Recent browse recommendation RPC failed",
                error: recentResult.error,
            });
        }

        if (libraryResult.error) {
            logApiError({
                requestId,
                route: BROWSE_RECOMMENDATIONS_ROUTE,
                message: "Library browse recommendation RPC failed",
                error: libraryResult.error,
            });
        }

        const recentItems = recentResult.data.slice(0, targetCount);
        const recentItemIds = new Set(recentItems.map((item) => item.id));
        const semanticLibraryItems = libraryResult.data
            .filter((item) => !recentItemIds.has(item.id))
            .slice(0, targetCount);
        const fillExcludeIds = dedupeIds([
            ...baseExcludeIds,
            ...recentItems.map((item) => item.id),
            ...semanticLibraryItems.map((item) => item.id),
        ]);
        const timedFillResult = librarySeedIds.length > 0
            ? await timeAsync(() => loadLatestFill({
                supabase,
                excludeIds: fillExcludeIds,
                limit: targetCount - semanticLibraryItems.length,
            }))
            : {
                result: { data: [] as RecommendationItem[], error: null },
                durationMs: 0,
            };
        const fillResult = timedFillResult.result;

        if (fillResult.error) {
            logApiError({
                requestId,
                route: BROWSE_RECOMMENDATIONS_ROUTE,
                message: "Browse recommendation fallback fill failed",
                error: fillResult.error,
            });
        }

        const libraryItems = dedupeItems([
            ...semanticLibraryItems,
            ...fillResult.data,
        ]).slice(0, targetCount);
        const responsePayload = { recentItems, libraryItems };
        const timedCacheWrite = await timeAsync(() => writeBrowseRecommendationCache(cacheKey, responsePayload));
        const totalDurationMs = Date.now() - requestStartedAt;
        logBrowseRecommendationTiming({
            outcome: "success",
            cache_status: cacheEntry.status,
            rate_limit_ms: rateLimitDurationMs,
            recent_ms: timedRecentResult.durationMs,
            library_ms: timedLibraryResult.durationMs,
            fill_ms: timedFillResult.durationMs,
            cache_read_ms: timedCacheRead.durationMs,
            cache_write_ms: timedCacheWrite.durationMs,
            total_ms: totalDurationMs,
            recent_seed_count: recentSeedId ? 1 : 0,
            library_seed_count: librarySeedIds.length,
            exclude_count: baseExcludeIds.length,
            target_count: targetCount,
            recent_result_count: recentItems.length,
            library_semantic_result_count: semanticLibraryItems.length,
            library_fill_result_count: fillResult.data.length,
            library_result_count: libraryItems.length,
        });

        return recommendationResponse(responsePayload, {
            recentMs: timedRecentResult.durationMs,
            libraryMs: timedLibraryResult.durationMs,
            fillMs: timedFillResult.durationMs,
            totalMs: totalDurationMs,
            cacheMs: timedCacheRead.durationMs + timedCacheWrite.durationMs,
            cacheStatus: cacheEntry.status,
        });
    } catch (error) {
        logApiError({
            requestId,
            route: BROWSE_RECOMMENDATIONS_ROUTE,
            message: "Browse recommendations request parse error",
            error,
        });
        logBrowseRecommendationTiming({
            outcome: "invalid_json",
            rate_limit_ms: rateLimitDurationMs,
            total_ms: Date.now() - requestStartedAt,
        });
        return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
    }
}
