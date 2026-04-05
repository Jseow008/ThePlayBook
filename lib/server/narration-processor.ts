import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import { isNarrationError, generateNarrationAudio } from "@/lib/server/ai-narration";
import { logApiError } from "@/lib/server/api";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

function getPersistedNarrationError(error: unknown) {
    if (isNarrationError(error)) {
        return error.userMessage;
    }

    return "AI narration could not be completed right now. Please try again.";
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
                route: "/api/admin/narration/process",
                message: "Failed to remove orphaned narration upload",
                error,
            });
        }
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/narration/process",
            message: "Unexpected failure while removing orphaned narration upload",
            error,
        });
    }
}

async function claimNextNarrationJob() {
    const supabase = getAdminClient();
    const { data: queuedItems, error: queueError } = await supabase
        .from("content_item")
        .select("id")
        .eq("status", "verified")
        .eq("narration_status", "queued")
        .is("deleted_at", null)
        .order("narration_requested_at", { ascending: true })
        .limit(5);

    if (queueError) {
        throw queueError;
    }

    for (const item of queuedItems ?? []) {
        const startedAt = new Date().toISOString();
        const { data: claimedRow, error: claimError } = await supabase
            .from("content_item")
            .update({
                narration_status: "processing",
                narration_started_at: startedAt,
                narration_error: null,
            })
            .eq("id", item.id)
            .eq("narration_status", "queued")
            .select("id")
            .maybeSingle();

        if (claimError) {
            throw claimError;
        }

        if (!claimedRow) {
            continue;
        }
        return claimedRow;
    }

    return null;
}

async function markNarrationFailed(contentId: string, error: unknown) {
    const supabase = getAdminClient();
    await supabase
        .from("content_item")
        .update({
            narration_status: "failed",
            narration_error: getPersistedNarrationError(error),
            narration_completed_at: new Date().toISOString(),
        })
        .eq("id", contentId);
}

export function buildProcessErrorResponseMessage(error: unknown) {
    if (isNarrationError(error)) {
        return {
            message: error.userMessage,
            status: error.status,
        };
    }

    return {
        message: "Failed to process AI narration",
        status: 500,
    };
}

export async function processNextNarrationJob(requestId: string) {
    const supabase = getAdminClient();
    const claimedJob = await claimNextNarrationJob();

    if (!claimedJob) {
        return { processed: false as const };
    }
    const contentId = claimedJob.id;

    try {
        const { data: contentItem, error: fetchError } = await supabase
            .from("content_item")
            .select(`
                id,
                title,
                author,
                quick_mode_json,
                segments:segment(order_index, title, markdown_body, deleted_at)
            `)
            .eq("id", contentId)
            .is("deleted_at", null)
            .order("order_index", { referencedTable: "segment" })
            .single();

        if (fetchError || !contentItem) {
            throw fetchError ?? new Error("Content not found");
        }

        const segments = ((contentItem.segments ?? []) as Array<{
            order_index: number;
            title: string | null;
            markdown_body: string;
            deleted_at?: string | null;
        }>).filter((segment) => !segment.deleted_at);

        const { audioBuffer, extension, contentType } = await generateNarrationAudio({
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
            throw new Error("Generated narration is too large to store.");
        }

        const storagePath = `generated/${contentId}/ai-narration.${extension}`;
        const audioBucket = supabase.storage.from("audio");
        const uploadBlob = new Blob([audioBuffer], { type: contentType });

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
            .update({
                audio_url: publicUrl,
                narration_status: "ready",
                narration_error: null,
                narration_completed_at: new Date().toISOString(),
            })
            .eq("id", contentId);

        if (updateError) {
            await cleanupUploadedNarration(audioBucket, storagePath, requestId);
            throw updateError;
        }

        revalidatePath("/");
        revalidatePath("/browse");
        revalidatePath("/search");
        revalidatePath(`/preview/${contentId}`);
        revalidatePath(`/read/${contentId}`);
        revalidatePath(`/admin/content/${contentId}/edit`);
        revalidatePath("/admin");

        return {
            processed: true as const,
            contentId,
            publicUrl,
        };
    } catch (error) {
        await markNarrationFailed(contentId, error);
        throw error;
    }
}
