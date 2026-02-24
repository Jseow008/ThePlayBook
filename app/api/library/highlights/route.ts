import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const HIGHLIGHT_LIMIT = 50; // max highlights per content item
const HIGHLIGHT_TEXT_MAX = 2_000;
const NOTE_BODY_MAX = 4_000;
const HighlightColorSchema = z.enum(["yellow", "blue", "green", "pink", "purple", "red"]);

const CreateHighlightSchema = z.object({
    content_item_id: z.string().uuid(),
    segment_id: z.string().uuid().optional().nullable(),
    highlighted_text: z.string().trim().min(1).max(HIGHLIGHT_TEXT_MAX),
    note_body: z.string().trim().max(NOTE_BODY_MAX).optional().nullable(),
    color: HighlightColorSchema.optional(),
});

export async function POST(request: NextRequest) {
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
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return apiError("UNAUTHORIZED", "Must be logged in to create a highlight.", 401, requestId);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON payload.", 400, requestId);
        }

        const parsed = CreateHighlightSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid highlight payload.", 400, requestId);
        }

        const { content_item_id, segment_id, highlighted_text, note_body, color } = parsed.data;

        // Optional: Check quota per item to prevent massive abuse
        const { count } = await supabase
            .from("user_highlights")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("content_item_id", content_item_id);

        if (count && count >= HIGHLIGHT_LIMIT) {
            return apiError("FORBIDDEN", `Maximum of ${HIGHLIGHT_LIMIT} highlights per item reached.`, 403, requestId);
        }

        const { data, error } = await (supabase
            .from("user_highlights") as any)
            .insert({
                user_id: user.id,
                content_item_id,
                segment_id: segment_id ?? null,
                highlighted_text,
                note_body: note_body ?? null,
                color: color ?? (note_body ? "blue" : "yellow"),
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
            // Cap global highlight fetch at 100 for performance on the /notes page
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
