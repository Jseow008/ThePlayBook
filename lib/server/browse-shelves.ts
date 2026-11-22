import "server-only";

import { createPublicServerClient } from "@/lib/supabase/public-server";
import type { HomepageSection } from "@/types/database";

export type ShelfBoundary = { direction: "after" | "before"; publishedAt: string; id: string };

export function fetchShelfItems(
    section: Pick<HomepageSection, "filter_type" | "filter_value"> | null,
    limit: number,
    boundary?: ShelfBoundary,
) {
    const ascending = boundary?.direction === "before";
    let query = createPublicServerClient()
        .from("content_item")
        .select("id, type, title, quick_mode_json, duration_seconds, author, cover_image_url, category, audio_url, created_at, published_at")
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("published_at", { ascending })
        .order("id", { ascending })
        .limit(limit);

    if (section?.filter_type === "author" || section?.filter_type === "title") {
        query = query.ilike(section.filter_type, `%${section.filter_value}%`);
    } else if (section?.filter_type === "category") {
        query = query.eq("category", section.filter_value);
    } else if (section?.filter_type === "featured") {
        query = query.eq("is_featured", true);
    }
    if (boundary) {
        const op = ascending ? "gt" : "lt";
        query = query.or(`published_at.${op}.${boundary.publishedAt},and(published_at.eq.${boundary.publishedAt},id.${op}.${boundary.id})`);
    }
    return query;
}
