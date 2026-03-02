import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const FeaturedPayloadSchema = z.object({
    is_featured: z.boolean(),
});

const ContentIdSchema = z.string().uuid();

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const { id } = await params;

    if (!ContentIdSchema.safeParse(id).success) {
        return apiError("VALIDATION_ERROR", "Invalid content ID", 400, requestId);
    }

    const rl = await rateLimit(request, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
        }

        const parsed = FeaturedPayloadSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid request payload", 400, requestId);
        }

        const supabase = getAdminClient();

        const { data, error } = await supabase
            .from("content_item")
            .update({ is_featured: parsed.data.is_featured })
            .eq("id", id)
            .is("deleted_at", null)
            .select("is_featured")
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data) {
            return apiError("NOT_FOUND", "Content not found", 404, requestId);
        }

        revalidatePath("/");
        revalidatePath("/admin");
        revalidatePath(`/admin/content/${id}/edit`);

        return NextResponse.json({
            success: true,
            data,
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/[id]/featured",
            message: "Error updating featured status",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to update featured status", 500, requestId);
    }
}
