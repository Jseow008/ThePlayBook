import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, isUniqueConstraintViolation, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const CreateSeriesSchema = z.object({
    title: z.string().trim().min(1, "Title is required").max(120),
    slug: z.string().trim().min(1, "Slug is required").max(120).regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
    description: z.string().trim().max(500).optional().nullable(),
});

function revalidateSeriesAdminSurfaces(slug?: string | null) {
    revalidatePath("/admin/series");
    revalidatePath("/admin/content/new");
    if (slug) {
        revalidatePath(`/series/${slug}`);
    }
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();
    const rl = await rateLimit(request, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    if (!(await verifyAdminSession())) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    try {
        const supabase = getAdminClient();
        const { data, error } = await supabase
            .from("content_series")
            .select("id, slug, title, description, created_at, updated_at")
            .order("title", { ascending: true });

        if (error) {
            throw error;
        }

        const rows = data ?? [];
        const seriesWithCounts = await Promise.all(
            rows.map(async (series) => {
                const { count, error: countError } = await supabase
                    .from("content_item")
                    .select("id", { count: "exact", head: true })
                    .eq("series_id", series.id)
                    .is("deleted_at", null);

                if (countError) {
                    throw countError;
                }

                return {
                    ...series,
                    content_count: count ?? 0,
                };
            })
        );

        return NextResponse.json(seriesWithCounts);
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/series",
            message: "Failed to fetch series",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch series", 500, requestId);
    }
}

export async function POST(request: NextRequest) {
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

    let body: unknown;
    try {
        body = await request.json();
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/series",
            message: "Invalid JSON body for series create",
            error,
        });
        return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
    }

    const parsed = CreateSeriesSchema.safeParse(body);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid request payload", 400, requestId, parsed.error.issues);
    }

    const supabase = getAdminClient();
    const payload = parsed.data;
    const { data, error } = await supabase
        .from("content_series")
        .insert({
            title: payload.title,
            slug: payload.slug,
            description: payload.description || null,
        })
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
            route: "/api/admin/series",
            message: "Failed to create series",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to create series", 500, requestId);
    }

    revalidateSeriesAdminSurfaces(data.slug);
    return NextResponse.json({ ...data, content_count: 0 }, { status: 201 });
}
