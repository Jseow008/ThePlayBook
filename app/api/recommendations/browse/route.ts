import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";
import type { Database } from "@/types/database";

const BrowseRecommendationsRequestSchema = z.object({
    recentSeedId: z.string().uuid().nullable().optional(),
    librarySeedIds: z.array(z.string().uuid()).max(50).default([]),
    excludeIds: z.array(z.string().uuid()).max(500).default([]),
    targetCount: z.coerce.number().int().min(1).max(10).default(10),
});

const BROWSE_RECOMMENDATION_SELECT =
    "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, updated_at, deleted_at";

type RecommendationItem = Database["public"]["Functions"]["match_recommendations"]["Returns"][number];

function dedupeIds(ids: Array<string | null | undefined>) {
    return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

function dedupeItems<T extends { id: string }>(items: T[]) {
    return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function getFreshnessBoost(createdAt: string | null | undefined, fallbackScore: number) {
    const parsed = createdAt ? Date.parse(createdAt) : Number.NaN;
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
            const freshnessBoost = getFreshnessBoost(candidate.created_at, 0.15);
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
        .order("created_at", { ascending: false })
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
    const requestId = getRequestId();
    const rl = await bestEffortRateLimit(request, {
        limit: 10,
        windowMs: 60_000,
        routeLabel: "/api/recommendations/browse",
    });

    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait and try again." } },
            {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
            },
        );
    }

    try {
        const parsed = BrowseRecommendationsRequestSchema.safeParse(await request.json());
        if (!parsed.success) {
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

        const [recentResult, libraryResult] = await Promise.all([
            loadSemanticRecommendations({
                supabase,
                seedIds: recentSeedId ? [recentSeedId] : [],
                excludeIds: baseExcludeIds,
                targetCount,
            }),
            loadSemanticRecommendations({
                supabase,
                seedIds: librarySeedIds,
                excludeIds: baseExcludeIds,
                targetCount: targetCount * 2,
            }),
        ]);

        if (recentResult.error) {
            logApiError({
                requestId,
                route: "/api/recommendations/browse",
                message: "Recent browse recommendation RPC failed",
                error: recentResult.error,
            });
        }

        if (libraryResult.error) {
            logApiError({
                requestId,
                route: "/api/recommendations/browse",
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
        const fillResult = librarySeedIds.length > 0
            ? await loadLatestFill({
                supabase,
                excludeIds: fillExcludeIds,
                limit: targetCount - semanticLibraryItems.length,
            })
            : { data: [] as RecommendationItem[], error: null };

        if (fillResult.error) {
            logApiError({
                requestId,
                route: "/api/recommendations/browse",
                message: "Browse recommendation fallback fill failed",
                error: fillResult.error,
            });
        }

        const libraryItems = dedupeItems([
            ...semanticLibraryItems,
            ...fillResult.data,
        ]).slice(0, targetCount);

        return NextResponse.json(
            { recentItems, libraryItems },
            {
                headers: {
                    "Cache-Control": "private, no-store",
                },
            },
        );
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/recommendations/browse",
            message: "Browse recommendations request parse error",
            error,
        });
        return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
    }
}
