import "server-only";

import { revalidatePath } from "next/cache";
import { buildCanonicalReadPath } from "@/lib/content-paths";
import type { getAdminClient } from "@/lib/supabase/admin";

type AdminSupabaseClient = ReturnType<typeof getAdminClient>;

export interface ContentRevalidationItem {
    id: string;
    title?: string | null;
}

export interface ContentUpdateRevalidationItem {
    id: string;
    nextTitle?: string | null;
    previousTitle?: string | null;
}

const PUBLIC_CONTENT_COLLECTION_PATHS = ["/", "/browse", "/search"] as const;
const FEATURED_CONTENT_COLLECTION_PATHS = ["/", "/browse"] as const;
const ADMIN_CONTENT_LIST_PATHS = ["/admin", "/admin/content"] as const;
const SERIES_ADMIN_SURFACE_PATHS = ["/admin/series", "/admin/content/new"] as const;

export function revalidatePaths(paths: Iterable<string | null | undefined>) {
    const uniquePaths = new Set<string>();

    for (const path of paths) {
        if (path) {
            uniquePaths.add(path);
        }
    }

    uniquePaths.forEach((path) => revalidatePath(path));
}

export function revalidatePublicContentCollections() {
    revalidatePaths(PUBLIC_CONTENT_COLLECTION_PATHS);
}

export function revalidateFeaturedContentCollections() {
    revalidatePaths(FEATURED_CONTENT_COLLECTION_PATHS);
}

export function revalidateAdminContentListPaths() {
    revalidatePaths(ADMIN_CONTENT_LIST_PATHS);
}

export function revalidateSeriesPaths(seriesSlugs: string[]) {
    revalidatePaths(seriesSlugs.map((slug) => `/series/${slug}`));
}

function buildPublicContentItemPaths(item: ContentRevalidationItem) {
    const paths = [`/preview/${item.id}`, `/read/${item.id}`];

    if (item.title) {
        paths.push(buildCanonicalReadPath(item.id, item.title));
    }

    return paths;
}

function buildPublicContentUpdatePaths(item: ContentUpdateRevalidationItem) {
    return [
        `/preview/${item.id}`,
        `/read/${item.id}`,
        item.previousTitle ? buildCanonicalReadPath(item.id, item.previousTitle) : null,
        item.nextTitle ? buildCanonicalReadPath(item.id, item.nextTitle) : null,
    ];
}

function buildAdminContentEditPaths(ids: string[]) {
    return ids.map((id) => `/admin/content/${id}/edit`);
}

export async function getSeriesSlugsByIds(
    supabase: AdminSupabaseClient,
    seriesIds: Array<string | null | undefined>
) {
    const uniqueSeriesIds = Array.from(new Set(seriesIds.filter((value): value is string => Boolean(value))));
    if (uniqueSeriesIds.length === 0) {
        return [];
    }

    const { data, error } = await supabase
        .from("content_series")
        .select("slug")
        .in("id", uniqueSeriesIds);

    if (error || !data) {
        return [];
    }

    return Array.from(new Set(data.map((entry) => entry.slug).filter(Boolean)));
}

export function revalidateContentCreated(params: ContentRevalidationItem & { seriesSlugs?: string[] }) {
    revalidatePaths([
        ...PUBLIC_CONTENT_COLLECTION_PATHS,
        ...ADMIN_CONTENT_LIST_PATHS,
        ...buildPublicContentItemPaths(params),
        ...(params.seriesSlugs ?? []).map((slug) => `/series/${slug}`),
    ]);
}

export function revalidateContentUpdated(params: ContentUpdateRevalidationItem & { seriesSlugs?: string[] }) {
    revalidatePaths([
        ...PUBLIC_CONTENT_COLLECTION_PATHS,
        ...ADMIN_CONTENT_LIST_PATHS,
        ...buildPublicContentUpdatePaths(params),
        `/admin/content/${params.id}/edit`,
        ...(params.seriesSlugs ?? []).map((slug) => `/series/${slug}`),
    ]);
}

export function revalidateContentDeleted(params: ContentRevalidationItem & { seriesSlugs?: string[] }) {
    revalidatePaths([
        ...PUBLIC_CONTENT_COLLECTION_PATHS,
        ...ADMIN_CONTENT_LIST_PATHS,
        ...buildPublicContentItemPaths(params),
        ...(params.seriesSlugs ?? []).map((slug) => `/series/${slug}`),
    ]);
}

export function revalidateContentBulkChanged(params: {
    includeAdminEditPaths?: boolean;
    items: ContentRevalidationItem[];
    seriesSlugs?: string[];
}) {
    const itemIds = params.items.map((item) => item.id);

    revalidatePaths([
        ...PUBLIC_CONTENT_COLLECTION_PATHS,
        ...ADMIN_CONTENT_LIST_PATHS,
        ...params.items.flatMap(buildPublicContentItemPaths),
        ...(params.includeAdminEditPaths === false ? [] : buildAdminContentEditPaths(itemIds)),
        ...(params.seriesSlugs ?? []).map((slug) => `/series/${slug}`),
    ]);
}

export function revalidateContentFeaturedChanged(params: { ids: string[] }) {
    revalidatePaths([
        ...FEATURED_CONTENT_COLLECTION_PATHS,
        ...ADMIN_CONTENT_LIST_PATHS,
        ...buildAdminContentEditPaths(params.ids),
    ]);
}

export function revalidateNarrationContentChanged(items: ContentRevalidationItem[]) {
    revalidatePaths([
        ...PUBLIC_CONTENT_COLLECTION_PATHS,
        ...ADMIN_CONTENT_LIST_PATHS,
        ...items.flatMap(buildPublicContentItemPaths),
        ...buildAdminContentEditPaths(items.map((item) => item.id)),
    ]);
}

export function revalidateSeriesAdminSurfaces(slugs: Array<string | null | undefined>) {
    revalidatePaths([
        ...SERIES_ADMIN_SURFACE_PATHS,
        ...slugs.filter((slug): slug is string => Boolean(slug)).map((slug) => `/series/${slug}`),
    ]);
}
