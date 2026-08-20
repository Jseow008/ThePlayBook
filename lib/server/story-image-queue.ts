import { isPostgresUniqueViolation } from "@/lib/server/api";
import {
    buildStoryImageRenderVersion,
    type StoryImageContent,
} from "@/lib/server/story-image-renderer";
import { getAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof getAdminClient>;

export type StoryImageJobStatus = "pending" | "processing" | "completed" | "failed" | "superseded";

export interface StoryImageJob {
    id: number;
    content_id: string;
    render_version: string;
    status: StoryImageJobStatus;
    attempts: number;
    max_attempts: number;
    storage_path: string | null;
    error: string | null;
    requested_at: string;
    next_attempt_at: string;
    started_at: string | null;
    completed_at: string | null;
    updated_at: string;
}

const STORY_IMAGE_CONTENT_SELECT = "id, title, author, category, cover_image_url, type, duration_seconds";
const STORY_IMAGE_JOB_SELECT = "id, content_id, render_version, status, attempts, max_attempts, storage_path, error, requested_at, next_attempt_at, started_at, completed_at, updated_at";

export async function loadVerifiedStoryImageContent(
    supabase: AdminClient,
    contentId: string
): Promise<StoryImageContent | null> {
    const { data, error } = await supabase
        .from("content_item")
        .select(STORY_IMAGE_CONTENT_SELECT)
        .eq("id", contentId)
        .eq("status", "verified")
        .is("deleted_at", null)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data as StoryImageContent | null;
}

async function loadStoryImageJob(
    supabase: AdminClient,
    contentId: string,
    renderVersion: string
) {
    const { data, error } = await supabase
        .from("story_image_job")
        .select(STORY_IMAGE_JOB_SELECT)
        .eq("content_id", contentId)
        .eq("render_version", renderVersion)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data as StoryImageJob | null;
}

export async function requestStoryImageGeneration(params: {
    supabase?: AdminClient;
    contentId: string;
}) {
    const supabase = params.supabase ?? getAdminClient();
    const content = await loadVerifiedStoryImageContent(supabase, params.contentId);

    if (!content) {
        return {
            queued: false,
            reason: "not_verified" as const,
            renderVersion: null,
            job: null,
        };
    }

    const renderVersion = buildStoryImageRenderVersion(content);
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("story_image_job")
        .insert({
            content_id: params.contentId,
            render_version: renderVersion,
            status: "pending",
            requested_at: now,
            next_attempt_at: now,
            updated_at: now,
        })
        .select(STORY_IMAGE_JOB_SELECT)
        .single();

    if (error) {
        if (!isPostgresUniqueViolation(error)) {
            throw error;
        }

        const existingJob = await loadStoryImageJob(supabase, params.contentId, renderVersion);
        return {
            queued: false,
            reason: "duplicate" as const,
            renderVersion,
            job: existingJob,
        };
    }

    const { error: supersedeError } = await supabase
        .from("story_image_job")
        .update({
            status: "superseded",
            updated_at: now,
        })
        .eq("content_id", params.contentId)
        .neq("render_version", renderVersion)
        .in("status", ["pending", "failed"]);

    if (supersedeError) {
        throw supersedeError;
    }

    return {
        queued: true,
        reason: "queued" as const,
        renderVersion,
        job: data as StoryImageJob,
    };
}

export async function findCompletedStoryImage(params: {
    supabase?: AdminClient;
    contentId: string;
    renderVersion: string;
}) {
    const supabase = params.supabase ?? getAdminClient();
    const { data, error } = await supabase
        .from("story_image_job")
        .select(STORY_IMAGE_JOB_SELECT)
        .eq("content_id", params.contentId)
        .eq("render_version", params.renderVersion)
        .eq("status", "completed")
        .not("storage_path", "is", null)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data as StoryImageJob | null;
}

export async function markStoryImageVersionCompleted(params: {
    supabase?: AdminClient;
    contentId: string;
    renderVersion: string;
    storagePath: string;
}) {
    const supabase = params.supabase ?? getAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("story_image_job")
        .upsert({
            content_id: params.contentId,
            render_version: params.renderVersion,
            status: "completed",
            storage_path: params.storagePath,
            error: null,
            completed_at: now,
            next_attempt_at: now,
            updated_at: now,
        }, {
            onConflict: "content_id,render_version",
        })
        .select(STORY_IMAGE_JOB_SELECT)
        .single();

    if (error) {
        throw error;
    }

    return data as StoryImageJob;
}
