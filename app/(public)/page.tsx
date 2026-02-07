import { createClient } from "@/lib/supabase/server";
import { HomeFeed } from "@/components/ui/HomeFeed";
import type { ContentItem } from "@/types/database";

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

    // 2. Fetch All Items for Rows (optimized)
    const { data: allItems } = await supabase
        .from("content_item")
        .select("*")
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50); // Reasonable limit for MVP

    const featuredItems = (featuredData || []) as ContentItem[];
    const items = (allItems || []) as ContentItem[];

    // 3. Fetch "Diary of a CEO" content
    const { data: diaryData } = await supabase
        .from("content_item")
        .select("*")
        .eq("status", "verified")
        .is("deleted_at", null)
        .or("author.ilike.%Steven Bartlett%,title.ilike.%Diary of a CEO%")
        .order("created_at", { ascending: false })
        .limit(10);

    // 4. Fetch "TED Talks" content
    const { data: tedData } = await supabase
        .from("content_item")
        .select("*")
        .eq("status", "verified")
        .is("deleted_at", null)
        .or("author.ilike.%TED%,title.ilike.%TED%")
        .order("created_at", { ascending: false })
        .limit(10);

    const featuredItems = (featuredData || []) as ContentItem[];
    const items = (allItems || []) as ContentItem[];
    const diaryItems = (diaryData || []) as ContentItem[];
    const tedItems = (tedData || []) as ContentItem[];

    return (
        <HomeFeed
            items={items}
            featuredItems={featuredItems}
            diaryItems={diaryItems}
            tedItems={tedItems}
        />
    );
}
