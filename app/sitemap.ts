import { MetadataRoute } from "next";
import { createPublicServerClient } from "@/lib/supabase/public-server";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.netflux.blog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const supabase = createPublicServerClient();

    // Fetch all verified content items
    const { data: contentItems } = await supabase
        .from("content_item")
        .select("id, updated_at, created_at")
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    const staticRoutes: MetadataRoute.Sitemap = [
        {
            url: siteUrl,
            lastModified: new Date(),
            changeFrequency: "hourly",
            priority: 1,
        },
        {
            url: `${siteUrl}/categories`,
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
        url: `${siteUrl}/read/${item.id}`,
        lastModified: new Date(item.updated_at ?? item.created_at),
        changeFrequency: "weekly",
        priority: 0.9,
    }));

    return [...staticRoutes, ...contentRoutes];
}
