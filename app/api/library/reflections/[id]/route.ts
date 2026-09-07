import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { afterResponse } from "@/lib/server/after-response";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import type { Database } from "@/types/database";

const REFLECTION_MAX_LENGTH = 1_000;
const ReflectionIdSchema = z.string().uuid();
const UpdateReflectionSchema = z.object({
    reflection_text: z.string().trim().min(1).max(REFLECTION_MAX_LENGTH),
});
type ReflectionRow = Database["public"]["Tables"]["user_reflections"]["Row"];
type ReflectionUpdate = Database["public"]["Tables"]["user_reflections"]["Update"];

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const rateLimitResult = await rateLimit(request, { limit: 12, windowMs: 60_000 });
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many reflection updates." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimitResult.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const { id } = await params;
        if (!ReflectionIdSchema.safeParse(id).success) {
            return apiError("VALIDATION_ERROR", "Invalid reflection.", 400, requestId);
        }

        const parsed = UpdateReflectionSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Write a reflection of up to 1,000 characters.", 400, requestId);
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return apiError("UNAUTHORIZED", "Sign in to update your reflection.", 401, requestId);
        }

        const updates: ReflectionUpdate = {
            reflection_text: parsed.data.reflection_text,
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
            .from("user_reflections")
            .update(updates as never)
            .eq("id", id)
            .eq("user_id", user.id)
            .select()
            .maybeSingle();

        if (error) {
            logApiError({ requestId, route: "PATCH /api/library/reflections/[id]", message: "Error updating reflection", error, userId: user.id });
            return apiError("INTERNAL_ERROR", "Failed to update reflection.", 500, requestId);
        }
        if (!data) {
            return apiError("NOT_FOUND", "Reflection not found.", 404, requestId);
        }

        const reflection = data as ReflectionRow;
        afterResponse(async () => {
            await captureServerAnalyticsEvent({
                event: "reflection_saved",
                distinctId: user.id,
                insertId: `reflection_saved:${user.id}:${reflection.id}:${reflection.updated_at}`,
                properties: {
                    content_id: reflection.content_item_id,
                    reflection_length: reflection.reflection_text.length,
                    route: "/notes",
                    user_state: "authenticated",
                },
            });
        });

        return NextResponse.json({ data: reflection });
    } catch (error) {
        logApiError({ requestId, route: "PATCH /api/library/reflections/[id]", message: "Unexpected error updating reflection", error });
        return apiError("INTERNAL_ERROR", "Failed to update reflection.", 500, requestId);
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const rateLimitResult = await rateLimit(request, { limit: 12, windowMs: 60_000 });
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many reflection deletions." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rateLimitResult.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const { id } = await params;
        if (!ReflectionIdSchema.safeParse(id).success) {
            return apiError("VALIDATION_ERROR", "Invalid reflection.", 400, requestId);
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return apiError("UNAUTHORIZED", "Sign in to delete your reflection.", 401, requestId);
        }

        const { error, count } = await supabase
            .from("user_reflections")
            .delete({ count: "exact" })
            .eq("id", id)
            .eq("user_id", user.id);

        if (error) {
            logApiError({ requestId, route: "DELETE /api/library/reflections/[id]", message: "Error deleting reflection", error, userId: user.id });
            return apiError("INTERNAL_ERROR", "Failed to delete reflection.", 500, requestId);
        }
        if (!count) {
            return apiError("NOT_FOUND", "Reflection not found.", 404, requestId);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logApiError({ requestId, route: "DELETE /api/library/reflections/[id]", message: "Unexpected error deleting reflection", error });
        return apiError("INTERNAL_ERROR", "Failed to delete reflection.", 500, requestId);
    }
}
