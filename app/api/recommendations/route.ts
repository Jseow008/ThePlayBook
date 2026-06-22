import { createPublicServerClient } from "@/lib/supabase/public-server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";
import type { Database } from "@/types/database";

const RecommendationsRequestSchema = z.object({
    seedIds: z.array(z.string().uuid()).max(50).optional(),
    completedIds: z.array(z.string().uuid()).max(50).default([]),
    excludeIds: z.array(z.string().uuid()).max(500).default([]),
    matchCount: z.coerce.number().int().min(1).max(10).default(10),
});

type RecommendationItem = Database["public"]["Functions"]["match_recommendations"]["Returns"][number];

function dedupeIds(ids: string[]) {
    return Array.from(new Set(ids));
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
    const remaining = [...candidates];
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

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 10 requests per 60 seconds per IP
    const rl = await strictPublicRateLimit(request, {
        limit: 10,
        windowMs: 60_000,
        routeLabel: "/api/recommendations",
    });
    if (!rl.success) {
        return rateLimitFailureResponse(rl);
    }

    try {
        const body = await request.json();
        const parsed = RecommendationsRequestSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid request payload", 400, requestId);
        }

        const seedIds = dedupeIds(parsed.data.seedIds ?? parsed.data.completedIds);
        const completedIds = dedupeIds(parsed.data.completedIds);
        const excludeIds = dedupeIds([
            ...seedIds,
            ...completedIds,
            ...parsed.data.excludeIds,
        ]);
        const candidateCount = Math.min(Math.max(parsed.data.matchCount * 4, 12), 40);

        if (seedIds.length === 0) {
            return NextResponse.json([], { status: 200 });
        }

        const supabase = createPublicServerClient();

        const { data, error } = await supabase.rpc("match_recommendations", {
            seed_ids: seedIds,
            exclude_ids: excludeIds,
            match_count: candidateCount,
        });

        if (error) {
            logApiError({
                requestId,
                route: "/api/recommendations",
                message: "Recommendation RPC failed",
                error,
            });
            return apiError("INTERNAL_ERROR", "Failed to get recommendations", 500, requestId);
        }

        const dedupedCandidates = dedupeIds((data || []).map((item) => item.id))
            .map((id) => (data || []).find((item) => item.id === id))
            .filter((item): item is RecommendationItem => Boolean(item));
        const recommendations = rerankRecommendations(dedupedCandidates, parsed.data.matchCount);

        return NextResponse.json(recommendations, {
            headers: {
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/recommendations",
            message: "Recommendations request parse error",
            error,
        });
        return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
    }
}
