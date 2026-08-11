import type { Metadata } from "next";
import { Suspense } from "react";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { HomeFeed } from "@/components/ui/HomeFeed";
import { getRequestId, logApiError } from "@/lib/server/api";
import type { ContentItem, Database, HomepageSection } from "@/types/database";
import { APP_NAME } from "@/lib/brand";
import { COMPACT_SHELF_SKELETON_CARD_CLASS } from "@/components/ui/content-card-standards";
import {
    absoluteUrl,
    buildBreadcrumbJsonLd,
    ROOT_OG_IMAGE,
    ROOT_OG_IMAGE_ALT,
    serializeJsonLdGraph,
} from "@/lib/seo";
import { BROWSE_LANE_FETCH_LIMIT } from "@/lib/browse-lanes";

/**
 * Browse Page (Content Dashboard)
 * 
 * Content dashboard with hero carousel and horizontal content lanes.
 * This is the main content browsing experience.
 * Uses ISR with 5 minute revalidation for optimal SEO and performance.
 */

export const revalidate = 300; // Revalidate every 5 minutes

const browseDescription =
    "Browse summaries, highlights, and saved ideas from books, podcasts, articles, and videos in the Netflux library.";

export const metadata: Metadata = {
    title: `Browse summaries - ${APP_NAME}`,
    description: browseDescription,
    alternates: {
        canonical: absoluteUrl("/browse"),
    },
    openGraph: {
        title: `Browse summaries - ${APP_NAME}`,
        description: browseDescription,
        url: absoluteUrl("/browse"),
        siteName: APP_NAME,
        images: [{ url: ROOT_OG_IMAGE, width: 1200, height: 630, alt: ROOT_OG_IMAGE_ALT }],
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: `Browse summaries - ${APP_NAME}`,
        description: browseDescription,
        images: [ROOT_OG_IMAGE],
    },
};

const FEED_CARD_SELECT =
    "id, type, title, quick_mode_json, duration_seconds, author, cover_image_url, category, audio_url, created_at, published_at";
const HERO_CARD_SELECT =
    "id, type, title, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, audio_url, created_at, published_at";
type HomepageSectionsRpcRow = Database["public"]["Functions"]["get_homepage_sections_with_items"]["Returns"][number];

export default function BrowsePage() {
    const browseJsonLd = [
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "@id": `${absoluteUrl("/browse")}#collection`,
            name: "Browse summaries",
            description: browseDescription,
            url: absoluteUrl("/browse"),
            isPartOf: {
                "@id": `${absoluteUrl("/")}#website`,
            },
        },
        buildBreadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Browse", path: "/browse" },
        ]),
    ];

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: serializeJsonLdGraph(browseJsonLd) }}
            />
            <Suspense fallback={<HomeFeedSkeleton />}>
                <HomeFeedServer />
            </Suspense>
        </>
    );
}

function HomeFeedSkeleton() {
    return (
        <div className="min-h-screen bg-background animate-pulse">
            <div className="h-[60vh] md:h-[80vh] w-full bg-card/20" />
            <div className="-mt-8 relative z-10 px-4 md:px-8 lg:px-16 space-y-8">
                <div className="space-y-4">
                    <div className="h-8 w-48 bg-card/30 rounded" />
                    <div className="flex gap-4 overflow-hidden">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div
                                key={i}
                                data-testid="browse-shelf-skeleton-card"
                                className={`${COMPACT_SHELF_SKELETON_CARD_CLASS} bg-card/30 rounded-lg`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

async function HomeFeedServer() {
    const supabase = createPublicServerClient();
    const requestId = getRequestId();

    const [featuredResult, latestResult, sectionsResult] = await Promise.all([
        supabase
            .from("content_item")
            .select(HERO_CARD_SELECT)
            .eq("status", "verified")
            .eq("is_featured", true)
            .is("deleted_at", null)
            .order("published_at", { ascending: false })
            .limit(5),
        supabase
            .from("content_item")
            .select(FEED_CARD_SELECT)
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("published_at", { ascending: false })
            .limit(BROWSE_LANE_FETCH_LIMIT),
        supabase.rpc("get_homepage_sections_with_items", { p_limit: BROWSE_LANE_FETCH_LIMIT }),
    ]);

    if (featuredResult.error) {
        logApiError({
            requestId,
            route: "/browse",
            message: "Failed to fetch browse featured items",
            error: featuredResult.error,
        });
    }

    if (latestResult.error) {
        logApiError({
            requestId,
            route: "/browse",
            message: "Failed to fetch browse latest items",
            error: latestResult.error,
        });
    }

    if (sectionsResult.error) {
        logApiError({
            requestId,
            route: "/browse",
            message: "Failed to fetch browse homepage sections",
            error: sectionsResult.error,
        });
    }

    const items = (latestResult.data || []) as ContentItem[];
    const featuredItems = ((featuredResult.data && featuredResult.data.length > 0)
        ? featuredResult.data
        : items.slice(0, 5)) as ContentItem[];
    const sectionData = sectionsResult.data;

    // Parse the RPC results into the shape expected by the frontend
    const sections: HomepageSection[] = [];
    const sectionItems: Record<string, ContentItem[]> = {};

    if (sectionData) {
        // The RPC returns { section_id, section_title, filter_type, filter_value, order_index, is_active, items }
        const rows = sectionData as HomepageSectionsRpcRow[];
        for (const row of rows) {
            sections.push({
                id: row.section_id,
                title: row.section_title,
                filter_type: row.filter_type_out,
                filter_value: row.filter_value_out,
                order_index: row.order_index_out,
                is_active: row.is_active_out,
            } as HomepageSection);

            sectionItems[row.section_id] = (Array.isArray(row.items) ? row.items : []) as ContentItem[];
        }
    }

    return (
        <HomeFeed
            items={items}
            featuredItems={featuredItems}
            sections={sections}
            sectionItems={sectionItems}
        />
    );
}
