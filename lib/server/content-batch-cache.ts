import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { toContentCardData } from "@/lib/server/content-card-data";
import { SEARCH_CATALOG_CACHE_TAG } from "@/lib/server/search-cache-config";

const SELECT = "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, audio_url, created_at";
const MAX_AGE_MS = 60_000;

async function readCards(ids: string[]) {
    const { data, error } = await createPublicServerClient().from("content_item").select(SELECT)
        .in("id", ids).eq("status", "verified").is("deleted_at", null);
    if (error) throw error;
    return { items: (data ?? []).map(toContentCardData), checkedAt: Date.now() };
}

export async function getCachedContentBatch(ids: string[]) {
    const canonicalIds = [...new Set(ids)].sort();
    let refresh: ReturnType<typeof readCards> | undefined;
    // Reuse the catalog tag: all content create/update/delete/replacement/narration
    // mutations already hard-expire it through the central revalidation boundary.
    const cachedRead = unstable_cache(async (keys: string[]) => {
        refresh = readCards(keys);
        return refresh;
    }, ["public-content-cards-v1", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""], {
        revalidate: MAX_AGE_MS / 1000, tags: [SEARCH_CATALOG_CACHE_TAG],
    });
    const cached = await cachedRead(canonicalIds);
    // Next's TTL can serve stale data during background revalidation. Do not
    // extend the freshness window for removed content or out-of-band edits.
    if (Date.now() - cached.checkedAt >= MAX_AGE_MS) {
        // Await the read Next already started, including its failure, rather than
        // issuing another query or returning the expired value. Keep the fallback
        // for an expired entry returned without a background refresh.
        return { ...(await (refresh ?? readCards(canonicalIds))), cache: "refresh" as const };
    }
    return { ...cached, cache: refresh ? "miss" as const : "hit" as const };
}
