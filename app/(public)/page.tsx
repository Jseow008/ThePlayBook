import { createPublicServerClient } from "@/lib/supabase/public-server";
import { HomeFeed } from "@/components/ui/HomeFeed";
import type { ContentItem, HomepageSection } from "@/types/database";

/**
 * Landing Page (Home)
 * 
 * Netflix-style landing with hero carousel and horizontal content lanes.
 * Uses ISR with 1 hour revalidation for optimal SEO and performance.
 */

export const revalidate = 300; // Revalidate every 5 minutes

const CONTENT_CARD_SELECT = "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, hero_image_url, category, is_featured, audio_url, created_at, updated_at, deleted_at";

export default async function HomePage() {
    const supabase = createPublicServerClient();

    // 1. Fetch Featured (for Hero)
    let { data: featuredData } = await supabase
        .from("content_item")
        .select(CONTENT_CARD_SELECT)
        .eq("status", "verified")
        .eq("is_featured", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);

    // Fallback: If no featured items, grab the latest 5 items so the Hero isn't empty
    if (!featuredData || featuredData.length === 0) {
        const { data: fallbackData } = await supabase
            .from("content_item")
            .select(CONTENT_CARD_SELECT)
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5);
        featuredData = fallbackData;
    }

    // 2. Fetch All Items for "New on NETFLUX" row
    const { data: allItems } = await supabase
        .from("content_item")
        .select(CONTENT_CARD_SELECT)
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);

    // 3. Fetch Homepage Sections (admin-controlled)
    const { data: sectionsData } = await supabase
        .from("homepage_section")
        .select("id, title, filter_type, filter_value, order_index, is_active")
        .eq("is_active", true)
        .order("order_index", { ascending: true });

    const featuredItems = (featuredData || []) as ContentItem[];
    const items = (allItems || []) as ContentItem[];
    const sections = (sectionsData || []) as HomepageSection[];

    // 4. Fetch content for each section
    const sectionResults = await Promise.all(sections.map(async (section) => {
        let query = supabase
            .from("content_item")
            .select(CONTENT_CARD_SELECT)
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(10);

        // Apply filter based on section type
        switch (section.filter_type) {
            case "author":
                query = query.ilike("author", `%${section.filter_value}%`);
                break;
            case "title":
                query = query.ilike("title", `%${section.filter_value}%`);
                break;
            case "category":
                query = query.eq("category", section.filter_value);
                break;
            case "featured":
                query = query.eq("is_featured", true);
                break;
        }

        const { data } = await query;
        return {
            id: section.id,
            items: (data || []) as ContentItem[],
        };
    }));

    const sectionItems = Object.fromEntries(
        sectionResults.map((result) => [result.id, result.items])
    ) as Record<string, ContentItem[]>;

    return (
        <HomeFeed
            items={items}
            featuredItems={featuredItems}
            sections={sections}
            sectionItems={sectionItems}
        />
    );
}

