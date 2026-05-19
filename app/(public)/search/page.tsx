/**
 * Search Page
 * 
 * Full-text search across content titles, authors, and categories.
 * Supports filtering by category and type.
 */

import { createPublicServerClient } from "@/lib/supabase/public-server";
import { ContentCard } from "@/components/ui/ContentCard";
import { ArrowRight, Megaphone, Search, TrendingUp } from "lucide-react";
import { getCategoryStats } from "@/lib/server/public-content";
import type { ContentItem, ContentType } from "@/types/database";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchInput } from "@/components/ui/SearchInput";
import { Suspense } from "react";
import { SearchTopicSelect } from "@/components/ui/SearchTopicSelect";
import { escapePostgrestLikeValue } from "@/lib/postgrest-filters";
import {
    buildCanonicalCategoryStats,
    CURATED_SEARCH_TOPICS,
    getCanonicalContentCategory,
    normalizeContentCategoryLabel,
    resolveContentCategoryAlias,
} from "@/lib/content-categories";

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

function normalizeType(type?: string): ContentType | undefined {
    if (!type || type.toLowerCase() === "all") {
        return undefined;
    }

    const normalized = type.toLowerCase() as ContentType;
    return SEARCHABLE_TYPES.includes(normalized) ? normalized : undefined;
}

function formatTypeLabel(type: ContentType) {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

function formatTrendingLabel(type?: ContentType) {
    if (!type) {
        return "Trending Now";
    }

    return `Trending ${formatTypeLabel(type)}s`;
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

function buildRequestHref({ query, type }: { query?: string; type?: string }) {
    const params = new URLSearchParams();

    if (query?.trim()) {
        params.set("prefill", query.trim());
    }

    if (type && type.toLowerCase() !== "all") {
        params.set("type", type.toLowerCase());
    }

    const search = params.toString();
    return search ? `/requests?${search}` : "/requests";
}

function buildNormalizedTopics(categoryStats: CategoryStat[]) {
    return buildCanonicalCategoryStats(categoryStats)
        .map((item) => ({
            label: item.category,
            count: item.count,
            rawValues: item.rawValues,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// Separate component for results to enable Suspense
export async function SearchResults({
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
            const searchTerm = escapePostgrestLikeValue(trimmedQuery);
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
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-lg font-medium">
                    {results.length} result{results.length !== 1 ? "s" : ""}
                    {query && ` for "${query}"`}
                    {categoryLabel && ` in ${categoryLabel}`}
                    {normalizedType && ` (${normalizedType})`}
                </p>
                {hasQuery && results.length > 0 ? (
                    <Link
                        href={buildRequestHref({ query: trimmedQuery, type: normalizedType })}
                        className="focus-ring inline-flex w-fit items-center gap-2 rounded-full border border-border bg-secondary/30 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                    >
                        <Megaphone className="size-4" />
                        Request another summary
                    </Link>
                ) : null}
            </div>

            {results.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
                    {results.map((item, index) => (
                        <ContentCard
                            key={item.id}
                            item={item}
                            titleDensity="app-compact"
                            priority={index === 0}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-2 md:py-20 animate-in fade-in zoom-in-95 duration-300">
                    <div className="hidden md:inline-flex items-center justify-center p-6 bg-secondary/30 rounded-full mb-6 border border-border">
                        <Search className="size-9 md:size-10 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-1 md:mb-2">No results found</h3>
                    <p className="text-sm md:text-base text-muted-foreground max-w-sm mx-auto mb-3 md:mb-6">
                        We couldn&apos;t find anything matching that title, author, category, or filter.
                    </p>
                    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                        {hasQuery ? (
                            <Link
                                href={buildRequestHref({ query: trimmedQuery, type: normalizedType })}
                                className="focus-ring inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                            >
                                Request this summary
                                <ArrowRight className="size-4" />
                            </Link>
                        ) : null}
                        <Link
                            href="/search"
                            className="focus-ring inline-flex items-center gap-2 rounded-full border border-border bg-secondary/30 px-6 py-2.5 font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                        >
                            Clear all filters
                        </Link>
                    </div>
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
    const selectedType = normalizeType(type);
    const selectedTypeParam = selectedType ?? undefined;
    const normalizedCategory = normalizeContentCategoryLabel(category);
    const aliasCategory = resolveContentCategoryAlias(normalizedCategory);
    const canonicalCategory = aliasCategory ?? getCanonicalContentCategory(normalizedCategory);

    if (aliasCategory) {
        redirect(buildSearchHref({ query, category: aliasCategory, type: selectedTypeParam }));
    }

    const hasContentSearch = (query?.trim().length ?? 0) > 0 || Boolean(normalizedCategory);

    const categoryStatsPromise = getCategoryStats();
    const supabase = createPublicServerClient();
    const rpcClient = supabase as typeof supabase & {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
    const trendingPromise = !hasContentSearch
        ? rpcClient.rpc("get_trending_content", {
            p_limit: TRENDING_LIMIT,
            p_type: selectedType ?? null,
        })
        : Promise.resolve({ data: null });

    const [categoryStats, { data: trendingData }] = await Promise.all([
        categoryStatsPromise,
        trendingPromise,
    ]);

    let trendingItems: ContentItem[] = [];
    trendingItems = (trendingData || []) as unknown as ContentItem[];

    const contentTypes = ["All", "Book", "Podcast", "Article"];
    const normalizedTopics = buildNormalizedTopics(categoryStats);
    const topicsByLabel = new Map(normalizedTopics.map((topic) => [topic.label, topic]));
    const selectedTopic = canonicalCategory
        ? topicsByLabel.get(canonicalCategory) ?? {
            label: canonicalCategory,
            count: 0,
            rawValues: canonicalCategory ? [canonicalCategory] : [],
        }
        : null;
    const curatedTopicItems = CURATED_SEARCH_TOPICS.map((label) => topicsByLabel.get(label)).filter(
        (item): item is NormalizedTopic => Boolean(item)
    );
    const dropdownLabels = normalizedTopics
        .map((item) => item.label)
        .filter((label) => !CURATED_SEARCH_TOPICS.includes(label as typeof CURATED_SEARCH_TOPICS[number]));
    const dropdownOptions = Array.from(new Set([
        ...dropdownLabels,
        ...(selectedTopic && !CURATED_SEARCH_TOPICS.includes(selectedTopic.label as typeof CURATED_SEARCH_TOPICS[number])
            ? [selectedTopic.label]
            : []),
    ])).sort((a, b) => a.localeCompare(b));
    const selectedTopicLabel = selectedTopic?.label;
    const selectedTopicValues = selectedTopic?.rawValues ?? [];

    return (
        <div className="min-h-screen bg-background pb-5 md:pb-6 lg:pb-16">
            <div className="max-w-7xl mx-auto px-6 lg:px-16 py-5 md:py-8">

                <div className="flex flex-col gap-2 mb-3 md:mb-4 mt-1 md:mt-3">
                    <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight">
                        {selectedTopicLabel ? `${selectedTopicLabel} Content` : "Find Content"}
                    </h1>
                </div>

                {/* Smart Search Input */}
                <div className="max-w-4xl w-full mb-4 md:mb-5 relative z-20">
                    <SearchInput
                        initialQuery={query || ""}
                        category={selectedTopicLabel}
                        type={selectedTypeParam}
                        placeholder={selectedTopicLabel ? `Search in ${selectedTopicLabel}...` : "Search by title, author, or category..."}
                    />
                </div>

                {/* Type Filters */}
                <div className="mb-6 md:mb-8">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                        Type
                    </p>
                    <div className="flex flex-wrap justify-start gap-2">
                        {contentTypes.map((t) => {
                            const isActive = t === "All"
                                ? !selectedType
                                : selectedType === t.toLowerCase();

                            return (
                                <Link
                                    key={t}
                                    href={buildSearchHref({
                                        query,
                                        category: selectedTopicLabel,
                                        type: t === "All" ? undefined : t.toLowerCase(),
                                    })}
                                    className={`px-3.5 md:px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${isActive
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/50 hover:text-foreground"
                                        }`}
                                >
                                    {t}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {curatedTopicItems.length > 0 || dropdownOptions.length > 0 ? (
                    <div className="mb-6 md:mb-8">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                            Topics
                        </p>
                        <div className="flex flex-wrap justify-start gap-2">
                            <Link
                                href={buildSearchHref({
                                    query,
                                    type: selectedTypeParam,
                                })}
                                className={`px-3.5 md:px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${!selectedTopicLabel
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
                                            type: selectedTypeParam,
                                        })}
                                        className={`px-3.5 md:px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${isActive
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
                                type={selectedTypeParam}
                                value={selectedTopicLabel && !CURATED_SEARCH_TOPICS.includes(selectedTopicLabel as typeof CURATED_SEARCH_TOPICS[number])
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
                            type={selectedTypeParam}
                        />
                    </Suspense>
                ) : trendingItems.length > 0 ? (
                    <div className="animate-in fade-in duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <TrendingUp className="size-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">{formatTrendingLabel(selectedType)}</h2>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
                            {trendingItems.map((item, index) => (
                                <ContentCard
                                    key={item.id}
                                    item={item}
                                    titleDensity="app-compact"
                                    priority={index === 0}
                                />
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
