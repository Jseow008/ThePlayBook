/**
 * Search Page
 * 
 * Full-text search across content titles, authors, and descriptions.
 * Supports filtering by category and type.
 */

import { createPublicServerClient } from "@/lib/supabase/public-server";
import { ContentCard } from "@/components/ui/ContentCard";
import { Search, TrendingUp } from "lucide-react";
import type { ContentItem, ContentType } from "@/types/database";
import Link from "next/link";
import { SearchInput } from "@/components/ui/SearchInput";
import { Suspense } from "react";
import { SearchTopicSelect } from "@/components/ui/SearchTopicSelect";

interface SearchPageProps {
    searchParams: Promise<{ q?: string; category?: string; type?: string }>;
}

interface CategoryStat {
    category: string;
    count: number;
}

interface NormalizedTopic {
    label: string;
    count: number;
    rawValues: string[];
}

const CONTENT_CARD_SELECT = "id, type, title, author, category, cover_image_url, duration_seconds, created_at, quick_mode_json";
const TRENDING_LIMIT = 10;
const SEARCHABLE_TYPES: ContentType[] = ["book", "podcast", "article"];
const CURATED_TOPICS = ["Business", "Finance", "Mindset", "Productivity", "Health"] as const;

function normalizeType(type?: string): ContentType | undefined {
    if (!type || type.toLowerCase() === "all") {
        return undefined;
    }

    const normalized = type.toLowerCase() as ContentType;
    return SEARCHABLE_TYPES.includes(normalized) ? normalized : undefined;
}

function formatTrendingLabel(type?: ContentType) {
    if (!type) {
        return "Trending Now";
    }

    return `Trending ${type.charAt(0).toUpperCase()}${type.slice(1)}s`;
}

function normalizeCategoryLabel(category?: string | null) {
    const trimmed = category?.trim() ?? "";
    if (!trimmed) return "";

    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 1) {
        return trimmed.slice(1, -1).trim();
    }

    return trimmed;
}

function buildSearchHref({ query, category, type }: { query?: string; category?: string; type?: string }) {
    const params = new URLSearchParams();

    if (query?.trim()) {
        params.set("q", query.trim());
    }

    if (category) {
        params.set("category", category);
    }

    if (type && type.toLowerCase() !== "all") {
        params.set("type", type.toLowerCase());
    }

    const search = params.toString();
    return search ? `/search?${search}` : "/search";
}

function buildNormalizedTopics(categoryStats: CategoryStat[]) {
    const topicMap = new Map<string, { count: number; rawValues: Set<string> }>();

    for (const item of categoryStats) {
        const normalizedLabel = normalizeCategoryLabel(item.category);
        const rawLabel = item.category?.trim();

        if (!normalizedLabel || !rawLabel) continue;

        const existing = topicMap.get(normalizedLabel) ?? {
            count: 0,
            rawValues: new Set<string>(),
        };

        existing.count += item.count;
        existing.rawValues.add(rawLabel);
        topicMap.set(normalizedLabel, existing);
    }

    return Array.from(topicMap.entries())
        .map(([label, value]) => ({
            label,
            count: value.count,
            rawValues: Array.from(value.rawValues).sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// Separate component for results to enable Suspense
async function SearchResults({
    query,
    categoryLabel,
    categoryValues,
    type,
}: {
    query?: string;
    categoryLabel?: string;
    categoryValues?: string[];
    type?: string;
}) {
    const supabase = createPublicServerClient();
    const normalizedType = normalizeType(type);
    const trimmedQuery = query?.trim() ?? "";
    const normalizedCategoryValues = categoryValues?.filter(Boolean) ?? [];

    let results: ContentItem[] = [];
    const hasQuery = trimmedQuery.length > 0;
    const hasSearch = hasQuery || normalizedCategoryValues.length > 0;

    if (hasSearch) {
        let queryBuilder = supabase
            .from("content_item")
            .select(CONTENT_CARD_SELECT)
            .eq("status", "verified")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(50);

        if (normalizedCategoryValues.length === 1) {
            queryBuilder = queryBuilder.eq("category", normalizedCategoryValues[0]);
        } else if (normalizedCategoryValues.length > 1) {
            queryBuilder = queryBuilder.in("category", normalizedCategoryValues);
        }

        if (normalizedType) {
            queryBuilder = queryBuilder.eq("type", normalizedType);
        }

        if (hasQuery) {
            const searchTerm = `%${trimmedQuery}%`;
            queryBuilder = queryBuilder.or(`title.ilike.${searchTerm},author.ilike.${searchTerm},category.ilike.${searchTerm}`);
        }

        const { data } = await queryBuilder;
        results = (data || []) as ContentItem[];
    }

    if (!hasSearch) {
        return null;
    }

    return (
        <div className="animate-in fade-in duration-500">
            <p className="text-muted-foreground mb-8 text-lg font-medium">
                {results.length} result{results.length !== 1 ? "s" : ""}
                {query && ` for "${query}"`}
                {categoryLabel && ` in ${categoryLabel}`}
                {normalizedType && ` (${normalizedType})`}
            </p>

            {results.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
                    {results.map((item) => (
                        <ContentCard key={item.id} item={item} titleDensity="app-compact" />
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
        </div>
    );
}

// Loading skeleton for results
function ResultsSkeleton() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
            {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-secondary/50 rounded-lg animate-pulse" />
            ))}
        </div>
    );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const { q: query, category, type } = await searchParams;
    const supabase = createPublicServerClient();
    const selectedType = normalizeType(type);
    const normalizedCategory = normalizeCategoryLabel(category);
    const hasContentSearch = (query?.trim().length ?? 0) > 0 || Boolean(normalizedCategory);

    const categoryStatsPromise = supabase.rpc("get_category_stats");
    const rpcClient = supabase as typeof supabase & {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
    const trendingPromise = !hasContentSearch
        ? rpcClient.rpc("get_trending_content", {
            p_limit: TRENDING_LIMIT,
            p_type: selectedType ?? null,
        })
        : Promise.resolve({ data: null });

    const [{ data: categoryStats }, { data: trendingData }] = await Promise.all([
        categoryStatsPromise,
        trendingPromise,
    ]);

    let trendingItems: ContentItem[] = [];
    trendingItems = (trendingData || []) as unknown as ContentItem[];

    const contentTypes = ["All", "Book", "Podcast", "Article"];
    const normalizedTopics = buildNormalizedTopics((categoryStats as CategoryStat[] | null) || []);
    const topicsByLabel = new Map(normalizedTopics.map((topic) => [topic.label, topic]));
    const selectedTopic = normalizedCategory
        ? topicsByLabel.get(normalizedCategory) ?? {
            label: normalizedCategory,
            count: 0,
            rawValues: category ? [category.trim()] : [],
        }
        : null;
    const curatedTopicItems = CURATED_TOPICS.map((label) => topicsByLabel.get(label)).filter(
        (item): item is NormalizedTopic => Boolean(item)
    );
    const dropdownLabels = normalizedTopics
        .map((item) => item.label)
        .filter((label) => !CURATED_TOPICS.includes(label as typeof CURATED_TOPICS[number]));
    const dropdownOptions = Array.from(new Set([
        ...dropdownLabels,
        ...(selectedTopic && !CURATED_TOPICS.includes(selectedTopic.label as typeof CURATED_TOPICS[number])
            ? [selectedTopic.label]
            : []),
    ])).sort((a, b) => a.localeCompare(b));
    const selectedTopicLabel = selectedTopic?.label;
    const selectedTopicValues = selectedTopic?.rawValues ?? [];

    return (
        <div className="min-h-screen bg-background pb-8 lg:pb-24">
            <div className="max-w-7xl mx-auto px-6 lg:px-16 py-8 md:py-12">

                <div className="flex flex-col gap-2 mb-8 mt-2 md:mt-4">
                    <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight">
                        {selectedTopicLabel ? `${selectedTopicLabel} Content` : "What do you want to learn?"}
                    </h1>
                    {selectedTopicLabel && (
                        <Link
                            href="/browse"
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
                        >
                            ← Back to browse
                        </Link>
                    )}
                </div>

                {/* Smart Search Input */}
                <div className="max-w-4xl w-full mb-8 relative z-20">
                    <SearchInput
                        initialQuery={query || ""}
                        category={selectedTopicLabel}
                        type={type}
                        placeholder={selectedTopicLabel ? `Search in ${selectedTopicLabel}...` : "Search by title, author, or keyword..."}
                        autoFocus
                    />
                </div>

                {/* Type Filters */}
                <div className="flex flex-wrap justify-start gap-2 mb-12">
                    {contentTypes.map((t) => {
                        const isActive = (type === t) || (!type && t === "All") || (type && type.toLowerCase() === t.toLowerCase()) || (t === "All" && type === "All");

                        return (
                            <Link
                                key={t}
                                href={buildSearchHref({
                                    query,
                                    category: selectedTopicLabel,
                                    type: t === "All" ? undefined : t,
                                })}
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

                {curatedTopicItems.length > 0 || dropdownOptions.length > 0 ? (
                    <div className="mb-12">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                            Topics
                        </p>
                        <div className="flex flex-wrap justify-start gap-2">
                            <Link
                                href={buildSearchHref({
                                    query,
                                    type,
                                })}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${!selectedTopicLabel
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/50 hover:text-foreground"
                                    }`}
                            >
                                All topics
                            </Link>

                            {curatedTopicItems.map((item) => {
                                const isActive = selectedTopicLabel === item.label;

                                return (
                                    <Link
                                        key={item.label}
                                        href={buildSearchHref({
                                            query,
                                            category: item.label,
                                            type,
                                        })}
                                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${isActive
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/50 hover:text-foreground"
                                            }`}
                                    >
                                        {item.label}
                                    </Link>
                                );
                            })}

                            <SearchTopicSelect
                                query={query}
                                type={type}
                                value={selectedTopicLabel && !CURATED_TOPICS.includes(selectedTopicLabel as typeof CURATED_TOPICS[number])
                                    ? selectedTopicLabel
                                    : ""}
                                options={dropdownOptions}
                            />
                        </div>
                    </div>
                ) : null}

                {/* Results */}
                {hasContentSearch ? (
                    <Suspense fallback={<ResultsSkeleton />}>
                        <SearchResults
                            query={query}
                            categoryLabel={selectedTopicLabel}
                            categoryValues={selectedTopicValues}
                            type={type}
                        />
                    </Suspense>
                ) : trendingItems.length > 0 ? (
                    <div className="animate-in fade-in duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <TrendingUp className="size-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">{formatTrendingLabel(selectedType)}</h2>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
                            {trendingItems.map((item) => (
                                <ContentCard key={item.id} item={item} titleDensity="app-compact" />
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
