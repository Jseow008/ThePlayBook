import { logApiError } from "@/lib/server/api";
import {
    buildStoryImageRenderVersion,
    buildStoryImageStoragePath,
    renderStoryImageJpeg,
} from "@/lib/server/story-image-renderer";
import {
    loadVerifiedStoryImageContent,
    markStoryImageVersionCompleted,
    type StoryImageJob,
    type StoryImageJobStatus,
} from "@/lib/server/story-image-queue";
import {
    cleanupOldStoryImageVersions,
    getStoryImagePublicUrl,
    storedStoryImageExists,
    storeStoryImage,
} from "@/lib/server/story-image-storage";
import { getAdminClient } from "@/lib/supabase/admin";

export const STORY_IMAGE_PROCESS_BATCH_SIZE = 1;
export const STALE_STORY_IMAGE_PROCESSING_MAX_AGE_MS = 10 * 60 * 1000;
const STORY_IMAGE_MAX_ATTEMPTS = 3;
const STORY_IMAGE_JOB_SELECT = "id, content_id, render_version, status, attempts, max_attempts, storage_path, error, requested_at, next_attempt_at, started_at, completed_at, updated_at";

interface ClaimCandidate {
    id: number;
    status: StoryImageJobStatus;
    attempts: number;
}

function persistedStoryImageError(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
        return error.message.slice(0, 1_000);
    }
    return "Story image generation failed unexpectedly.";
}

function retryAt(attempts: number) {
    const delayMinutes = Math.min(2 ** Math.max(attempts - 1, 0), 30);
    return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

async function claimNextStoryImageJob() {
    const supabase = getAdminClient();
    const now = new Date().toISOString();
    const { data: candidates, error } = await supabase
        .from("story_image_job")
        .select("id, status, attempts")
        .in("status", ["pending", "failed"])
        .lt("attempts", STORY_IMAGE_MAX_ATTEMPTS)
        .lte("next_attempt_at", now)
        .order("next_attempt_at", { ascending: true })
        .order("requested_at", { ascending: true })
        .limit(5);

    if (error) {
        throw error;
    }

    for (const candidate of (candidates ?? []) as ClaimCandidate[]) {
        const startedAt = new Date().toISOString();
        const { data, error: claimError } = await supabase
            .from("story_image_job")
            .update({
                status: "processing",
                attempts: candidate.attempts + 1,
                started_at: startedAt,
                completed_at: null,
                error: null,
                updated_at: startedAt,
            })
            .eq("id", candidate.id)
            .eq("status", candidate.status)
            .eq("attempts", candidate.attempts)
            .select(STORY_IMAGE_JOB_SELECT)
            .maybeSingle();

        if (claimError) {
            throw claimError;
        }

        if (data) {
            return data as StoryImageJob;
        }
    }

    return null;
}

async function markStoryImageJobSuperseded(job: StoryImageJob) {
    const now = new Date().toISOString();
    const supabase = getAdminClient();
    const { error } = await supabase
        .from("story_image_job")
        .update({
            status: "superseded",
            completed_at: now,
            updated_at: now,
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .eq("started_at", job.started_at!);

    if (error) {
        throw error;
    }
}

async function markStoryImageJobFailed(job: StoryImageJob, error: unknown) {
    const now = new Date().toISOString();
    const supabase = getAdminClient();
    const { error: updateError } = await supabase
        .from("story_image_job")
        .update({
            status: "failed",
            error: persistedStoryImageError(error),
            next_attempt_at: retryAt(job.attempts),
            completed_at: job.attempts >= job.max_attempts ? now : null,
            updated_at: now,
        })
        .eq("id", job.id)
        .eq("status", "processing")
        .eq("started_at", job.started_at!);

    if (updateError) {
        throw updateError;
    }
}

export async function expireStaleStoryImageJobs() {
    const supabase = getAdminClient();
    const cutoff = new Date(Date.now() - STALE_STORY_IMAGE_PROCESSING_MAX_AGE_MS).toISOString();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("story_image_job")
        .update({
            status: "failed",
            error: "Story image generation was reset after remaining in processing beyond the safety window.",
            next_attempt_at: now,
            started_at: null,
            updated_at: now,
        })
        .eq("status", "processing")
        .lt("started_at", cutoff)
        .select("id");

    if (error) {
        throw error;
    }

    return { expiredCount: data?.length ?? 0 };
}

export async function getStoryImageQueueSummary() {
    const supabase = getAdminClient();
    const [pending, processing, failed] = await Promise.all([
        supabase.from("story_image_job").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("story_image_job").select("id", { count: "exact", head: true }).eq("status", "processing"),
        supabase.from("story_image_job").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);

    for (const result of [pending, processing, failed]) {
        if (result.error) throw result.error;
    }

    return {
        pendingCount: pending.count ?? 0,
        processingCount: processing.count ?? 0,
        failedCount: failed.count ?? 0,
    };
}

export async function processNextStoryImageJob(requestId: string) {
    const supabase = getAdminClient();
    const job = await claimNextStoryImageJob();
    if (!job) {
        return { processed: false as const };
    }

    try {
        const content = await loadVerifiedStoryImageContent(supabase, job.content_id);
        if (!content || buildStoryImageRenderVersion(content) !== job.render_version) {
            await markStoryImageJobSuperseded(job);
            return {
                processed: false as const,
                discarded: true as const,
                jobId: job.id,
                contentId: job.content_id,
            };
        }

        const storagePath = buildStoryImageStoragePath(job.content_id, job.render_version);
        const publicUrl = getStoryImagePublicUrl(storagePath, supabase);
        if (!await storedStoryImageExists(publicUrl)) {
            const jpegBuffer = await renderStoryImageJpeg(content);
            await storeStoryImage({ supabase, storagePath, jpegBuffer });
        }

        await markStoryImageVersionCompleted({
            supabase,
            contentId: job.content_id,
            renderVersion: job.render_version,
            storagePath,
        });

        try {
            await cleanupOldStoryImageVersions({
                supabase,
                contentId: job.content_id,
                currentStoragePath: storagePath,
                retainCount: 2,
            });
        } catch (cleanupError) {
            logApiError({
                requestId,
                route: "/api/admin/story-images/process",
                message: "Story image completed, but old versions could not be cleaned up",
                error: cleanupError,
            });
        }

        return {
            processed: true as const,
            succeeded: true as const,
            jobId: job.id,
            contentId: job.content_id,
            storagePath,
        };
    } catch (error) {
        await markStoryImageJobFailed(job, error);
        logApiError({
            requestId,
            route: "/api/admin/story-images/process",
            message: "Story image generation attempt failed",
            error,
        });
        return {
            processed: true as const,
            succeeded: false as const,
            jobId: job.id,
            contentId: job.content_id,
            error: persistedStoryImageError(error),
        };
    }
}

export async function processStoryImageJobs(requestId: string, maxJobs = STORY_IMAGE_PROCESS_BATCH_SIZE) {
    const results: Array<Awaited<ReturnType<typeof processNextStoryImageJob>>> = [];

    for (let index = 0; index < maxJobs; index += 1) {
        const result = await processNextStoryImageJob(`${requestId}:job-${index + 1}`);
        results.push(result);
        if (!result.processed && !("discarded" in result && result.discarded)) break;
    }

    return {
        processed: results.some((result) => result.processed),
        processedCount: results.filter((result) => result.processed).length,
        results,
    };
}
