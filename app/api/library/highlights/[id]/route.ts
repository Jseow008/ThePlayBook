import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

interface RouteParams {
    params: Promise<{ id: string }>;
}

const HighlightIdSchema = z.string().uuid();
const HighlightColorSchema = z.enum(["yellow", "blue", "green", "pink", "purple", "red"]);
const UpdateHighlightSchema = z
    .object({
        note_body: z.string().trim().max(4_000).nullable().optional(),
        color: HighlightColorSchema.optional(),
    })
    .refine((data) => data.note_body !== undefined || data.color !== undefined, {
        message: "At least one updatable field is required.",
    });

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
    const rl = rateLimit(request, { limit: 30, windowMs: 60_000 });
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

        // Extract allowed fields
        const updates: Record<string, string | null> = {};
        if (parsed.data.note_body !== undefined) updates.note_body = parsed.data.note_body;
        if (parsed.data.color !== undefined) updates.color = parsed.data.color;

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return apiError("UNAUTHORIZED", "Must be logged in to update a highlight.", 401, requestId);
        }

        const { error, data } = await (supabase
            .from("user_highlights") as any)
            .update(updates)
            .eq("id", id)
            .eq("user_id", user.id)
            .select()
            .single();

        if (error) {
            logApiError({ requestId, route: "PATCH /api/library/highlights/[id]", message: "Error updating highlight", error });
            return apiError("INTERNAL_ERROR", "Failed to update highlight.", 500, requestId);
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        logApiError({ requestId, route: "PATCH /api/library/highlights/[id]", message: "Unexpected error", error });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}
