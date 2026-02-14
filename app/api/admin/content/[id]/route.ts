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

// Zod schema for updating content
const UpdateContentSchema = z.object({
    title: z.string().min(1).optional(),
    author: z.string().optional().nullable(),
    type: z.enum(["podcast", "book", "article"]).optional(),
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

export async function GET(request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    // Verify admin session
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return NextResponse.json(
            { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
            { status: 401 }
        );
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
                return NextResponse.json(
                    { success: false, error: { code: "NOT_FOUND", message: "Content not found" } },
                    { status: 404 }
                );
            }
            throw contentError;
        }

        return NextResponse.json({
            success: true,
            data: contentItem,
        });
    } catch (error) {
        console.error("Error fetching content:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch content" } },
            { status: 500 }
        );
    }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    // Verify admin session
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return NextResponse.json(
            { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
            { status: 401 }
        );
    }

    try {
        const body = await request.json();
        const parsed = UpdateContentSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "Invalid request",
                        details: parsed.error.errors,
                    },
                },
                { status: 400 }
            );
        }

        const { segments, artifacts, ...contentData } = parsed.data;
        const supabase = getAdminClient();

        // Update content item
        const updateData: Record<string, unknown> = {};
        if (contentData.title !== undefined) updateData.title = contentData.title;
        if (contentData.author !== undefined) updateData.author = contentData.author || null;
        if (contentData.type !== undefined) updateData.type = contentData.type;
        if (contentData.category !== undefined) updateData.category = contentData.category || null;
        if (contentData.source_url !== undefined) updateData.source_url = contentData.source_url || null;
        if (contentData.cover_image_url !== undefined) updateData.cover_image_url = contentData.cover_image_url || null;
        if (contentData.hero_image_url !== undefined) updateData.hero_image_url = contentData.hero_image_url || null;
        if (contentData.audio_url !== undefined) updateData.audio_url = contentData.audio_url || null;
        if (contentData.duration_seconds !== undefined) updateData.duration_seconds = contentData.duration_seconds;
        if (contentData.status !== undefined) updateData.status = contentData.status;
        if (contentData.is_featured !== undefined) updateData.is_featured = contentData.is_featured;
        if (contentData.quick_mode_json !== undefined) updateData.quick_mode_json = contentData.quick_mode_json;

        if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await supabase
                .from("content_item")
                .update(updateData)
                .eq("id", id);

            if (updateError) {
                throw updateError;
            }
        }

        // Handle segments update
        if (segments !== undefined) {
            // Delete ALL existing segments for this item and re-insert to avoid unique constraint violations (order reordering)
            const { error: deleteError } = await supabase
                .from("segment")
                .delete()
                .eq("item_id", id);

            if (deleteError) throw deleteError;

            // Insert new/updated segments
            if (segments.length > 0) {
                // Separate segments into two groups: with ID and without ID
                // This is because Supabase/PostgREST bulk insert expects uniform objects.
                // Mixing objects with 'id' and objects without 'id' can cause issues.
                const segmentsWithId: Record<string, unknown>[] = [];
                const segmentsWithoutId: Record<string, unknown>[] = [];

                segments.forEach((segment) => {
                    const segmentData: Record<string, unknown> = {
                        item_id: id,
                        order_index: segment.order_index,
                        title: segment.title || null,
                        markdown_body: segment.markdown_body,
                        start_time_sec: segment.start_time_sec || null,
                        end_time_sec: segment.end_time_sec || null,
                        updated_at: new Date().toISOString(),
                    };

                    if (segment.id) {
                        segmentData.id = segment.id;
                        segmentsWithId.push(segmentData);
                    } else {
                        segmentsWithoutId.push(segmentData);
                    }
                });

                // 1. Insert segments with IDs (Explicitly keeping old IDs)
                if (segmentsWithId.length > 0) {
                    const { error: insertError1 } = await supabase
                        .from("segment")
                        .insert(segmentsWithId);
                    if (insertError1) throw insertError1;
                }

                // 2. Insert new segments (Letting DB generate IDs)
                if (segmentsWithoutId.length > 0) {
                    const { error: insertError2 } = await supabase
                        .from("segment")
                        .insert(segmentsWithoutId);
                    if (insertError2) throw insertError2;
                }
            }
        }

        // Handle artifacts update
        if (artifacts !== undefined) {
            // Delete existing artifacts
            await supabase.from("artifact").delete().eq("item_id", id);

            // Insert new artifacts
            if (artifacts.length > 0) {
                const artifactsToInsert = artifacts.map((artifact: { type: string; payload_schema: object }) => ({
                    item_id: id,
                    type: artifact.type,
                    payload_schema: artifact.payload_schema,
                    version: "1.0.0",
                }));

                const { error: artifactError } = await supabase
                    .from("artifact")
                    .insert(artifactsToInsert);

                if (artifactError) {
                    throw artifactError;
                }
            }
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
        console.error("Error updating content:", error);
        return NextResponse.json(
            {
                success: false,
                error: {
                    code: "INTERNAL_ERROR",
                    message: `Failed to update content: ${(error as Error).message}`
                }
            },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    // Verify admin session
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return NextResponse.json(
            { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
            { status: 401 }
        );
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
        console.error("Error deleting content:", error);
        return NextResponse.json(
            { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to delete content" } },
            { status: 500 }
        );
    }
}
