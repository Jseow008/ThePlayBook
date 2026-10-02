import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { getCategoryStats } from "@/lib/server/public-content";
import { SEARCH_CATALOG_CACHE_SECONDS, SEARCH_CATALOG_CACHE_TAG } from "@/lib/server/search-cache-config";
import type { ContentItem, ContentType } from "@/types/database";

const CONTENT_CARD_SELECT = "id, type, title, author, category, cover_image_url, duration_seconds, audio_url, created_at, quick_mode_json";
const CATALOG_PAGE_SIZE = 20;

export interface RecentCatalogPage {
    items: ContentItem[];
    totalItems: number;
    totalPages: number;
}

function normalizeCategoryValues(values?: string[]) {
    return Array.from(new Set((values ?? []).filter(Boolean))).sort();
}

async function readRecentCatalogPage({
    categoryValues,
    type,
    page,
}: {
    categoryValues: string[];
    type?: ContentType;
    page: number;
}): Promise<RecentCatalogPage> {
    const supabase = createPublicServerClient();
    const offset = (page - 1) * CATALOG_PAGE_SIZE;
    let queryBuilder = supabase
        .from("content_item")
        .select(CONTENT_CARD_SELECT, { count: "exact" })
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + CATALOG_PAGE_SIZE - 1);

    if (categoryValues.length === 1) {
        queryBuilder = queryBuilder.eq("category", categoryValues[0]);
    } else if (categoryValues.length > 1) {
        queryBuilder = queryBuilder.in("category", categoryValues);
    }

    if (type) {
        queryBuilder = queryBuilder.eq("type", type);
    }

    const { data, count, error } = await queryBuilder;
    if (error) {
        throw error;
    }

    const items = (data || []) as ContentItem[];
    const totalItems = count ?? items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / CATALOG_PAGE_SIZE));

    return { items, totalItems, totalPages };
}

const getCachedRecentCatalogPage = unstable_cache(
    (categoryValues: string[], type: ContentType | null) => readRecentCatalogPage({
        categoryValues,
        type: type ?? undefined,
        page: 1,
    }),
    ["search-recent-page-one-v1"],
    { revalidate: SEARCH_CATALOG_CACHE_SECONDS, tags: [SEARCH_CATALOG_CACHE_TAG] },
);

const getCachedCategoryStats = unstable_cache(
    () => getCategoryStats(),
    ["search-category-stats-v1"],
    { revalidate: SEARCH_CATALOG_CACHE_SECONDS, tags: [SEARCH_CATALOG_CACHE_TAG] },
);

const getCachedPopularItems = unstable_cache(
    async (categoryValues: string[], type: ContentType | null): Promise<ContentItem[]> => {
        const supabase = createPublicServerClient();
        const { data, error } = await supabase.rpc("get_trending_content", {
            p_limit: 20,
            p_type: type ?? undefined,
            p_categories: categoryValues.length > 0 ? categoryValues : undefined,
        });
        if (error) {
            throw error;
        }
        return (data ?? []) as ContentItem[];
    },
    ["search-popular-v1"],
    { revalidate: SEARCH_CATALOG_CACHE_SECONDS, tags: [SEARCH_CATALOG_CACHE_TAG] },
);

export function getSearchCategoryStats() {
    return getCachedCategoryStats();
}

export function getRecentCatalogPage({
    categoryValues,
    type,
    page,
}: {
    categoryValues?: string[];
    type?: ContentType;
    page: number;
}): Promise<RecentCatalogPage> {
    const normalizedCategoryValues = normalizeCategoryValues(categoryValues);
    if (page !== 1) {
        return readRecentCatalogPage({ categoryValues: normalizedCategoryValues, type, page });
    }
    return getCachedRecentCatalogPage(normalizedCategoryValues, type ?? null);
}

export function getPopularCatalogItems({
    categoryValues,
    type,
}: {
    categoryValues?: string[];
    type?: ContentType;
}): Promise<ContentItem[]> {
    return getCachedPopularItems(normalizeCategoryValues(categoryValues), type ?? null);
}
