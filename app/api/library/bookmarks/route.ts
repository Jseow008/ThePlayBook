import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

// Legacy clients cannot supply the account/revision/reset preconditions.
// Fail closed and require a refresh onto the guarded mutation endpoint.
async function requireLibraryRefresh(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 30, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return apiError("UNAUTHORIZED", "Must be logged in to bookmark content.", 401, requestId);
        }

        return NextResponse.json({ error: {
            code: "LIBRARY_REFRESH_REQUIRED",
            message: "Refresh your library before making changes.",
            request_id: requestId,
        } }, { status: 428, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({ requestId, route: `${request.method} /api/library/bookmarks`, message: "Could not authenticate legacy library request", error });
        return apiError("INTERNAL_ERROR", "Could not update your library.", 503, requestId);
    }
}

export const POST = requireLibraryRefresh;
export const DELETE = requireLibraryRefresh;
