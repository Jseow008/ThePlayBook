import { getAdminClient } from "@/lib/supabase/admin";
import { revalidateNarrationContentChanged } from "@/lib/server/revalidation";

export const NARRATION_PROCESS_BATCH_SIZE = 3;
export const STALE_NARRATION_PROCESSING_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const STALE_NARRATION_PROCESSING_ERROR = "Narration generation was reset after it remained stuck in processing beyond the 2-hour safety window.";

export interface NarrationQueueSummary {
    queuedCount: number;
    processingCount: number;
}

export interface NarrationProcessingJob {
    id: string;
    title: string;
    author: string | null;
    requestedAt: string | null;
    startedAt: string | null;
    ageMs: number;
    isStale: boolean;
}

export interface NarrationQueueStatus extends NarrationQueueSummary {
    processingJobs: NarrationProcessingJob[];
    staleProcessingJobs: NarrationProcessingJob[];
}

interface NarrationProcessingJobRow {
    id: string;
    title: string;
    author: string | null;
    narration_requested_at: string | null;
    narration_started_at: string | null;
}

function toNarrationProcessingJob(row: NarrationProcessingJobRow, nowMs: number): NarrationProcessingJob {
    const startedAtMs = row.narration_started_at ? new Date(row.narration_started_at).getTime() : Number.NaN;
    const ageMs = Number.isNaN(startedAtMs) ? 0 : Math.max(nowMs - startedAtMs, 0);

    return {
        id: row.id,
        title: row.title,
        author: row.author,
        requestedAt: row.narration_requested_at,
        startedAt: row.narration_started_at,
        ageMs,
        isStale: !Number.isNaN(startedAtMs) && ageMs >= STALE_NARRATION_PROCESSING_MAX_AGE_MS,
    };
}

async function loadProcessingNarrationJobs(options?: {
    contentId?: string;
    staleOnly?: boolean;
}) {
    const supabase = getAdminClient();
    let query = supabase
        .from("content_item")
        .select("id, title, author, narration_requested_at, narration_started_at")
        .eq("status", "verified")
        .eq("narration_status", "processing")
        .is("deleted_at", null)
        .order("narration_started_at", { ascending: true });

    if (options?.contentId) {
        query = query.eq("id", options.contentId);
    }

    if (options?.staleOnly) {
        const cutoffIso = new Date(Date.now() - STALE_NARRATION_PROCESSING_MAX_AGE_MS).toISOString();
        query = query.lt("narration_started_at", cutoffIso);
    }

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    return (data ?? []) as NarrationProcessingJobRow[];
}

export function revalidateNarrationPaths(contentIds: string[]) {
    revalidateNarrationContentChanged(contentIds.map((id) => ({ id })));
}

export async function getNarrationQueueSummary(): Promise<NarrationQueueSummary> {
    const supabase = getAdminClient();
    const [queuedResult, processingResult] = await Promise.all([
        supabase
            .from("content_item")
            .select("id", { count: "exact", head: true })
            .eq("status", "verified")
            .eq("narration_status", "queued")
            .is("deleted_at", null),
        supabase
            .from("content_item")
            .select("id", { count: "exact", head: true })
            .eq("status", "verified")
            .eq("narration_status", "processing")
            .is("deleted_at", null),
    ]);

    if (queuedResult.error) {
        throw queuedResult.error;
    }

    if (processingResult.error) {
        throw processingResult.error;
    }

    return {
        queuedCount: queuedResult.count ?? 0,
        processingCount: processingResult.count ?? 0,
    };
}

export async function getNarrationQueueStatus(): Promise<NarrationQueueStatus> {
    const nowMs = Date.now();
    const [summary, processingRows] = await Promise.all([
        getNarrationQueueSummary(),
        loadProcessingNarrationJobs(),
    ]);
    const processingJobs = processingRows.map((row) => toNarrationProcessingJob(row, nowMs));

    return {
        ...summary,
        processingJobs,
        staleProcessingJobs: processingJobs.filter((job) => job.isStale),
    };
}

export async function expireStaleNarrationProcessingJobs(
    _requestId: string,
    options?: { contentId?: string }
) {
    const staleRows = await loadProcessingNarrationJobs({
        contentId: options?.contentId,
        staleOnly: true,
    });

    if (staleRows.length === 0) {
        return {
            expiredCount: 0,
            jobs: [] as NarrationProcessingJob[],
        };
    }

    const supabase = getAdminClient();
    const ids = staleRows.map((row) => row.id);
    const { error } = await supabase
        .from("content_item")
        .update({
            narration_status: "failed",
            narration_error: STALE_NARRATION_PROCESSING_ERROR,
            narration_completed_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("narration_status", "processing")
        .is("deleted_at", null);

    if (error) {
        throw error;
    }

    revalidateNarrationPaths(ids);

    return {
        expiredCount: staleRows.length,
        jobs: staleRows.map((row) => toNarrationProcessingJob(row, Date.now())),
    };
}

export async function resetStaleNarrationProcessingJobs(
    _requestId: string,
    jobIds: string[] | null | undefined
) {
    const staleRows = await loadProcessingNarrationJobs({ staleOnly: true });
    const requestedIds = (jobIds ?? []).filter(Boolean);
    const jobsToReset = requestedIds.length > 0
        ? staleRows.filter((row) => requestedIds.includes(row.id))
        : staleRows;

    if (jobsToReset.length === 0) {
        return {
            resetCount: 0,
            jobs: [] as NarrationProcessingJob[],
        };
    }

    const supabase = getAdminClient();
    const ids = jobsToReset.map((row) => row.id);
    const { error } = await supabase
        .from("content_item")
        .update({
            narration_status: "failed",
            narration_error: STALE_NARRATION_PROCESSING_ERROR,
            narration_completed_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("narration_status", "processing")
        .is("deleted_at", null);

    if (error) {
        throw error;
    }

    revalidateNarrationPaths(ids);

    return {
        resetCount: jobsToReset.length,
        jobs: jobsToReset.map((row) => toNarrationProcessingJob(row, Date.now())),
    };
}
