import {
    STORY_IMAGE_CONTENT_TYPE,
    STORY_IMAGE_STORAGE_PREFIX,
} from "@/lib/server/story-image-renderer";
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
    retainCount?: number;
}) {
    const supabase = params.supabase ?? getAdminClient();
    const imageBucket = supabase.storage.from(STORY_IMAGE_BUCKET);
    const folder = `${STORY_IMAGE_STORAGE_PREFIX}/${params.contentId}`;
    const { data, error } = await imageBucket.list(folder, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
    });

    if (error) {
        throw error;
    }

    const storedPaths = (data ?? [])
        .filter((object) => object.name.endsWith(".jpg"))
        .map((object) => `${folder}/${object.name}`);
    const keep = new Set([
        params.currentStoragePath,
        ...storedPaths.filter((path) => path !== params.currentStoragePath),
    ].slice(0, Math.max(1, params.retainCount ?? 2)));
    const obsolete = storedPaths
        .filter((path) => !keep.has(path));

    if (obsolete.length === 0) {
        return { removed: 0 };
    }

    const { error: removeError } = await imageBucket.remove(obsolete);
    if (removeError) {
        throw removeError;
    }

    return { removed: obsolete.length };
}
