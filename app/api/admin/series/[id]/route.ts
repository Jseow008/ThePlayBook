import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, isUniqueConstraintViolation, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

interface RouteParams {
    params: Promise<{ id: string }>;
}

const UpdateSeriesSchema = z.object({
    title: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens").optional(),
    description: z.string().trim().max(500).nullable().optional(),
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field is required",
});

function revalidateSeriesAdminSurfaces(slug?: string | null) {
    revalidatePath("/admin/series");
    revalidatePath("/admin/content/new");
    if (slug) {
        revalidatePath(`/series/${slug}`);
    }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    if (!(await verifyAdminSession())) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    const { id } = await params;
    const supabase = getAdminClient();
    const { data: existing, error: existingError } = await supabase
        .from("content_series")
        .select("id, slug")
        .eq("id", id)
        .maybeSingle();

    if (existingError) {
        logApiError({
            requestId,
            route: "/api/admin/series/[id]",
            message: "Failed to resolve existing series",
            error: existingError,
        });
        return apiError("INTERNAL_ERROR", "Failed to update series", 500, requestId);
    }

    if (!existing) {
        return apiError("NOT_FOUND", "Series not found", 404, requestId);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/series/[id]",
            message: "Invalid JSON body for series update",
            error,
        });
        return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
    }

    const parsed = UpdateSeriesSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request payload", 400, requestId, parsed.error.issues);
    }

    const updatePatch: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updatePatch.title = parsed.data.title;
    if (parsed.data.slug !== undefined) updatePatch.slug = parsed.data.slug;
    if (parsed.data.description !== undefined) updatePatch.description = parsed.data.description || null;

    const { data, error } = await supabase
        .from("content_series")
        .update(updatePatch)
        .eq("id", id)
        .select("id, slug, title, description, created_at, updated_at")
        .single();

    if (error) {
        if (isUniqueConstraintViolation(error, "content_series_slug_key")) {
            return apiError(
                "VALIDATION_ERROR",
                "A series with this slug already exists",
                400,
                requestId,
                [{ path: ["slug"], message: "A series with this slug already exists" }]
            );
        }

        logApiError({
            requestId,
            route: "/api/admin/series/[id]",
            message: "Failed to update series",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to update series", 500, requestId);
    }

    revalidateSeriesAdminSurfaces(existing.slug);
    revalidateSeriesAdminSurfaces(data.slug);
    return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    if (!(await verifyAdminSession())) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    const { id } = await params;
    const supabase = getAdminClient();
    const { data: existing, error: existingError } = await supabase
        .from("content_series")
        .select("id, slug")
        .eq("id", id)
        .maybeSingle();

    if (existingError) {
        logApiError({
            requestId,
            route: "/api/admin/series/[id]",
            message: "Failed to resolve series before delete",
            error: existingError,
        });
        return apiError("INTERNAL_ERROR", "Failed to delete series", 500, requestId);
    }

    if (!existing) {
        return apiError("NOT_FOUND", "Series not found", 404, requestId);
    }

    const { count, error: countError } = await supabase
        .from("content_item")
        .select("id", { count: "exact", head: true })
        .eq("series_id", id)
        .is("deleted_at", null);

    if (countError) {
        logApiError({
            requestId,
            route: "/api/admin/series/[id]",
            message: "Failed to count series items before delete",
            error: countError,
        });
        return apiError("INTERNAL_ERROR", "Failed to delete series", 500, requestId);
    }

    if ((count ?? 0) > 0) {
        return apiError("VALIDATION_ERROR", "Remove or reassign content items before deleting this series", 400, requestId);
    }

    const { error } = await supabase
        .from("content_series")
        .delete()
        .eq("id", id);

    if (error) {
        logApiError({
            requestId,
            route: "/api/admin/series/[id]",
            message: "Failed to delete series",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to delete series", 500, requestId);
    }

    revalidateSeriesAdminSurfaces(existing.slug);
    return NextResponse.json({ success: true });
}
