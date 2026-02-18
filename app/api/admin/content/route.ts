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
import { apiError, getRequestId, logApiError } from "@/lib/server/api";

// Zod schema for creating content
const CreateContentSchema = z.object({
    title: z.string().min(1, "Title is required"),
    author: z.string().optional().nullable(),
    type: z.enum(["podcast", "book", "article"]),
    category: z.string().optional().nullable(),
    source_url: z.string().optional().nullable().or(z.literal("")),
    cover_image_url: z.string().optional().nullable().or(z.literal("")),
    hero_image_url: z.string().optional().nullable().or(z.literal("")),
    audio_url: z.string().optional().nullable().or(z.literal("")),
    duration_seconds: z.number().int().optional().nullable(),
    status: z.enum(["draft", "verified"]).default("draft"),
    is_featured: z.boolean().default(false),
    quick_mode_json: z.object({
        hook: z.string(),
        big_idea: z.string(),
        key_takeaways: z.array(z.string()),
    }).optional().nullable(),
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
});

export async function GET() {
    const requestId = getRequestId();
    // Verify admin session
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        const supabase = getAdminClient();

        const { data, error } = await supabase
            .from("content_item")
            .select("id, title, type, author, category, status, is_featured, created_at, updated_at, deleted_at")
            .order("created_at", { ascending: false });


        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            data: data || [],
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
            return apiError("VALIDATION_ERROR", "Invalid request", 400, requestId);
        }

        const { segments, artifacts, ...contentData } = parsed.data;
        const supabase = getAdminClient();

        // Create content item
        const { data: contentItem, error: contentError } = await (supabase
            .from("content_item") as any)
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
            })
            .select("id")
            .single();

        if (contentError) {
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

            const { error: segmentError } = await (supabase
                .from("segment") as any)
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

            const { error: artifactError } = await (supabase
                .from("artifact") as any)
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
        revalidatePath("/categories");
        revalidatePath(`/preview/${contentItem.id}`);
        revalidatePath(`/read/${contentItem.id}`);

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
