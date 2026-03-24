import type { Metadata } from "next";
import { cache } from "react";
import { APP_NAME } from "@/lib/brand";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import type { ContentItem, Json } from "@/types/database";
import type {
    ArtifactSummary,
    ContentItemWithSegments,
    ContentSeriesSummary,
    QuickMode,
    SegmentFull,
    SeriesAdjacentItem,
    SeriesContext,
} from "@/types/domain";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";

const PREVIEW_SELECT =
    "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, created_at, series_id, series_order";
const READ_SELECT = `
    id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, audio_url, series_id, series_order,
    segments:segment(id, item_id, order_index, title, markdown_body, start_time_sec, end_time_sec, deleted_at),
    artifacts:artifact(id, type, payload_schema, version)
`;

interface MetadataSource {
    id: string;
    title: string;
    author: string | null;
    category: string | null;
    cover_image_url: string | null;
    quick_mode_json: Json | null;
}

function getQuickModeBigIdea(value: Json | null) {
    if (!value || Array.isArray(value) || typeof value !== "object") {
        return null;
    }

    const candidate = value as { big_idea?: unknown };
    return typeof candidate.big_idea === "string" ? candidate.big_idea : null;
}

interface PreviewPageData {
    item: ContentItem;
    segmentCount: number;
    seriesContext: SeriesContext | null;
}

interface CategoryStat {
    category: string;
    count: number;
}

export interface SeriesPageData {
    series: ContentSeriesSummary;
    items: ContentItem[];
}

interface ReadContentRow {
    id: string;
    type: string;
    title: string;
    source_url: string | null;
    status: string;
    quick_mode_json: QuickMode | null;
    duration_seconds: number | null;
    author: string | null;
    cover_image_url: string | null;
    category: string | null;
    audio_url: string | null;
    series_id: string | null;
    series_order: number | null;
    segments: Array<{
        id: string;
        item_id: string;
        order_index: number;
        title: string | null;
        markdown_body: string;
        start_time_sec: number | null;
        end_time_sec: number | null;
        deleted_at: string | null;
    }>;
    artifacts: Array<{
        id: string;
        type: string;
        payload_schema: ArtifactSummary["payload_schema"];
        version: number;
    }>;
}

interface ContentSeriesRow {
    id: string;
    slug: string;
    title: string;
    description: string | null;
}

interface AdjacentContentRow {
    id: string;
    title: string;
    series_order: number | null;
}

function buildDescription(content: MetadataSource, modeLabel: "Preview" | "Reading") {
    return (
        getQuickModeBigIdea(content.quick_mode_json)
        ?? (content.author
            ? `${content.author} · ${content.category ?? modeLabel}`
            : content.category ?? `${modeLabel} on ${APP_NAME}`)
    );
}

async function getSeriesContext(
    item: { series_id: string | null; series_order: number | null }
): Promise<SeriesContext | null> {
    if (!item.series_id || typeof item.series_order !== "number") {
        return null;
    }

    const supabase = createPublicServerClient();

    const [
        { data: seriesData, error: seriesError },
        { data: previousRows, error: previousError },
        { data: nextRows, error: nextError },
        { count, error: countError },
    ] = await Promise.all([
        supabase
            .from("content_series")
            .select("id, slug, title, description")
            .eq("id", item.series_id)
            .single(),
        supabase
            .from("content_item")
            .select("id, title, series_order")
            .eq("series_id", item.series_id)
            .eq("status", "verified")
            .is("deleted_at", null)
            .lt("series_order", item.series_order)
            .order("series_order", { ascending: false })
            .limit(1),
        supabase
            .from("content_item")
            .select("id, title, series_order")
            .eq("series_id", item.series_id)
            .eq("status", "verified")
            .is("deleted_at", null)
            .gt("series_order", item.series_order)
            .order("series_order", { ascending: true })
            .limit(1),
        supabase
            .from("content_item")
            .select("id", { count: "exact", head: true })
            .eq("series_id", item.series_id)
            .eq("status", "verified")
            .is("deleted_at", null),
    ]);

    if (seriesError || previousError || nextError || countError || !seriesData) {
        return null;
    }

    const series = seriesData as ContentSeriesRow;
    const previousItem = ((previousRows ?? [])[0] ?? null) as AdjacentContentRow | null;
    const nextItem = ((nextRows ?? [])[0] ?? null) as AdjacentContentRow | null;

    const normalizeAdjacentItem = (entry: AdjacentContentRow | null): SeriesAdjacentItem | null => {
        if (!entry || typeof entry.series_order !== "number") {
            return null;
        }

        return {
            id: entry.id,
            title: entry.title,
            series_order: entry.series_order,
        };
    };

    return {
        series,
        totalItems: count ?? 0,
        currentOrder: item.series_order,
        previousItem: normalizeAdjacentItem(previousItem),
        nextItem: normalizeAdjacentItem(nextItem),
    };
}

export function buildPublicContentMetadata(
    content: MetadataSource,
    route: "preview" | "read"
): Metadata {
    const title = `${content.title} — ${APP_NAME}`;
    const description = buildDescription(content, route === "preview" ? "Preview" : "Reading");
    const ogImage = content.cover_image_url ?? `${siteUrl}/images/og-image.png`;

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url: `${siteUrl}/${route}/${content.id}`,
            siteName: APP_NAME,
            images: [{ url: ogImage, width: 1200, height: 630, alt: content.title }],
            type: "article",
        },
        twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [ogImage],
        },
        alternates: route === "read"
            ? {
                canonical: `${siteUrl}/read/${content.id}`,
            }
            : undefined,
    };
}

export const getPreviewPageData = cache(async (id: string): Promise<PreviewPageData | null> => {
    const supabase = createPublicServerClient();
    const [{ data, error }, { count, error: segmentError }] = await Promise.all([
        supabase
            .from("content_item")
            .select(PREVIEW_SELECT)
            .eq("id", id)
            .eq("status", "verified")
            .is("deleted_at", null)
            .single(),
        supabase
            .from("segment")
            .select("*", { count: "exact", head: true })
            .eq("item_id", id)
            .is("deleted_at", null),
    ]);

    if (error || !data || segmentError) {
        return null;
    }

    const seriesContext = await getSeriesContext(data as Pick<ContentItem, "series_id" | "series_order">);

    return {
        item: data as ContentItem,
        segmentCount: count ?? 0,
        seriesContext,
    };
});

export const getReadPageData = cache(async (id: string): Promise<ContentItemWithSegments | null> => {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
        .from("content_item")
        .select(READ_SELECT)
        .eq("id", id)
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("order_index", { referencedTable: "segment", ascending: true })
        .single();

    if (error || !data) {
        return null;
    }

    const content = data as unknown as ReadContentRow;
    const seriesContext = await getSeriesContext(content);

    return {
        id: content.id,
        type: content.type,
        title: content.title,
        source_url: content.source_url,
        status: content.status,
        category: content.category,
        quick_mode_json: content.quick_mode_json,
        duration_seconds: content.duration_seconds,
        author: content.author,
        cover_image_url: content.cover_image_url,
        audio_url: content.audio_url,
        series_id: content.series_id,
        series_order: content.series_order,
        seriesContext,
        segments: content.segments
            .filter((segment) => !segment.deleted_at)
            .sort((left, right) => left.order_index - right.order_index)
            .map((segment) => ({
                id: segment.id,
                item_id: segment.item_id,
                order_index: segment.order_index,
                title: segment.title,
                markdown_body: segment.markdown_body,
                start_time_sec: segment.start_time_sec,
                end_time_sec: segment.end_time_sec,
            })) as SegmentFull[],
        artifacts: content.artifacts as ArtifactSummary[],
    };
});

export const getSeriesPageData = cache(async (slug: string): Promise<SeriesPageData | null> => {
    const supabase = createPublicServerClient();
    const { data: seriesData, error: seriesError } = await supabase
        .from("content_series")
        .select("id, slug, title, description")
        .eq("slug", slug)
        .single();

    if (seriesError || !seriesData) {
        return null;
    }

    const { data: itemsData, error: itemsError } = await supabase
        .from("content_item")
        .select(PREVIEW_SELECT)
        .eq("series_id", seriesData.id)
        .eq("status", "verified")
        .is("deleted_at", null)
        .not("series_order", "is", null)
        .order("series_order", { ascending: true });

    if (itemsError) {
        return null;
    }

    return {
        series: seriesData as ContentSeriesSummary,
        items: (itemsData ?? []) as ContentItem[],
    };
});

export const getCategoryStats = cache(async (): Promise<CategoryStat[]> => {
    const supabase = createPublicServerClient();
    const { data } = await supabase.rpc("get_category_stats");
    return (data as CategoryStat[] | null) ?? [];
});
