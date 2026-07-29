import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import {
    findHighlightOverlap,
    isHighlightOverlapConstraintError,
    type HighlightOverlap,
} from "@/lib/server/highlight-overlaps";
import type { Database } from "@/types/database";

interface RouteParams {
    params: Promise<{ id: string }>;
}

const HighlightIdSchema = z.string().uuid();
const HighlightColorSchema = z.enum(["yellow", "blue", "green", "pink", "purple", "red"]);
type HighlightUpdate = Database["public"]["Tables"]["user_highlights"]["Update"];
const UpdateHighlightSchema = z
    .object({
        note_body: z.string().trim().max(4_000).nullable().optional(),
        color: HighlightColorSchema.optional(),
        highlighted_text: z.string().trim().min(1).max(2_000).optional(),
        anchor_start: z.number().int().min(0).optional(),
        anchor_end: z.number().int().min(1).optional(),
    })
    .superRefine((data, context) => {
        const rangeFields = [data.highlighted_text, data.anchor_start, data.anchor_end];
        const rangeFieldCount = rangeFields.filter((value) => value !== undefined).length;

        if (rangeFieldCount !== 0 && rangeFieldCount !== rangeFields.length) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Highlight text and anchor offsets must be updated together.",
            });
        }

        if (
            data.anchor_start !== undefined
            && data.anchor_end !== undefined
            && data.anchor_end <= data.anchor_start
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Anchor end must be greater than anchor start.",
            });
        }

        if (
            data.note_body === undefined
            && data.color === undefined
            && rangeFieldCount === 0
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: "At least one updatable field is required.",
            });
        }
    });

function highlightConflictResponse(overlap: HighlightOverlap, requestId: string) {
    return apiError(
        "CONFLICT",
        "This selection overlaps another highlight.",
        409,
        requestId,
        {
            existing_highlight_id: overlap.highlight.id,
            relationship: overlap.relationship,
        }
    );
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
        const { id } = await params;
        if (!HighlightIdSchema.safeParse(id).success) {
            return apiError("VALIDATION_ERROR", "Invalid highlight ID.", 400, requestId);
        }

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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
        const { id } = await params;
        if (!HighlightIdSchema.safeParse(id).success) {
            return apiError("VALIDATION_ERROR", "Invalid highlight ID.", 400, requestId);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON payload.", 400, requestId);
        }

        const parsed = UpdateHighlightSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "No valid update fields provided.", 400, requestId);
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return apiError("UNAUTHORIZED", "Must be logged in to update a highlight.", 401, requestId);
        }

        const { highlighted_text, anchor_start, anchor_end } = parsed.data;
        const isRangeUpdate = (
            highlighted_text !== undefined
            && anchor_start !== undefined
            && anchor_end !== undefined
        );
        let currentHighlight: Database["public"]["Tables"]["user_highlights"]["Row"] | null = null;

        if (isRangeUpdate) {
            const currentHighlightResult = await supabase
                .from("user_highlights")
                .select("*")
                .eq("id", id)
                .eq("user_id", user.id)
                .maybeSingle();
            currentHighlight = currentHighlightResult.data as Database["public"]["Tables"]["user_highlights"]["Row"] | null;

            if (currentHighlightResult.error) {
                logApiError({
                    requestId,
                    route: "PATCH /api/library/highlights/[id]",
                    message: "Error loading highlight for update",
                    error: currentHighlightResult.error,
                    userId: user.id,
                });
                return apiError("INTERNAL_ERROR", "Failed to update highlight.", 500, requestId);
            }

            if (!currentHighlight) {
                return apiError("NOT_FOUND", "Highlight not found.", 404, requestId);
            }
        }

        if (isRangeUpdate && currentHighlight?.segment_id) {
            const { overlap, error: overlapError } = await findHighlightOverlap({
                supabase,
                userId: user.id,
                contentItemId: currentHighlight.content_item_id,
                segmentId: currentHighlight.segment_id,
                anchorStart: anchor_start,
                anchorEnd: anchor_end,
                excludeHighlightId: id,
            });

            if (overlapError) {
                logApiError({
                    requestId,
                    route: "PATCH /api/library/highlights/[id]",
                    message: "Error checking replacement highlight overlap",
                    error: overlapError,
                    userId: user.id,
                });
                return apiError("INTERNAL_ERROR", "Failed to validate highlight selection.", 500, requestId);
            }

            if (overlap) {
                return highlightConflictResponse(overlap, requestId);
            }
        }

        const updates: HighlightUpdate = {};
        if (parsed.data.note_body !== undefined) updates.note_body = parsed.data.note_body;
        if (parsed.data.color !== undefined) updates.color = parsed.data.color;
        if (highlighted_text !== undefined) updates.highlighted_text = highlighted_text;
        if (anchor_start !== undefined) updates.anchor_start = anchor_start;
        if (anchor_end !== undefined) updates.anchor_end = anchor_end;

        const { error, data } = await supabase
            .from("user_highlights")
            // @ts-expect-error - types for user_highlights might be outdated
            .update(updates)
            .eq("id", id)
            .eq("user_id", user.id)
            .select()
            .single();

        if (error) {
            if (
                isHighlightOverlapConstraintError(error)
                && isRangeUpdate
                && currentHighlight?.segment_id
            ) {
                const { overlap } = await findHighlightOverlap({
                    supabase,
                    userId: user.id,
                    contentItemId: currentHighlight.content_item_id,
                    segmentId: currentHighlight.segment_id,
                    anchorStart: anchor_start,
                    anchorEnd: anchor_end,
                    excludeHighlightId: id,
                });

                if (overlap) {
                    return highlightConflictResponse(overlap, requestId);
                }
            }

            logApiError({ requestId, route: "PATCH /api/library/highlights/[id]", message: "Error updating highlight", error });
            return apiError("INTERNAL_ERROR", "Failed to update highlight.", 500, requestId);
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        logApiError({ requestId, route: "PATCH /api/library/highlights/[id]", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}
