import { NextRequest, NextResponse } from "next/server";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

/**
 * GET /api/random
 * 
 * Returns a random published content item.
 */
export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 15 requests per 60 seconds per IP
    const rl = await rateLimit(request, { limit: 15, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    const supabase = createPublicServerClient();

    const { data: randomRows, error: rpcError } = await (supabase.rpc as any)(
        "get_random_verified_content"
    );

    if (rpcError) {
        logApiError({
            requestId,
            route: "/api/random",
            message: "Failed to fetch random content via RPC",
            error: rpcError,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch content", 500, requestId);
    }

    const randomRow = Array.isArray(randomRows) ? randomRows[0] : null;
    if (!randomRow) {
        return apiError("NOT_FOUND", "No content available", 404, requestId);
    }

    return NextResponse.json(randomRow, {
        headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
        }
    });
}
