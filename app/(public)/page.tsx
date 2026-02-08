import { createClient } from "@/lib/supabase/server";
import { HomeFeed } from "@/components/ui/HomeFeed";
import type { ContentItem, HomepageSection } from "@/types/database";

/**
 * Landing Page (Home)
 * 
 * Netflix-style landing with hero carousel and horizontal content lanes.
 * Uses ISR with 1 hour revalidation for optimal SEO and performance.
 */

export const revalidate = 60; // Revalidate every 60 seconds

export default async function HomePage() {
    const supabase = await createClient();

    // 1. Fetch Featured (for Hero)
    let { data: featuredData } = await supabase
        .from("content_item")
        .select("*")
        .eq("status", "verified")
        .eq("is_featured", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);

    // Fallback: If no featured items, grab the latest 5 items so the Hero isn't empty
    if (!featuredData || featuredData.length === 0) {
        const { data: fallbackData } = await supabase
            .from("content_item")
            .select("*")
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5);
        featuredData = fallbackData;
    }

    // 2. Fetch All Items for "New on Lifebook" row
    const { data: allItems } = await supabase
        .from("content_item")
        .select("*")
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);

    // 3. Fetch Homepage Sections (admin-controlled)
    const { data: sectionsData } = await supabase
        .from("homepage_section")
        .select("*")
        .eq("is_active", true)
        .order("order_index", { ascending: true });

    const featuredItems = (featuredData || []) as ContentItem[];
    const items = (allItems || []) as ContentItem[];
    const sections = (sectionsData || []) as HomepageSection[];

    // 4. Fetch content for each section
    const sectionItems: Record<string, ContentItem[]> = {};

    for (const section of sections) {
        let query = supabase
            .from("content_item")
            .select("*")
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
        sectionItems[section.id] = (data || []) as ContentItem[];
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

