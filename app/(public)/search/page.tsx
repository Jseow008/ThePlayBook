/**
 * Search Page
 * 
 * Full-text search across content titles, authors, and descriptions.
 * Supports filtering by category and type.
 */

import { createClient } from "@/lib/supabase/server";
import { ContentCard } from "@/components/ui/ContentCard";
import { Search, Sparkles } from "lucide-react";
import type { ContentItem } from "@/types/database";
import Link from "next/link";
import { SearchInput } from "@/components/ui/SearchInput";
import { Suspense } from "react";

interface SearchPageProps {
    searchParams: Promise<{ q?: string; category?: string; type?: string }>;
}

// Separate component for results to enable Suspense
async function SearchResults({ query, category, type }: { query?: string; category?: string; type?: string }) {
    const supabase = await createClient();

    let results: ContentItem[] = [];
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
            queryBuilder = queryBuilder.eq("type", type.toLowerCase());
        }

        if (query && query.trim().length > 0) {
            const searchTerm = `%${query.trim()}%`;
            queryBuilder = queryBuilder.or(`title.ilike.${searchTerm},author.ilike.${searchTerm},category.ilike.${searchTerm}`);
        }

        const { data } = await queryBuilder;
        results = (data || []) as ContentItem[];
    }

    if (!hasSearch) {
        return null;
    }

    return (
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
    );
}

// Loading skeleton for results
function ResultsSkeleton() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-zinc-800/50 rounded-lg animate-pulse" />
            ))}
        </div>
    );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const { q: query, category, type } = await searchParams;
    const supabase = await createClient();

    const hasSearch = (query && query.trim().length > 0) || category || type;

    // Fetch categories for suggestions
    const { data: categoriesData } = await supabase
        .from("content_item")
        .select("category")
        .eq("status", "verified")
        .is("deleted_at", null)
        .not("category", "is", null);

    const categories = [...new Set((categoriesData as { category: string }[] || []).map(c => c.category).filter(Boolean))].slice(0, 8);

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

                {/* Smart Search Input */}
                <div className="mb-6">
                    <SearchInput
                        initialQuery={query || ""}
                        category={category}
                        type={type}
                        placeholder={category ? `Search in ${category}...` : "Search by title, author, or keyword..."}
                    />
                </div>

                {/* Type Filters */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {contentTypes.map((t) => {
                        const isActive = (type === t) || (!type && t === "All") || (type && type.toLowerCase() === t.toLowerCase()) || (t === "All" && type === "All");

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
                    <Suspense fallback={<ResultsSkeleton />}>
                        <SearchResults query={query} category={category} type={type} />
                    </Suspense>
                ) : (
                    <div className="text-center py-16">
                        <div className="inline-flex items-center justify-center p-4 bg-zinc-800/50 rounded-full mb-6">
                            <Sparkles className="size-8 text-primary" />
                        </div>
                        <p className="text-foreground text-xl font-medium mb-2">Discover Something New</p>
                        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
                            Search for books, podcasts, and articles, or explore by category below.
                        </p>

                        {/* Category Suggestions */}
                        {categories.length > 0 && (
                            <div className="max-w-2xl mx-auto">
                                <p className="text-sm text-muted-foreground mb-4 uppercase tracking-wider">
                                    Popular Categories
                                </p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {categories.map((cat) => (
                                        <Link
                                            key={cat}
                                            href={`/search?category=${encodeURIComponent(cat as string)}`}
                                            className="px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700/50 text-foreground rounded-full text-sm font-medium transition-colors border border-zinc-700/50 hover:border-zinc-600"
                                        >
                                            {cat}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

