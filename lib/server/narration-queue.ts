import { getNarrationJobState, type NarrationJobRowLike } from "@/lib/narration-job";
import { getAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof getAdminClient>;

type QueueNarrationJobParams = {
    supabase: AdminClient;
    contentId: string;
    row: NarrationJobRowLike;
    allowReplaceExisting?: boolean;
};

type QueueNarrationJobResult = {
    queued: boolean;
    job: ReturnType<typeof getNarrationJobState>;
};

export async function queueNarrationJobIfEligible({
    supabase,
    contentId,
    row,
    allowReplaceExisting = false,
}: QueueNarrationJobParams): Promise<QueueNarrationJobResult> {
    const currentJob = getNarrationJobState(row);
    if (
        (currentJob.audio_url && !allowReplaceExisting)
        || currentJob.status === "queued"
        || currentJob.status === "processing"
    ) {
        return {
            queued: false,
            job: currentJob,
        };
    }

    const now = new Date().toISOString();
    const { data: queuedItem, error } = await supabase
        .from("content_item")
        .update({
            narration_status: "queued",
            narration_error: null,
            narration_requested_at: now,
            narration_started_at: null,
            narration_completed_at: null,
        })
        .eq("id", contentId)
        .is("deleted_at", null)
        .select("audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at")
        .single();

    if (error || !queuedItem) {
        throw error ?? new Error("Failed to queue narration job");
    }

    return {
        queued: true,
        job: getNarrationJobState(queuedItem),
    };
}
