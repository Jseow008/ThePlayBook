import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/supabase/admin";
import type { GeneratedNarrationSegmentTiming } from "@/lib/server/narration-script";
import { logApiError } from "@/lib/server/api";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const GENERATED_AUDIO_PREFIX = "/storage/v1/object/public/audio/";
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

interface ClaimedNarrationJob {
    id: string;
    narration_started_at: string;
}

interface NarrationProcessingJobRow {
    id: string;
    title: string;
    author: string | null;
    narration_requested_at: string | null;
    narration_started_at: string | null;
}

function isPersistableNarrationError(error: unknown): error is {
    userMessage: string;
    status: number;
} {
    return (
        error instanceof Error
        && error.name === "NarrationError"
        && typeof (error as { userMessage?: unknown }).userMessage === "string"
        && typeof (error as { status?: unknown }).status === "number"
    );
}

function getPersistedNarrationError(error: unknown) {
    if (isPersistableNarrationError(error)) {
        return error.userMessage;
    }

    return "AI narration could not be completed right now. Please try again.";
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

function revalidateNarrationPaths(contentIds: string[]) {
    if (contentIds.length === 0) {
        return;
    }

    revalidatePath("/admin");
    revalidatePath("/admin/content");

    for (const contentId of contentIds) {
        revalidatePath(`/preview/${contentId}`);
        revalidatePath(`/read/${contentId}`);
        revalidatePath(`/admin/content/${contentId}/edit`);
    }
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

async function finalizeNarrationGeneration(params: {
    contentId: string;
    claimStartedAt: string;
    publicUrl: string;
    segmentTimings: GeneratedNarrationSegmentTiming[];
}) {
    const supabase = getAdminClient();
    const completedAt = new Date().toISOString();
    const { data, error } = await (supabase as any).rpc("admin_finalize_narration_generation", {
        p_content_id: params.contentId,
        p_expected_started_at: params.claimStartedAt,
        p_audio_url: params.publicUrl,
        p_completed_at: completedAt,
        p_segment_timings: params.segmentTimings
            .filter((segment) => Boolean(segment.id))
            .map((segment) => ({
                id: segment.id,
                start_time_sec: segment.start_time_sec,
                end_time_sec: segment.end_time_sec,
            })),
    });

    if (error) {
        throw error;
    }

    return Boolean(data);
}

function buildGeneratedNarrationStoragePath(contentId: string, startedAt: string, extension: string) {
    const version = startedAt.replace(/[^0-9A-Za-z]/g, "");
    return `generated/${contentId}/ai-narration-${version}.${extension}`;
}

function extractGeneratedNarrationStoragePath(publicUrl: string | null | undefined, contentId: string) {
    if (!publicUrl) {
        return null;
    }

    try {
        const url = new URL(publicUrl);
        const markerIndex = url.pathname.indexOf(GENERATED_AUDIO_PREFIX);
        if (markerIndex < 0) {
            return null;
        }

        const storagePath = decodeURIComponent(url.pathname.slice(markerIndex + GENERATED_AUDIO_PREFIX.length));
        if (!storagePath.startsWith(`generated/${contentId}/`)) {
            return null;
        }

        return storagePath;
    } catch {
        return null;
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
            .select("id, narration_started_at")
            .maybeSingle();

        if (claimError) {
            throw claimError;
        }

        if (!claimedRow) {
            continue;
        }
        return claimedRow as ClaimedNarrationJob;
    }

    return null;
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

async function markNarrationFailed(contentId: string, startedAt: string, error: unknown) {
    const supabase = getAdminClient();
    await supabase
        .from("content_item")
        .update({
            narration_status: "failed",
            narration_error: getPersistedNarrationError(error),
            narration_completed_at: new Date().toISOString(),
        })
        .eq("id", contentId)
        .eq("narration_status", "processing")
        .eq("narration_started_at", startedAt);
}

async function releaseNarrationClaim(
    contentId: string,
    startedAt: string,
    existingAudioUrl: string | null,
    completedAt: string | null
) {
    const supabase = getAdminClient();
    await supabase
        .from("content_item")
        .update({
            narration_status: existingAudioUrl ? "ready" : "idle",
            narration_error: null,
            narration_requested_at: null,
            narration_started_at: null,
            narration_completed_at: existingAudioUrl ? (completedAt ?? new Date().toISOString()) : null,
        })
        .eq("id", contentId)
        .eq("narration_status", "processing")
        .eq("narration_started_at", startedAt);
}

export function buildProcessErrorResponseMessage(error: unknown) {
    if (isPersistableNarrationError(error)) {
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

export async function processNarrationJobs(requestId: string, maxJobs: number = 1) {
    const results: Array<Awaited<ReturnType<typeof processNextNarrationJob>>> = [];
    let processedCount = 0;

    for (let attempt = 0; processedCount < maxJobs; attempt += 1) {
        const result = await processNextNarrationJob(`${requestId}:job-${attempt + 1}`);
        results.push(result);

        if (!result.processed && !("discarded" in result && result.discarded)) {
            break;
        }

        if (result.processed) {
            processedCount += 1;
        }
    }

    const processedResults = results.filter((result) => result.processed);
    const discardedResults = results.filter((result) => !result.processed && "discarded" in result && result.discarded);

    return {
        processed: processedResults.length > 0,
        processedCount: processedResults.length,
        discardedCount: discardedResults.length,
        results,
    };
}

export async function processNextNarrationJob(requestId: string) {
    const supabase = getAdminClient();
    const claimedJob = await claimNextNarrationJob();

    if (!claimedJob) {
        return { processed: false as const };
    }
    const contentId = claimedJob.id;
    const claimStartedAt = claimedJob.narration_started_at;

    try {
        const { data: contentItem, error: fetchError } = await supabase
            .from("content_item")
            .select(`
                id,
                status,
                title,
                author,
                audio_url,
                narration_completed_at,
                quick_mode_json,
                segments:segment(id, order_index, title, markdown_body, deleted_at)
            `)
            .eq("id", contentId)
            .is("deleted_at", null)
            .order("order_index", { referencedTable: "segment" })
            .single();

        if (fetchError) {
            throw fetchError;
        }

        if (!contentItem) {
            await releaseNarrationClaim(contentId, claimStartedAt, null, null);
            return { processed: false as const, contentId, discarded: true as const };
        }

        if (contentItem.status !== "verified") {
            await releaseNarrationClaim(
                contentId,
                claimStartedAt,
                contentItem.audio_url ?? null,
                contentItem.narration_completed_at ?? null
            );
            return { processed: false as const, contentId, discarded: true as const };
        }

        const segments = ((contentItem.segments ?? []) as Array<{
            id: string;
            order_index: number;
            title: string | null;
            markdown_body: string;
            deleted_at?: string | null;
        }>).filter((segment) => !segment.deleted_at);

        const { generateNarrationAudio } = await import("@/lib/server/ai-narration");
        const { audioBuffer, extension, contentType, segmentTimings } = await generateNarrationAudio({
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

        const storagePath = buildGeneratedNarrationStoragePath(contentId, claimStartedAt, extension);
        const previousGeneratedStoragePath = extractGeneratedNarrationStoragePath(contentItem.audio_url ?? null, contentId);
        const audioBucket = supabase.storage.from("audio");
        const uploadBlob = new Blob([new Uint8Array(audioBuffer)], { type: contentType });

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

        let finalized = false;
        try {
            finalized = await finalizeNarrationGeneration({
                contentId,
                claimStartedAt,
                publicUrl,
                segmentTimings,
            });
        } catch (error) {
            await cleanupUploadedNarration(audioBucket, storagePath, requestId);
            throw error;
        }

        if (!finalized) {
            await cleanupUploadedNarration(audioBucket, storagePath, requestId);
            return { processed: false as const, contentId, discarded: true as const };
        }

        if (previousGeneratedStoragePath && previousGeneratedStoragePath !== storagePath) {
            await cleanupUploadedNarration(audioBucket, previousGeneratedStoragePath, requestId);
        }

        revalidatePath("/");
        revalidatePath("/browse");
        revalidatePath("/search");
        revalidateNarrationPaths([contentId]);

        return {
            processed: true as const,
            contentId,
            publicUrl,
        };
    } catch (error) {
        await markNarrationFailed(contentId, claimStartedAt, error);
        throw error;
    }
}
