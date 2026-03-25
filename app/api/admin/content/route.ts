/**
 * Admin Content API Route
 * GET /api/admin/content - List all content
 * POST /api/admin/content - Create new content
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { apiError, getRequestId, isUniqueConstraintViolation, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const AdminContentListQuerySchema = z.object({
    status: z.enum(["draft", "verified", "deleted"]).optional(),
    type: z.enum(["podcast", "book", "article", "video"]).optional(),
    featured: z.boolean().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

function validateSeriesAssignment(
    value: { series_id?: string | null; series_order?: number | null },
    ctx: z.RefinementCtx
) {
    const hasSeriesId = value.series_id !== undefined && value.series_id !== null;
    const hasSeriesOrder = value.series_order !== undefined && value.series_order !== null;

    if (hasSeriesId && !hasSeriesOrder) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series_order"],
            message: "Series order is required when a series is selected",
        });
    }

    if (!hasSeriesId && hasSeriesOrder) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["series_id"],
            message: "Series selection is required when a series order is set",
        });
    }
}

async function getSeriesSlugsByIds(
    supabase: ReturnType<typeof getAdminClient>,
    seriesIds: Array<string | null | undefined>
) {
    const uniqueSeriesIds = Array.from(new Set(seriesIds.filter((value): value is string => Boolean(value))));
    if (uniqueSeriesIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from("content_series")
        .select("slug")
        .in("id", uniqueSeriesIds);

    if (error || !data) {
        return [];
    }

    return Array.from(new Set(data.map((entry) => entry.slug).filter(Boolean)));
}

// Zod schema for creating content
const CreateContentSchema = z.object({
    title: z.string().min(1, "Title is required"),
    author: z.string().optional().nullable(),
    type: z.enum(["podcast", "book", "article", "video"]),
    category: z.string().optional().nullable(),
    source_url: z.string().url().optional().nullable().or(z.literal("")),
    cover_image_url: z.string().url().optional().nullable().or(z.literal("")),
    hero_image_url: z.string().url().optional().nullable().or(z.literal("")),
    audio_url: z.string().url().optional().nullable().or(z.literal("")),
    duration_seconds: z.number().int().positive().optional().nullable(),
    status: z.enum(["draft", "verified"]).default("draft"),
    is_featured: z.boolean().default(false),
    quick_mode_json: z.object({
        hook: z.string(),
        big_idea: z.string(),
        key_takeaways: z.array(z.string()),
    }).optional().nullable(),
    series_id: z.string().uuid().optional().nullable(),
    series_order: z.number().int().positive().optional().nullable(),
    segments: z.array(z.object({
        order_index: z.number().int(),
        title: z.string().optional().nullable(),
        markdown_body: z.string(),
        start_time_sec: z.number().int().optional().nullable(),
        end_time_sec: z.number().int().optional().nullable(),
    })).optional().nullable(),
    artifacts: z.array(z.object({
        id: z.string().uuid().optional(),
        type: z.literal("checklist"),
        payload_schema: z.object({
            title: z.string(),
            items: z.array(z.object({
                id: z.string(),
                label: z.string(),
                mandatory: z.boolean(),
            })),
        }),
    })).optional().nullable(),
}).superRefine(validateSeriesAssignment);

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 20 requests per 60 seconds per IP
    const rl = await rateLimit(request, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    // Verify admin session
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        const { searchParams } = new URL(request.url);
        const rawFeatured = searchParams.get("featured");

        if (rawFeatured !== null && rawFeatured !== "true" && rawFeatured !== "false") {
            return apiError("VALIDATION_ERROR", "Invalid featured query. Use true or false.", 400, requestId);
        }

        const parsedQuery = AdminContentListQuerySchema.safeParse({
            status: searchParams.get("status") ?? undefined,
            type: searchParams.get("type") ?? undefined,
            featured: rawFeatured === null ? undefined : rawFeatured === "true",
            limit: searchParams.get("limit") ?? undefined,
            offset: searchParams.get("offset") ?? undefined,
        });

        if (!parsedQuery.success) {
            return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, requestId);
        }

        const { status, type, featured, limit, offset } = parsedQuery.data;
        const supabase = getAdminClient();

        let query = supabase
            .from("content_item")
            .select("id, title, type, author, category, status, is_featured, created_at, updated_at, deleted_at", { count: "exact" });

        if (status === "deleted") {
            query = query.not("deleted_at", "is", null);
        } else {
            query = query.is("deleted_at", null);
            if (status) {
                query = query.eq("status", status);
            }
        }

        if (type) {
            query = query.eq("type", type);
        }

        if (featured !== undefined) {
            query = query.eq("is_featured", featured);
        }

        const { data, error, count } = await query
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);


        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            data: data || [],
            pagination: {
                total: count ?? 0,
                limit,
                offset,
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content",
            message: "Error fetching content",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch content", 500, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 10 requests per 60 seconds per IP
    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    // Verify admin session
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch (error) {
            logApiError({
                requestId,
                route: "/api/admin/content",
                message: "Invalid JSON body for content create",
                error,
            });
            return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
        }

        const parsed = CreateContentSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid request", 400, requestId, parsed.error.issues);
        }

        const { segments, artifacts, ...contentData } = parsed.data;
        const supabase = getAdminClient();

        // Create content item
        const { data: contentItem, error: contentError } = await supabase
            .from("content_item")
            .insert({
                title: contentData.title,
                author: contentData.author || null,
                type: contentData.type,
                category: contentData.category || null,
                source_url: contentData.source_url || null,
                cover_image_url: contentData.cover_image_url || null,
                hero_image_url: contentData.hero_image_url || null,
                audio_url: contentData.audio_url || null,
                duration_seconds: contentData.duration_seconds || null,
                status: contentData.status,
                is_featured: contentData.is_featured,
                quick_mode_json: contentData.quick_mode_json || null,
                series_id: contentData.series_id || null,
                series_order: contentData.series_id ? contentData.series_order ?? null : null,
            })
            .select("id, series_id")
            .single();

        if (contentError) {
            if (isUniqueConstraintViolation(contentError, "idx_content_item_series_order_unique")) {
                return apiError(
                    "VALIDATION_ERROR",
                    "This series order is already used in the selected series",
                    400,
                    requestId,
                    [{ path: ["series_order"], message: "This series order is already used in the selected series" }]
                );
            }

            throw contentError;
        }

        // Create segments if provided
        if (segments && segments.length > 0) {
            const segmentsToInsert = segments.map((segment) => ({
                item_id: contentItem.id,
                order_index: segment.order_index,
                title: segment.title || null,
                markdown_body: segment.markdown_body,
                start_time_sec: segment.start_time_sec || null,
                end_time_sec: segment.end_time_sec || null,
            }));

            const { error: segmentError } = await supabase
                .from("segment")
                .insert(segmentsToInsert);

            if (segmentError) {
                // Rollback content item if segments failed
                await supabase.from("content_item").delete().eq("id", contentItem.id);
                throw segmentError;
            }
        }

        // Create artifacts if provided
        if (artifacts && artifacts.length > 0) {
            const artifactsToInsert = artifacts.map((artifact: { type: string; payload_schema: object }) => ({
                item_id: contentItem.id,
                type: artifact.type,
                payload_schema: artifact.payload_schema,
                version: "1.0.0",
            }));

            const { error: artifactError } = await supabase
                .from("artifact")
                .insert(artifactsToInsert);

            if (artifactError) {
                // Rollback everything
                await supabase.from("segment").delete().eq("item_id", contentItem.id);
                await supabase.from("content_item").delete().eq("id", contentItem.id);
                throw artifactError;
            }
        }

        revalidatePath("/");
        revalidatePath("/search");
        revalidatePath(`/preview/${contentItem.id}`);
        revalidatePath(`/read/${contentItem.id}`);
        const seriesSlugs = await getSeriesSlugsByIds(supabase, [contentItem.series_id]);
        seriesSlugs.forEach((slug) => revalidatePath(`/series/${slug}`));

        return NextResponse.json({
            success: true,
            data: {
                id: contentItem.id,
                message: "Content created successfully",
            },
        }, { status: 201 });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content",
            message: "Error creating content",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to create content", 500, requestId);
    }
}
