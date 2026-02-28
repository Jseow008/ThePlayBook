import { createPublicServerClient } from "@/lib/supabase/public-server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const RecommendationsRequestSchema = z.object({
    completedIds: z.array(z.string().uuid()).max(50).default([]),
});

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 10 requests per 60 seconds per IP
    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait and try again." } },
            {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
            }
        );
    }

    try {
        const body = await request.json();
        const parsed = RecommendationsRequestSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid request payload", 400, requestId);
        }

        const completedIds = Array.from(new Set(parsed.data.completedIds));

        if (completedIds.length === 0) {
            return NextResponse.json([], { status: 200 });
        }

        const supabase = createPublicServerClient();

        const { data, error } = await supabase.rpc("match_recommendations", {
            completed_ids: completedIds,
            match_count: 10,
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

        return NextResponse.json(data || [], {
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
