/**
 * Admin Content Detail API Route
 * GET /api/admin/content/[id] - Get single content with segments
 * PUT /api/admin/content/[id] - Update content and segments
 * DELETE /api/admin/content/[id] - Soft delete content
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

// Zod schema for updating content
const UpdateContentSchema = z.object({
    title: z.string().min(1).optional(),
    author: z.string().optional().nullable(),
    type: z.enum(["podcast", "book", "article", "video"]).optional(),
    category: z.string().optional().nullable(),
    source_url: z.string().url().optional().nullable().or(z.literal("")),
    cover_image_url: z.string().url().optional().nullable().or(z.literal("")),
    hero_image_url: z.string().url().optional().nullable().or(z.literal("")),
    audio_url: z.string().url().optional().nullable().or(z.literal("")),
    duration_seconds: z.number().int().positive().optional().nullable(),
    status: z.enum(["draft", "verified"]).optional(),
    is_featured: z.boolean().optional(),
    quick_mode_json: z.object({
        hook: z.string(),
        big_idea: z.string(),
        key_takeaways: z.array(z.string()),
    }).optional().nullable(),
    segments: z.array(z.object({
        id: z.string().uuid().optional(), // Existing segment ID for update
        order_index: z.number().int(),
        title: z.string().optional().nullable(),
        markdown_body: z.string(),
        start_time_sec: z.number().int().optional().nullable(),
        end_time_sec: z.number().int().optional().nullable(),
    })).optional(),
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
    })).optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

const ContentIdSchema = z.string().uuid();

export async function GET(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const { id } = await params;
    if (!ContentIdSchema.safeParse(id).success) {
        return apiError("VALIDATION_ERROR", "Invalid content ID", 400, requestId);
    }

    // Rate limit: 20 requests per 60 seconds per IP
    const rl = rateLimit(request, { limit: 20, windowMs: 60_000 });
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
        const supabase = getAdminClient();

        // Fetch content item with segments and artifacts
        const { data: contentItem, error: contentError } = await supabase
            .from("content_item")
            .select(`
                *,
                segments:segment(id, order_index, title, markdown_body, start_time_sec, end_time_sec),
                artifacts:artifact(id, type, payload_schema)
            `)
            .eq("id", id)
            .order("order_index", { referencedTable: "segment" })
            .single();

        if (contentError) {
            if (contentError.code === "PGRST116") {
                return apiError("NOT_FOUND", "Content not found", 404, requestId);
            }
            throw contentError;
        }

        return NextResponse.json({
            success: true,
            data: contentItem,
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/[id]",
            message: "Error fetching content",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch content", 500, requestId);
    }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const { id } = await params;
    if (!ContentIdSchema.safeParse(id).success) {
        return apiError("VALIDATION_ERROR", "Invalid content ID", 400, requestId);
    }

    // Rate limit: 10 requests per 60 seconds per IP
    const rl = rateLimit(request, { limit: 10, windowMs: 60_000 });
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
                route: "/api/admin/content/[id]",
                message: "Invalid JSON body for content update",
                error,
            });
            return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
        }
        const parsed = UpdateContentSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid request", 400, requestId);
        }

        const { segments, artifacts, ...contentData } = parsed.data;
        const supabase = getAdminClient();

        const contentPatch: Record<string, unknown> = {};
        if (contentData.title !== undefined) contentPatch.title = contentData.title;
        if (contentData.author !== undefined) contentPatch.author = contentData.author;
        if (contentData.type !== undefined) contentPatch.type = contentData.type;
        if (contentData.category !== undefined) contentPatch.category = contentData.category;
        if (contentData.source_url !== undefined) contentPatch.source_url = contentData.source_url;
        if (contentData.cover_image_url !== undefined) contentPatch.cover_image_url = contentData.cover_image_url;
        if (contentData.hero_image_url !== undefined) contentPatch.hero_image_url = contentData.hero_image_url;
        if (contentData.audio_url !== undefined) contentPatch.audio_url = contentData.audio_url;
        if (contentData.duration_seconds !== undefined) contentPatch.duration_seconds = contentData.duration_seconds;
        if (contentData.status !== undefined) contentPatch.status = contentData.status;
        if (contentData.is_featured !== undefined) contentPatch.is_featured = contentData.is_featured;
        if (contentData.quick_mode_json !== undefined) contentPatch.quick_mode_json = contentData.quick_mode_json;

        const artifactPayload = artifacts?.map((artifact) => ({
            type: artifact.type,
            payload_schema: artifact.payload_schema,
            version: "1.0.0",
        }));

        const { error: updateGraphError } = await (supabase.rpc as any)("admin_update_content_graph", {
            p_content_id: id,
            p_content_patch: contentPatch,
            p_segments: segments ?? null,
            p_artifacts: artifactPayload ?? null,
        });

        if (updateGraphError) {
            throw updateGraphError;
        }

        revalidatePath("/");
        revalidatePath("/search");
        revalidatePath("/categories");
        revalidatePath(`/preview/${id}`);
        revalidatePath(`/read/${id}`);

        return NextResponse.json({
            success: true,
            data: {
                id,
                message: "Content updated successfully",
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/[id]",
            message: "Error updating content",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to update content", 500, requestId);
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const { id } = await params;
    if (!ContentIdSchema.safeParse(id).success) {
        return apiError("VALIDATION_ERROR", "Invalid content ID", 400, requestId);
    }

    // Rate limit: 10 requests per 60 seconds per IP
    const rl = rateLimit(request, { limit: 10, windowMs: 60_000 });
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
        const supabase = getAdminClient();

        // Soft delete by setting deleted_at
        const { error } = await supabase
            .from("content_item")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id);

        if (error) {
            throw error;
        }

        revalidatePath("/");
        revalidatePath("/search");
        revalidatePath("/categories");
        revalidatePath(`/preview/${id}`);
        revalidatePath(`/read/${id}`);

        return NextResponse.json({
            success: true,
            message: "Content deleted successfully",
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/[id]",
            message: "Error deleting content",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to delete content", 500, requestId);
    }
}
