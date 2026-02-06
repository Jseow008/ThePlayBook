/**
 * Search Page
 * 
 * Full-text search across content titles, authors, and descriptions.
 */

import { createClient } from "@/lib/supabase/server";
import { ContentCard } from "@/components/ui/ContentCard";
import { Search } from "lucide-react";
import type { ContentItem } from "@/types/database";

interface SearchPageProps {
    searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const { q: query } = await searchParams;
    const supabase = await createClient();

    let results: ContentItem[] = [];

    if (query && query.trim().length > 0) {
        const searchTerm = `%${query}%`;

        // Run parallel searches on title, author, and description
        const [titleRes, authorRes, descRes] = await Promise.all([
            supabase
                .from("content_item")
                .select("*")
                .eq("status", "verified")
                .is("deleted_at", null)
                .ilike("title", searchTerm)
                .limit(50),
            supabase
                .from("content_item")
                .select("*")
                .eq("status", "verified")
                .is("deleted_at", null)
                .ilike("author", searchTerm)
                .limit(50),
            supabase
                .from("content_item")
                .select("*")
                .eq("status", "verified")
                .is("deleted_at", null)
                .ilike("description", searchTerm)
                .limit(50),
        ]);

        // Combine and deduplicate results
        const allResults = [
            ...(titleRes.data || []),
            ...(authorRes.data || []),
            ...(descRes.data || []),
        ];
        const seen = new Set<string>();
        results = allResults.filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        }).slice(0, 50) as ContentItem[];
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Search Header */}
            <div className="pt-8 pb-6 px-6 lg:px-12">
                <h1 className="text-3xl font-bold text-foreground mb-6">Search</h1>

                {/* Search Form */}
                <form method="GET" className="max-w-2xl">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                        <input
                            type="text"
                            name="q"
                            defaultValue={query || ""}
                            placeholder="Search by title, author, or keyword..."
                            className="w-full h-14 pl-12 pr-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg"
                            autoFocus
                        />
                    </div>
                </form>
            </div>

            {/* Results */}
            <div className="px-6 lg:px-12 pb-12">
                {query ? (
                    <>
                        <p className="text-muted-foreground mb-6">
                            {results.length} result{results.length !== 1 ? "s" : ""} for "{query}"
                        </p>

                        {results.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                {results.map((item) => (
                                    <ContentCard key={item.id} item={item} />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20">
                                <p className="text-muted-foreground text-lg">No results found.</p>
                                <p className="text-muted-foreground text-sm mt-2">Try a different search term.</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-center py-20">
                        <Search className="size-16 text-muted-foreground/30 mx-auto mb-4" />
                        <p className="text-muted-foreground text-lg">Enter a search term to find content</p>
                    </div>
                )}
            </div>
        </div>
    );
}
