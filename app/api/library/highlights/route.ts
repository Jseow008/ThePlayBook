import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const HIGHLIGHT_LIMIT = 50; // max highlights per content item

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    // 1. Rate Limiting: 30 requests per minute
    const rl = rateLimit(request, { limit: 30, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            ...rl.headers,
        );
    }

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return apiError("UNAUTHORIZED", "Must be logged in to create a highlight.", 401, requestId);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON payload.", 400, requestId);
        }

        const { content_item_id, segment_id, highlighted_text, note_body, color } = body as {
            content_item_id?: string;
            segment_id?: string;
            highlighted_text?: string;
            note_body?: string;
            color?: string;
        };

        if (!content_item_id || !highlighted_text) {
            return apiError("VALIDATION_ERROR", "Missing required fields (content_item_id, highlighted_text).", 400, requestId);
        }

        // Optional: Check quota per item to prevent massive abuse
        const { count } = await supabase
            .from("user_highlights")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("content_item_id", content_item_id);

        if (count && count >= HIGHLIGHT_LIMIT) {
            return apiError("FORBIDDEN", `Maximum of ${HIGHLIGHT_LIMIT} highlights per item reached.`, 403, requestId);
        }

        const { data, error } = await supabase
            .from("user_highlights")
            .insert({
                user_id: user.id,
                content_item_id,
                segment_id: segment_id ?? null,
                highlighted_text,
                note_body: note_body ?? null,
                color: color || "yellow",
            })
            .select()
            .single();

        if (error) {
            logApiError({ requestId, route: "POST /api/library/highlights", message: "Error inserting highlight", error });
            return apiError("INTERNAL_ERROR", "Failed to save highlight.", 500, requestId);
        }

        return NextResponse.json({ data });
    } catch (error) {
        logApiError({ requestId, route: "POST /api/library/highlights", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    // 1. Rate Limiting: 50 requests per minute
    const rl = rateLimit(request, { limit: 50, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return apiError("UNAUTHORIZED", "Must be logged in to view highlights.", 401, requestId);
        }

        const url = new URL(request.url);
        const contentItemId = url.searchParams.get("content_item_id");

        let query = supabase
            .from("user_highlights")
            .select(`
                *,
                content_item ( id, title, author, cover_image_url )
            `)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (contentItemId) {
            query = query.eq("content_item_id", contentItemId);
        } else {
            // Cap global highlight fetch at 100 for performance on the /brain page
            query = query.limit(100);
        }

        const { data, error } = await query;

        if (error) {
            logApiError({ requestId, route: "GET /api/library/highlights", message: "Error fetching highlights", error });
            return apiError("INTERNAL_ERROR", "Failed to fetch highlights.", 500, requestId);
        }

        return NextResponse.json({ data });
    } catch (error) {
        logApiError({ requestId, route: "GET /api/library/highlights", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}
