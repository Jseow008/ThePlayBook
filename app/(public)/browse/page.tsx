import { Suspense } from "react";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { HomeFeed } from "@/components/ui/HomeFeed";
import type { ContentItem, Database, HomepageSection } from "@/types/database";

/**
 * Browse Page (Content Dashboard)
 * 
 * Netflix-style dashboard with hero carousel and horizontal content lanes.
 * This is the main content browsing experience.
 * Uses ISR with 5 minute revalidation for optimal SEO and performance.
 */

export const revalidate = 300; // Revalidate every 5 minutes

const CONTENT_CARD_SELECT = "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, updated_at, deleted_at";
type HomepageSectionsRpcRow = Database["public"]["Functions"]["get_homepage_sections_with_items"]["Returns"][number];

export default function BrowsePage() {
    return (
        <Suspense fallback={<HomeFeedSkeleton />}>
            <HomeFeedServer />
        </Suspense>
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
                            <div key={i} className="flex-none w-[140px] md:w-[200px] lg:w-[240px] aspect-[2/3] bg-card/30 rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

async function HomeFeedServer() {
    const supabase = createPublicServerClient();

    const [featuredResult, latestResult, sectionsResult] = await Promise.all([
        supabase
            .from("content_item")
            .select(CONTENT_CARD_SELECT)
            .eq("status", "verified")
            .eq("is_featured", true)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5),
        supabase
            .from("content_item")
            .select(CONTENT_CARD_SELECT)
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(10),
        supabase.rpc("get_homepage_sections_with_items", { p_limit: 10 }),
    ]);

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
