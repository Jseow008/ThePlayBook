import { createClient } from "@/lib/supabase/server";
import { HeroCarousel } from "@/components/ui/HeroCarousel";
import { ContentLane } from "@/components/ui/ContentLane";
import type { ContentItem } from "@/types/database";

/**
 * Landing Page (Home)
 * 
 * Netflix-style landing with hero carousel and horizontal content lanes.
 * Uses ISR with 1 hour revalidation for optimal SEO and performance.
 */

export const revalidate = 3600; // Revalidate every hour

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

    // 3. Check Session for Personalization
    const { data: { user } } = await supabase.auth.getUser();

    // Group by Category
    const categories: Record<string, ContentItem[]> = {};
    const uncategorized: ContentItem[] = [];

    items.forEach((item) => {
        // Group by Category
        const cat = item.category;
        if (cat) {
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(item);
        } else {
            uncategorized.push(item);
        }
    });

    // Define category order
    // Put remaining categories in logical order
    const categoryOrder = [
        "Health",
        "Fitness",
        "Wealth",
        "Finance",
        "Productivity",
        "Mindset",
        "Relationships",
        "Science",
        "Business",
        "Philosophy",
        "Technology",
        "Lifestyle"
    ];

    return (
        <div className="min-h-screen bg-background">
            {/* Hero Carousel */}
            <HeroCarousel items={featuredItems} />

            {/* Content Lanes */}
            <div className={`relative z-10 pb-16 space-y-8 ${featuredItems.length > 0 ? "pt-8" : "mt-20"}`}>

                {/* New / Latest Additions */}
                <ContentLane
                    title="New on Lifebook"
                    items={items.slice(0, 10)}
                />

                {/* Personalization: Continue Reading (Placeholder) */}
                {user && (
                    <ContentLane
                        title="Continue Reading"
                        items={items.slice(0, 4)} // Placeholder: just show some items
                    />
                )}

                {/* Categories */}
                {categoryOrder.map((cat) => {
                    // Match exact category names from DB
                    const exactMatch = categories[cat];

                    if (exactMatch && exactMatch.length > 0) {
                        return (
                            <ContentLane
                                key={cat}
                                title={cat}
                                items={exactMatch}
                            />
                        );
                    }

                    return null;
                })}

                {/* Other Categories (that were not in the order list) */}
                {Object.keys(categories).map((cat) => {
                    if (categoryOrder.includes(cat)) return null;
                    return (
                        <ContentLane
                            key={cat}
                            title={cat}
                            items={categories[cat]}
                        />
                    );
                })}
            </div>

            {/* Footer */}
            <footer className="border-t border-zinc-800/50 py-12 px-6 lg:px-16 mt-12 bg-black/20">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center text-black font-serif font-bold">
                            L
                        </div>
                        <p>© 2026 Lifebook</p>
                    </div>
                    <div className="flex gap-8">
                        <a href="/about" className="hover:text-foreground transition-colors">About</a>
                        <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
                        <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
