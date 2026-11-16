import {
    STORY_IMAGE_CONTENT_TYPE,
    STORY_IMAGE_STORAGE_PREFIX,
    buildStoryImageRenderVersion,
    buildStoryImageStoragePath,
} from "@/lib/server/story-image-renderer";
import { findCompletedStoryImage, loadVerifiedStoryImageContent } from "@/lib/server/story-image-queue";
import { getAdminClient } from "@/lib/supabase/admin";

const STORY_IMAGE_BUCKET = "media";
const STORY_IMAGE_CACHE_SECONDS = "31536000";
const STORED_IMAGE_HEAD_TIMEOUT_MS = 3_000;

type AdminClient = ReturnType<typeof getAdminClient>;

export function getStoryImagePublicUrl(storagePath: string, supabase = getAdminClient()) {
    return supabase.storage.from(STORY_IMAGE_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function storedStoryImageExists(publicUrl: string) {
    try {
        const response = await fetch(publicUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(STORED_IMAGE_HEAD_TIMEOUT_MS),
        });
        return response.ok && response.headers.get("content-type")?.startsWith("image/") === true;
    } catch {
        return false;
    }
}

export async function storeStoryImage(params: {
    supabase?: AdminClient;
    storagePath: string;
    jpegBuffer: Buffer;
}) {
    const supabase = params.supabase ?? getAdminClient();
    const imageBucket = supabase.storage.from(STORY_IMAGE_BUCKET);
    const uploadBody = new Blob([new Uint8Array(params.jpegBuffer)], {
        type: STORY_IMAGE_CONTENT_TYPE,
    });
    const { error } = await imageBucket.upload(params.storagePath, uploadBody, {
        cacheControl: STORY_IMAGE_CACHE_SECONDS,
        contentType: STORY_IMAGE_CONTENT_TYPE,
        upsert: true,
    });

    if (error) {
        throw error;
    }

    return getStoryImagePublicUrl(params.storagePath, supabase);
}

export async function cleanupOldStoryImageVersions(params: {
    supabase?: AdminClient;
    contentId: string;
    currentStoragePath: string;
}) {
    const supabase = params.supabase ?? getAdminClient();
    const imageBucket = supabase.storage.from(STORY_IMAGE_BUCKET);
    const content = await loadVerifiedStoryImageContent(supabase, params.contentId);
    if (!content) return { removed: 0 };
    const renderVersion = buildStoryImageRenderVersion(content);
    if (buildStoryImageStoragePath(content.id, renderVersion) !== params.currentStoragePath) {
        return { removed: 0 };
    }
    const completed = await findCompletedStoryImage({ supabase, contentId: content.id, renderVersion });
    if (completed?.storage_path !== params.currentStoragePath
        || !await storedStoryImageExists(getStoryImagePublicUrl(params.currentStoragePath, supabase))) {
        return { removed: 0 };
    }
    const folder = `${STORY_IMAGE_STORAGE_PREFIX}/${params.contentId}`;
    const { data, error } = await imageBucket.list(folder, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
    });

    if (error) {
        throw error;
    }

    const replacement = data?.find((object) => `${folder}/${object.name}` === params.currentStoragePath);
    if (!replacement?.created_at) return { removed: 0 };
    const replacementCreatedAt = replacement.created_at;
    // Preserve newer uploads: another replacement may still be in flight.
    const obsolete = (data ?? [])
        .filter((object) => /^[a-f0-9]{24}\.jpg$/.test(object.name)
            && object.created_at && object.created_at < replacementCreatedAt)
        .map((object) => `${folder}/${object.name}`);

    if (obsolete.length === 0) {
        return { removed: 0 };
    }

    const latestContent = await loadVerifiedStoryImageContent(supabase, params.contentId);
    if (!latestContent || buildStoryImageRenderVersion(latestContent) !== renderVersion) {
        return { removed: 0 };
    }

    const { error: removeError } = await imageBucket.remove(obsolete);
    if (removeError) {
        throw removeError;
    }

    return { removed: obsolete.length };
}
