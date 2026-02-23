import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();

    // 1. Rate Limiting: 30 requests per minute
    const rl = rateLimit(request, { limit: 30, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return apiError("UNAUTHORIZED", "Must be logged in to delete a highlight.", 401, requestId);
        }

        const { error } = await supabase
            .from("user_highlights")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id); // Double check ownership via query (RLS also handles this)

        if (error) {
            logApiError({ requestId, route: "DELETE /api/library/highlights/[id]", message: "Error deleting highlight", error });
            return apiError("INTERNAL_ERROR", "Failed to delete highlight.", 500, requestId);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logApiError({ requestId, route: "DELETE /api/library/highlights/[id]", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}
