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

async function loadNarrationRow(supabase: AdminClient, contentId: string) {
    const { data, error } = await supabase
        .from("content_item")
        .select("audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at")
        .eq("id", contentId)
        .is("deleted_at", null)
        .maybeSingle();

    if (error || !data) {
        throw error ?? new Error("Failed to load narration job state");
    }

    return data;
}

export async function queueNarrationJobIfEligible({
    supabase,
    contentId,
    row: _row,
    allowReplaceExisting = false,
}: QueueNarrationJobParams): Promise<QueueNarrationJobResult> {
    void _row;
    const currentRow = await loadNarrationRow(supabase, contentId);
    const currentJob = getNarrationJobState(currentRow);
    const persistedStatus = currentRow.narration_status ?? currentJob.status;

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
        .eq("narration_status", persistedStatus)
        .is("deleted_at", null)
        .select("audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at")
        .maybeSingle();

    if (error) {
        throw error ?? new Error("Failed to queue narration job");
    }

    if (!queuedItem) {
        const refreshedRow = await loadNarrationRow(supabase, contentId);
        return {
            queued: false,
            job: getNarrationJobState(refreshedRow),
        };
    }

    return {
        queued: true,
        job: getNarrationJobState(queuedItem),
    };
}
