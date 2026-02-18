import { createPublicServerClient } from "@/lib/supabase/public-server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";

const RecommendationsRequestSchema = z.object({
    completedIds: z.array(z.string().uuid()).max(50).default([]),
});

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

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

        const { data, error } = await (supabase.rpc as any)("match_recommendations", {
            completed_ids: completedIds,
            match_count: 6,
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
