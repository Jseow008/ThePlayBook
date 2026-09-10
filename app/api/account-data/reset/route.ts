import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimitFailureResponseWithTelemetry, strictPublicRateLimit } from "@/lib/server/rate-limit";
import { resetLibraryForAccount } from "@/lib/server/account-data-snapshots";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return apiError("UNAUTHORIZED", "Sign in to reset your library.", 401, requestId);

        const limit = await strictPublicRateLimit(request, {
            limit: 3,
            windowMs: 60 * 60 * 1000,
            key: "account-data-reset",
            identifier: user.id,
            routeLabel: "account-data-reset",
        });
        if (!limit.success) {
            return rateLimitFailureResponseWithTelemetry({
                request,
                requestId,
                result: limit,
                route: "POST /api/account-data/reset",
                category: "public",
                userId: user.id,
                authState: "authenticated",
                message: "Too many reset requests. Please wait before trying again.",
            });
        }

        const result = await resetLibraryForAccount(user.id);
        return NextResponse.json({ data: result }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({ requestId, route: "POST /api/account-data/reset", message: "Could not reset account library", error });
        return apiError("INTERNAL_ERROR", "Could not reset your library.", 503, requestId);
    }
}
