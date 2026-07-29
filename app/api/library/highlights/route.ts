import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import {
    findHighlightOverlap,
    isHighlightOverlapConstraintError,
    type HighlightOverlap,
} from "@/lib/server/highlight-overlaps";
import type { Database } from "@/types/database";

const HIGHLIGHT_LIMIT = 50; // max highlights per content item
const HIGHLIGHT_TEXT_MAX = 2_000;
const NOTE_BODY_MAX = 4_000;
const HighlightColorSchema = z.enum(["yellow", "blue", "green", "pink", "purple", "red"]);
type HighlightInsert = Database["public"]["Tables"]["user_highlights"]["Insert"];
type HighlightRow = Database["public"]["Tables"]["user_highlights"]["Row"];

function highlightOverlapResponse(
    overlap: HighlightOverlap,
    requestId: string
) {
    if (overlap.relationship === "exact") {
        return NextResponse.json({
            data: overlap.highlight,
            disposition: "existing",
        });
    }

    return apiError(
        "CONFLICT",
        "This selection overlaps an existing highlight.",
        409,
        requestId,
        {
            existing_highlight_id: overlap.highlight.id,
            relationship: overlap.relationship,
        }
    );
}

const CreateHighlightSchema = z.object({
    content_item_id: z.string().uuid(),
    segment_id: z.string().uuid().optional().nullable(),
    highlighted_text: z.string().trim().min(1).max(HIGHLIGHT_TEXT_MAX),
    note_body: z.string().trim().max(NOTE_BODY_MAX).optional().nullable(),
    color: HighlightColorSchema.optional(),
    anchor_start: z.number().int().min(0).optional(),
    anchor_end: z.number().int().min(1).optional(),
}).refine(
    (data) =>
        (data.anchor_start === undefined && data.anchor_end === undefined)
        || (
            data.anchor_start !== undefined
            && data.anchor_end !== undefined
            && data.anchor_end > data.anchor_start
        ),
    {
        message: "Anchor offsets must be provided as a valid pair.",
    }
);

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    // 1. Rate Limiting: 30 requests per minute
    const rl = await rateLimit(request, { limit: 30, windowMs: 60_000 });
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

        const { content_item_id, segment_id, highlighted_text, note_body, color, anchor_start, anchor_end } = parsed.data;

        if (
            segment_id
            && anchor_start !== undefined
            && anchor_end !== undefined
        ) {
            const { overlap, error: overlapError } = await findHighlightOverlap({
                supabase,
                userId: user.id,
                contentItemId: content_item_id,
                segmentId: segment_id,
                anchorStart: anchor_start,
                anchorEnd: anchor_end,
            });

            if (overlapError) {
                logApiError({
                    requestId,
                    route: "POST /api/library/highlights",
                    message: "Error checking highlight overlap",
                    error: overlapError,
                    userId: user.id,
                });
                return apiError("INTERNAL_ERROR", "Failed to validate highlight selection.", 500, requestId);
            }

            if (overlap) {
                return highlightOverlapResponse(overlap, requestId);
            }
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

        const payload: HighlightInsert = {
            user_id: user.id,
            content_item_id,
            segment_id: segment_id ?? null,
            highlighted_text,
            note_body: note_body ?? null,
            color: color ?? (note_body ? "blue" : "yellow"),
            anchor_start: anchor_start ?? null,
            anchor_end: anchor_end ?? null,
        };

        const { data, error } = await supabase
            .from("user_highlights")
            // @ts-expect-error - types for user_highlights might be outdated
            .insert(payload)
            .select()
            .single();

        if (error) {
            if (
                isHighlightOverlapConstraintError(error)
                && segment_id
                && anchor_start !== undefined
                && anchor_end !== undefined
            ) {
                const { overlap } = await findHighlightOverlap({
                    supabase,
                    userId: user.id,
                    contentItemId: content_item_id,
                    segmentId: segment_id,
                    anchorStart: anchor_start,
                    anchorEnd: anchor_end,
                });

                if (overlap) {
                    return highlightOverlapResponse(overlap, requestId);
                }
            }

            logApiError({ requestId, route: "POST /api/library/highlights", message: "Error inserting highlight", error });
            return apiError("INTERNAL_ERROR", "Failed to save highlight.", 500, requestId);
        }

        const highlight = data as HighlightRow;
        const highlightId = typeof highlight.id === "string" ? highlight.id : requestId;
        const noteLength = note_body?.trim().length ?? 0;

        await captureServerAnalyticsEvent({
            event: "highlight_created",
            distinctId: user.id,
            insertId: `highlight_created:${user.id}:${highlightId}`,
            properties: {
                content_id: content_item_id,
                route: "POST /api/library/highlights",
                color: payload.color ?? undefined,
                has_note: noteLength > 0,
                user_state: "authenticated",
            },
        });

        if (noteLength > 0) {
            await captureServerAnalyticsEvent({
                event: "note_created",
                distinctId: user.id,
                insertId: `note_created:${user.id}:${highlightId}`,
                properties: {
                    content_id: content_item_id,
                    route: "POST /api/library/highlights",
                    highlight_id: highlightId,
                    note_length: noteLength,
                    user_state: "authenticated",
                },
            });
        }

        return NextResponse.json({ data, disposition: "created" });
    } catch (error) {
        logApiError({ requestId, route: "POST /api/library/highlights", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    // 1. Rate Limiting: 50 requests per minute
    const rl = await rateLimit(request, { limit: 50, windowMs: 60_000 });
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
        const cursor = url.searchParams.get("cursor");
        const limitParam = url.searchParams.get("limit");

        let limit = 30;
        if (limitParam) {
            const parsedLimit = parseInt(limitParam, 10);
            if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
                limit = parsedLimit;
            }
        }

        let query = supabase
            .from("user_highlights")
            .select(`
                *,
                content_item ( id, title, author, cover_image_url ),
                segment ( id, title )
            `)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (contentItemId) {
            query = query.eq("content_item_id", contentItemId);
        }

        if (cursor) {
            query = query.lt("created_at", cursor);
        }

        const { data, error } = await query;

        if (error) {
            logApiError({ requestId, route: "GET /api/library/highlights", message: "Error fetching highlights", error });
            return apiError("INTERNAL_ERROR", "Failed to fetch highlights.", 500, requestId);
        }

        const nextCursor = data && data.length === limit
            ? (data[data.length - 1] as { created_at?: string | null })?.created_at ?? null
            : null;

        return NextResponse.json({ data, nextCursor });
    } catch (error) {
        logApiError({ requestId, route: "GET /api/library/highlights", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}
