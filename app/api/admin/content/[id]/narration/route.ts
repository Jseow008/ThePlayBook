import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { generateNarrationAudio, isNarrationError } from "@/lib/server/ai-narration";
import {
    apiError,
    getRequestId,
    isSupabaseNotFoundError,
    logApiError,
} from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 300;

const ContentIdSchema = z.string().uuid();
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

interface RouteParams {
    params: Promise<{ id: string }>;
}

function buildNarrationErrorResponse(error: unknown, requestId: string) {
    if (isNarrationError(error)) {
        const errorCode = error.status >= 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR";
        return apiError(errorCode, error.userMessage, error.status, requestId);
    }

    return apiError("INTERNAL_ERROR", "Failed to generate AI narration", 500, requestId);
}

async function cleanupUploadedNarration(
    audioBucket: ReturnType<ReturnType<typeof getAdminClient>["storage"]["from"]>,
    storagePath: string,
    requestId: string
) {
    try {
        const { error } = await audioBucket.remove([storagePath]);
        if (error) {
            logApiError({
                requestId,
                route: "/api/admin/content/[id]/narration",
                message: "Failed to remove orphaned narration upload",
                error,
            });
        }
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/[id]/narration",
            message: "Unexpected failure while removing orphaned narration upload",
            error,
        });
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const { id } = await params;

    if (!ContentIdSchema.safeParse(id).success) {
        return apiError("VALIDATION_ERROR", "Invalid content ID", 400, requestId);
    }

    const rl = await rateLimit(request, { limit: 3, windowMs: 60_000 });
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
        const supabase = getAdminClient();
        const { data: contentItem, error: contentError } = await supabase
            .from("content_item")
            .select(`
                id,
                title,
                author,
                status,
                quick_mode_json,
                segments:segment(order_index, title, markdown_body, deleted_at)
            `)
            .eq("id", id)
            .is("deleted_at", null)
            .order("order_index", { referencedTable: "segment" })
            .single();

        if (contentError) {
            if (isSupabaseNotFoundError(contentError)) {
                return apiError("NOT_FOUND", "Content not found", 404, requestId);
            }

            throw contentError;
        }

        if (contentItem.status !== "verified") {
            return apiError("VALIDATION_ERROR", "Narration can only be generated for verified content.", 400, requestId);
        }

        const segments = ((contentItem.segments ?? []) as Array<{
            order_index: number;
            title: string | null;
            markdown_body: string;
            deleted_at?: string | null;
        }>).filter((segment) => !segment.deleted_at);

        const { audioBuffer, chunkCount, extension, contentType } = await generateNarrationAudio({
            title: contentItem.title,
            author: contentItem.author,
            quick_mode_json: contentItem.quick_mode_json as {
                hook?: string | null;
                big_idea?: string | null;
                key_takeaways?: string[] | null;
            } | null,
            segments,
        });

        if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
            return apiError("VALIDATION_ERROR", "Generated narration is too large to store.", 400, requestId);
        }

        const storagePath = `generated/${id}/ai-narration.${extension}`;
        const uploadBlob = new Blob([audioBuffer], { type: contentType });
        const audioBucket = supabase.storage.from("audio");

        const { error: uploadError } = await audioBucket.upload(storagePath, uploadBlob, {
            contentType,
            upsert: true,
        });

        if (uploadError) {
            throw uploadError;
        }

        const {
            data: { publicUrl },
        } = audioBucket.getPublicUrl(storagePath);

        const { error: updateError } = await supabase
            .from("content_item")
            .update({ audio_url: publicUrl })
            .eq("id", id);

        if (updateError) {
            await cleanupUploadedNarration(audioBucket, storagePath, requestId);
            throw updateError;
        }

        revalidatePath("/");
        revalidatePath("/browse");
        revalidatePath("/search");
        revalidatePath(`/preview/${id}`);
        revalidatePath(`/read/${id}`);
        revalidatePath(`/admin/content/${id}/edit`);

        return NextResponse.json({
            success: true,
            data: {
                url: publicUrl,
                storage_path: storagePath,
                chunk_count: chunkCount,
                message: "AI narration generated successfully.",
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/[id]/narration",
            message: "Error generating AI narration",
            error,
        });
        return buildNarrationErrorResponse(error, requestId);
    }
}
