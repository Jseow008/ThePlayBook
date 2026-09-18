import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { afterResponse } from "@/lib/server/after-response";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";
import {
    findHighlightOverlap,
    isHighlightOverlapConstraintError,
    type HighlightOverlap,
} from "@/lib/server/highlight-overlaps";
import type { Database } from "@/types/database";

const HIGHLIGHT_LIMIT = 50; // max highlights per content item
const HIGHLIGHT_TEXT_MAX = 2_000;
const NOTE_BODY_MAX = 4_000;
const HIGHLIGHT_SEARCH_CURSOR_VERSION = "highlights-v1";
const HighlightColorSchema = z.enum(["yellow", "blue", "green", "pink", "purple", "red"]);
type HighlightInsert = Database["public"]["Tables"]["user_highlights"]["Insert"];
type HighlightRow = Database["public"]["Tables"]["user_highlights"]["Row"];
type HighlightSearchSort = "newest" | "oldest";
type HighlightSearchType = "note" | "highlight";
type HighlightSearchCursor = {
    version: typeof HIGHLIGHT_SEARCH_CURSOR_VERSION;
    accountId: string;
    sessionId: string;
    filterHash: string;
    createdAt: string;
    id: string;
};
type HighlightSearchRow = HighlightRow & {
    cursor_created_at: string;
    content_title: string | null;
    content_author: string | null;
    content_cover_image_url: string | null;
    segment_title: string | null;
};

function highlightCursorSecret() {
    const secret = process.env.ACCOUNT_DATA_CURSOR_SECRET;
    if (!secret) throw new Error("Highlight search cursor is not configured.");
    return secret;
}

function highlightFilterHash(input: Record<string, string | null>) {
    return createHmac("sha256", highlightCursorSecret())
        .update(JSON.stringify(input))
        .digest("base64url");
}

function encodeHighlightCursor(cursor: HighlightSearchCursor) {
    const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
    const signature = createHmac("sha256", highlightCursorSecret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

function decodeHighlightCursor(value: string, accountId: string, sessionId: string, filterHash: string): HighlightSearchCursor | null {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", highlightCursorSecret()).update(payload).digest("base64url");
    const suppliedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;

    try {
        const cursor = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as HighlightSearchCursor;
        if (
            cursor.version !== HIGHLIGHT_SEARCH_CURSOR_VERSION
            || cursor.accountId !== accountId
            || cursor.sessionId !== sessionId
            || cursor.filterHash !== filterHash
            || typeof cursor.createdAt !== "string"
            || !z.string().uuid().safeParse(cursor.id).success
        ) return null;
        return cursor;
    } catch {
        return null;
    }
}

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

        afterResponse(async () => {
            const highlightEvent = captureServerAnalyticsEvent({
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
            const noteEvent = noteLength > 0
                ? captureServerAnalyticsEvent({
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
                })
                : null;

            await Promise.all([highlightEvent, noteEvent]);
        });

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
        const verifiedSession = await getVerifiedAccountDataSession();
        if (!verifiedSession) {
            return apiError("UNAUTHORIZED", "Must be logged in to view highlights.", 401, requestId);
        }
        const { accountId, sessionId } = verifiedSession;
        const supabase = await createClient();

        const url = new URL(request.url);
        const contentItemId = url.searchParams.get("content_item_id");
        const cursor = url.searchParams.get("cursor");
        const limitParam = url.searchParams.get("limit");
        const queryText = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
        const typeParam = url.searchParams.get("type");
        const colorParam = url.searchParams.get("color");
        const sortParam = url.searchParams.get("sort");
        const itemType: HighlightSearchType | null = typeParam === "note" || typeParam === "highlight" ? typeParam : null;
        const sort: HighlightSearchSort = sortParam === "oldest" ? "oldest" : "newest";
        const color = HighlightColorSchema.safeParse(colorParam).success ? colorParam : null;

        if (queryText.length > 160 || (contentItemId && !z.string().uuid().safeParse(contentItemId).success)) {
            return apiError("VALIDATION_ERROR", "Invalid highlight search.", 400, requestId);
        }

        if (typeParam && !itemType) {
            return apiError("VALIDATION_ERROR", "Invalid highlight type filter.", 400, requestId);
        }

        if (colorParam && !color) {
            return apiError("VALIDATION_ERROR", "Invalid highlight color filter.", 400, requestId);
        }

        let limit = 30;
        if (limitParam) {
            const parsedLimit = parseInt(limitParam, 10);
            if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
                limit = parsedLimit;
            }
        }

        const filterHash = highlightFilterHash({
            query: queryText || null,
            contentItemId: contentItemId ?? null,
            itemType,
            color,
            sort,
        });
        const decodedCursor = cursor ? decodeHighlightCursor(cursor, accountId, sessionId, filterHash) : null;
        if (cursor && !decodedCursor) {
            return apiError("VALIDATION_ERROR", "This notes page is no longer valid. Start again.", 400, requestId);
        }

        const rpcClient = supabase as typeof supabase & {
            rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: HighlightSearchRow[] | null; error: unknown | null }>;
        };
        const { data, error } = await rpcClient.rpc("search_user_highlights", {
            p_query: queryText || null,
            p_content_item_id: contentItemId ?? null,
            p_item_type: itemType,
            p_color: color,
            p_sort: sort,
            p_after_created_at: decodedCursor?.createdAt ?? null,
            p_after_id: decodedCursor?.id ?? null,
            p_limit: limit + 1,
        });

        if (error) {
            logApiError({ requestId, route: "GET /api/library/highlights", message: "Error fetching highlights", error });
            return apiError("INTERNAL_ERROR", "Failed to fetch highlights.", 500, requestId);
        }

        const rows = data ?? [];
        const hasNextPage = rows.length > limit;
        const pageRows = rows.slice(0, limit);
        const finalRow = pageRows.at(-1);
        const nextCursor = hasNextPage && finalRow?.cursor_created_at
            ? encodeHighlightCursor({
                version: HIGHLIGHT_SEARCH_CURSOR_VERSION,
                accountId,
                sessionId,
                filterHash,
                // Preserve PostgreSQL microseconds in the signed boundary;
                // the display timestamp can remain the normal API value.
                createdAt: finalRow.cursor_created_at,
                id: finalRow.id,
            })
            : null;
        const responseData = pageRows.map((row) => ({
            id: row.id,
            user_id: row.user_id,
            content_item_id: row.content_item_id,
            segment_id: row.segment_id,
            anchor_start: row.anchor_start,
            anchor_end: row.anchor_end,
            highlighted_text: row.highlighted_text,
            note_body: row.note_body,
            color: row.color,
            created_at: row.created_at,
            updated_at: row.updated_at,
            content_item: row.content_title ? {
                id: row.content_item_id,
                title: row.content_title,
                author: row.content_author,
                cover_image_url: row.content_cover_image_url,
            } : null,
            segment: row.segment_id ? { id: row.segment_id, title: row.segment_title } : null,
        }));

        return NextResponse.json({ data: responseData, nextCursor });
    } catch (error) {
        logApiError({ requestId, route: "GET /api/library/highlights", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}

export async function DELETE(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 5, windowMs: 60_000, key: "delete-all" });
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
            return apiError("UNAUTHORIZED", "Must be logged in to delete notes and highlights.", 401, requestId);
        }

        const { count, error: countError } = await supabase
            .from("user_highlights")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);

        if (countError) {
            logApiError({ requestId, route: "DELETE /api/library/highlights", message: "Error counting notes and highlights", error: countError, userId: user.id });
            return apiError("INTERNAL_ERROR", "Failed to delete notes and highlights.", 500, requestId);
        }

        const { error: deleteError } = await supabase
            .from("user_highlights")
            .delete()
            .eq("user_id", user.id);

        if (deleteError) {
            logApiError({ requestId, route: "DELETE /api/library/highlights", message: "Error deleting notes and highlights", error: deleteError, userId: user.id });
            return apiError("INTERNAL_ERROR", "Failed to delete notes and highlights.", 500, requestId);
        }

        return NextResponse.json({ success: true, deletedCount: count ?? 0 });
    } catch (error) {
        logApiError({ requestId, route: "DELETE /api/library/highlights", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}
