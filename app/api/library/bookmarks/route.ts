import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const BookmarkPayloadSchema = z.object({
    content_item_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    const rl = rateLimit(request, { limit: 30, windowMs: 60_000 });
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

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON payload.", 400, requestId);
        }

        const parsed = BookmarkPayloadSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid bookmark payload.", 400, requestId);
        }

        const { content_item_id } = parsed.data;

        const { error } = await supabase
            .from("user_library")
            .upsert(
                {
                    user_id: user.id,
                    content_id: content_item_id,
                    is_bookmarked: true,
                    last_interacted_at: new Date().toISOString(),
                },
                { onConflict: "user_id,content_id" }
            );

        if (error) {
            logApiError({ requestId, route: "POST /api/library/bookmarks", message: "Error creating bookmark", error, userId: user.id });
            return apiError("INTERNAL_ERROR", "Failed to save bookmark.", 500, requestId);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logApiError({ requestId, route: "POST /api/library/bookmarks", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}

export async function DELETE(request: NextRequest) {
    const requestId = getRequestId();

    const rl = rateLimit(request, { limit: 30, windowMs: 60_000 });
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
            return apiError("UNAUTHORIZED", "Must be logged in to remove bookmark.", 401, requestId);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON payload.", 400, requestId);
        }

        const parsed = BookmarkPayloadSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid bookmark payload.", 400, requestId);
        }

        const { content_item_id } = parsed.data;

        const { data: existing, error: fetchError } = await supabase
            .from("user_library")
            .select("progress")
            .eq("user_id", user.id)
            .eq("content_id", content_item_id)
            .maybeSingle();

        if (fetchError) {
            logApiError({ requestId, route: "DELETE /api/library/bookmarks", message: "Error fetching bookmark row", error: fetchError, userId: user.id });
            return apiError("INTERNAL_ERROR", "Failed to remove bookmark.", 500, requestId);
        }

        if (!existing) {
            return NextResponse.json({ success: true });
        }

        const hasProgress = existing.progress !== null;

        if (!hasProgress) {
            const { error: deleteError } = await supabase
                .from("user_library")
                .delete()
                .eq("user_id", user.id)
                .eq("content_id", content_item_id);

            if (deleteError) {
                logApiError({ requestId, route: "DELETE /api/library/bookmarks", message: "Error deleting bookmark row", error: deleteError, userId: user.id });
                return apiError("INTERNAL_ERROR", "Failed to remove bookmark.", 500, requestId);
            }
        } else {
            const { error: updateError } = await supabase
                .from("user_library")
                .update({ is_bookmarked: false, last_interacted_at: new Date().toISOString() })
                .eq("user_id", user.id)
                .eq("content_id", content_item_id);

            if (updateError) {
                logApiError({ requestId, route: "DELETE /api/library/bookmarks", message: "Error updating bookmark row", error: updateError, userId: user.id });
                return apiError("INTERNAL_ERROR", "Failed to remove bookmark.", 500, requestId);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logApiError({ requestId, route: "DELETE /api/library/bookmarks", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}
