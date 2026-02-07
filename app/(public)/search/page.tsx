/**
 * Search Page
 * 
 * Full-text search across content titles, authors, and descriptions.
 * Supports filtering by category.
 */

import { createClient } from "@/lib/supabase/server";
import { ContentCard } from "@/components/ui/ContentCard";
import { Search } from "lucide-react";
import type { ContentItem } from "@/types/database";
import Link from "next/link";

interface SearchPageProps {
    searchParams: Promise<{ q?: string; category?: string; type?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const { q: query, category, type } = await searchParams;
    const supabase = await createClient();

    let results: ContentItem[] = [];
    // We consider it a "search" if there's a query OR a category OR a type filter
    const hasSearch = (query && query.trim().length > 0) || category || type;

    if (hasSearch) {
        let queryBuilder = supabase
            .from("content_item")
            .select("*")
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(50);

        if (category) {
            queryBuilder = queryBuilder.eq("category", category);
        }

        if (type && type !== "All") {
            // For simplicity, we assume exact match on type 
            // (make sure DB has lowercase types like 'book', 'video', etc.)
            queryBuilder = queryBuilder.eq("type", type.toLowerCase());
        }

        if (query && query.trim().length > 0) {
            const searchTerm = `%${query.trim()}%`;
            queryBuilder = queryBuilder.or(`title.ilike.${searchTerm},author.ilike.${searchTerm},category.ilike.${searchTerm}`);
        }

        const { data } = await queryBuilder;
        results = (data || []) as ContentItem[];
    }

    const contentTypes = ["All", "Book", "Podcast", "Article"];

    return (
        <div className="min-h-screen bg-background">
            {/* Search Header */}
            <div className="pt-8 pb-6 px-6 lg:px-12">
                <div className="flex flex-col gap-4 mb-6">
                    <h1 className="text-3xl font-bold text-foreground">
                        {category ? `${category} Content` : "Search"}
                    </h1>
                    {category && (
                        <Link
                            href="/categories"
                            className="text-sm text-muted-foreground hover:text-primary transition-colors w-fit"
                        >
                            ← Browse all categories
                        </Link>
                    )}
                </div>

                {/* Search Form */}
                <form method="GET" className="max-w-2xl mb-6">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                        <input
                            type="text"
                            name="q"
                            defaultValue={query || ""}
                            placeholder={category ? `Search in ${category}...` : "Search by title, author, or keyword..."}
                            className="w-full h-14 pl-12 pr-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg"
                            autoFocus={!category}
                        />
                        {/* Preserve category in search */}
                        {category && <input type="hidden" name="category" value={category} />}
                        {/* Preserve type in search */}
                        {type && type !== "All" && <input type="hidden" name="type" value={type} />}
                    </div>
                </form>

                {/* Type Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {contentTypes.map((t) => {
                        const isActive = (type === t) || (!type && t === "All") || (type && type.toLowerCase() === t.toLowerCase()) || (t === "All" && type === "All");

                        // Construct URL for filter
                        // We need to keep existing query/category

                        return (
                            <Link
                                key={t}
                                href={{
                                    pathname: '/search',
                                    query: {
                                        ...(query ? { q: query } : {}),
                                        ...(category ? { category } : {}),
                                        type: t === "All" ? undefined : t.toLowerCase()
                                    }
                                }}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${isActive
                                    ? "bg-white text-black border-white"
                                    : "bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white"
                                    }`}
                            >
                                {t}
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Results */}
            <div className="px-6 lg:px-12 pb-12">
                {hasSearch ? (
                    <>
                        <p className="text-muted-foreground mb-6">
                            {results.length} result{results.length !== 1 ? "s" : ""}
                            {query && ` for "${query}"`}
                            {category && ` in ${category}`}
                            {type && type !== "All" && ` (${type})`}
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
                                <p className="text-muted-foreground text-sm mt-2">Try adjusting your filters.</p>
                                <Link
                                    href="/search"
                                    className="inline-block mt-4 text-primary hover:underline"
                                >
                                    Clear all filters
                                </Link>
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
