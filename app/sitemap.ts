import { MetadataRoute } from "next";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { buildReadPath } from "@/lib/content-paths";
import { getRequestId, logApiError } from "@/lib/server/api";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const supabase = createPublicServerClient();
    const requestId = getRequestId();

    // TODO: Implement paginated sitemap fetching with .range() before verified content
    // or series rows exceed Supabase/PostgREST's default 1,000-row response cap.
    const { data: contentItems, error: contentError } = await supabase
        .from("content_item")
        .select("id, title, updated_at, created_at, series_id")
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    if (contentError) {
        logApiError({
            requestId,
            route: "/sitemap.xml",
            message: "Failed to fetch sitemap content items",
            error: contentError,
        });
    }

    const seriesIds = Array.from(new Set(
        (contentItems ?? [])
            .map((item) => item.series_id)
            .filter((seriesId): seriesId is string => Boolean(seriesId))
    ));

    const { data: seriesRows, error: seriesError } = seriesIds.length > 0
        ? await supabase
            .from("content_series")
            .select("id, slug, updated_at, created_at")
            .in("id", seriesIds)
            .order("updated_at", { ascending: false })
        : { data: [], error: null };

    if (seriesError) {
        logApiError({
            requestId,
            route: "/sitemap.xml",
            message: "Failed to fetch sitemap series",
            error: seriesError,
        });
    }

    const staticRoutes: MetadataRoute.Sitemap = [
        {
            url: siteUrl,
            lastModified: new Date(),
            changeFrequency: "hourly",
            priority: 1,
        },
        {
            url: `${siteUrl}/browse`,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 0.8,
        },
        {
            url: `${siteUrl}/search`,
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 0.7,
        },
        {
            url: `${siteUrl}/about`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.5,
        },
        {
            url: `${siteUrl}/terms`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.3,
        },
        {
            url: `${siteUrl}/privacy`,
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.3,
        },
    ];

    const contentRoutes: MetadataRoute.Sitemap = (contentItems ?? []).map((item) => ({
        url: `${siteUrl}${buildReadPath(item)}`,
        lastModified: new Date(item.updated_at ?? item.created_at),
        changeFrequency: "weekly",
        priority: 0.9,
    }));
    const seriesRoutes: MetadataRoute.Sitemap = (seriesRows ?? []).map((series) => ({
        url: `${siteUrl}/series/${series.slug}`,
        lastModified: new Date(series.updated_at ?? series.created_at),
        changeFrequency: "weekly",
        priority: 0.7,
    }));

    return [...staticRoutes, ...seriesRoutes, ...contentRoutes];
}
