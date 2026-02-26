/**
 * Search Page
 * 
 * Full-text search across content titles, authors, and descriptions.
 * Supports filtering by category and type.
 */

import { createPublicServerClient } from "@/lib/supabase/public-server";
import { ContentCard } from "@/components/ui/ContentCard";
import { Sparkles, Search, ArrowLeft } from "lucide-react";
import type { ContentItem, ContentType } from "@/types/database";
import Link from "next/link";
import { SearchInput } from "@/components/ui/SearchInput";
import { Suspense } from "react";

interface SearchPageProps {
    searchParams: Promise<{ q?: string; category?: string; type?: string }>;
}

const CONTENT_CARD_SELECT = "id, type, title, author, category, cover_image_url, duration_seconds, created_at, quick_mode_json";

// Separate component for results to enable Suspense
async function SearchResults({ query, category, type }: { query?: string; category?: string; type?: string }) {
    const supabase = createPublicServerClient();

    let results: ContentItem[] = [];
    const hasSearch = (query && query.trim().length > 0) || category || type;

    if (hasSearch) {
        let queryBuilder = supabase
            .from("content_item")
            .select(CONTENT_CARD_SELECT)
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(50);

        if (category) {
            queryBuilder = queryBuilder.eq("category", category);
        }

        if (type && type !== "All") {
            queryBuilder = queryBuilder.eq("type", type.toLowerCase() as ContentType);
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {results.map((item) => (
                        <ContentCard key={item.id} item={item} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 animate-in fade-in zoom-in-95 duration-300">
                    <div className="inline-flex items-center justify-center p-6 bg-secondary/30 rounded-full mb-6 border border-border">
                        <Search className="size-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">No results found</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                        We couldn&apos;t find anything matching your search. Try different keywords or filters.
                    </p>
                    <Link
                        href="/search"
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-secondary/50 rounded-lg animate-pulse" />
            ))}
        </div>
    );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const { q: query, category, type } = await searchParams;
    const supabase = createPublicServerClient();

    const hasSearch = (query && query.trim().length > 0) || category || type;

    // Fetch categories for suggestions (RPC)
    const { data: stats } = await supabase.rpc("get_category_stats");
    const categories = ((stats as { category: string; count: number }[] | null) || []).map(s => s.category).slice(0, 8);

    const contentTypes = ["All", "Book", "Podcast", "Article"];

    return (
        <div className="min-h-screen bg-background pb-8 lg:pb-24">
            <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
                {/* Back to Library */}
                <div className="mb-8">
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-all group"
                    >
                        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span>Back to Library</span>
                    </Link>
                </div>
                <div className="flex flex-col gap-4 mb-6">
                    <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight">
                        {category ? `${category} Content` : "Search"}
                    </h1>
                    {category && (
                        <Link
                            href="/categories"
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
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
                        autoFocus
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
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/50 hover:text-foreground"
                                    }`}
                            >
                                {t}
                            </Link>
                        );
                    })}
                </div>

                {/* Results */}
                {hasSearch ? (
                    <Suspense fallback={<ResultsSkeleton />}>
                        <SearchResults query={query} category={category} type={type} />
                    </Suspense>
                ) : (
                    <div className="text-center py-16">
                        <div className="inline-flex items-center justify-center p-4 bg-secondary/30 rounded-full mb-6 border border-border/70">
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
                                            className="px-4 h-9 inline-flex items-center hover:bg-secondary/30 text-foreground rounded-full text-sm font-medium transition-colors border border-border/70 hover:border-border"
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
