/**
 * Search Page
 * 
 * Full-text search across content titles, authors, and categories.
 * Supports filtering by category and type.
 */

import { createPublicServerClient } from "@/lib/supabase/public-server";
import { ContentCard } from "@/components/ui/ContentCard";
import { ArrowLeft, ArrowRight, Clock3, Megaphone, Search, TrendingUp } from "lucide-react";
import { getCategoryStats } from "@/lib/server/public-content";
import type { ContentItem, ContentType } from "@/types/database";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchInput } from "@/components/ui/SearchInput";
import { Suspense } from "react";
import { SearchAnalyticsTracker } from "./SearchAnalyticsTracker";
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
    searchParams: Promise<{ q?: string; category?: string; type?: string; sort?: string; page?: string }>;
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
const CATALOG_PAGE_SIZE = 20;
const POPULAR_LIMIT = 20;
const SEARCHABLE_TYPES: ContentType[] = ["book", "podcast", "article"];
type CatalogSort = "recent" | "popular";

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

function formatPopularLabel(type?: ContentType) {
    if (!type) {
        return "Popular";
    }

    return `Popular ${formatTypeLabel(type)}s`;
}

function normalizeCatalogSort(sort?: string): CatalogSort {
    return sort === "popular" ? "popular" : "recent";
}

function normalizePage(page?: string) {
    const parsed = Number.parseInt(page ?? "1", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildSearchHref({
    query,
    category,
    type,
    sort,
    page,
}: {
    query?: string;
    category?: string;
    type?: string;
    sort?: CatalogSort;
    page?: number;
}) {
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

    if (!query?.trim() && sort === "popular") {
        params.set("sort", sort);
    }

    if (!query?.trim() && sort !== "popular" && page && page > 1) {
        params.set("page", String(page));
    }

    const search = params.toString();
    return search ? `/search?${search}` : "/search";
}

export async function RecentCatalog({
    categoryLabel,
    categoryValues,
    type,
    page,
}: {
    categoryLabel?: string;
    categoryValues?: string[];
    type?: ContentType;
    page: number;
}) {
    const supabase = createPublicServerClient();
    const normalizedCategoryValues = categoryValues?.filter(Boolean) ?? [];
    const offset = (page - 1) * CATALOG_PAGE_SIZE;
    let queryBuilder = supabase
        .from("content_item")
        .select(CONTENT_CARD_SELECT, { count: "exact" })
        .eq("status", "verified")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + CATALOG_PAGE_SIZE - 1);

    if (normalizedCategoryValues.length === 1) {
        queryBuilder = queryBuilder.eq("category", normalizedCategoryValues[0]);
    } else if (normalizedCategoryValues.length > 1) {
        queryBuilder = queryBuilder.in("category", normalizedCategoryValues);
    }

    if (type) {
        queryBuilder = queryBuilder.eq("type", type);
    }

    const { data, count } = await queryBuilder;
    const items = (data || []) as ContentItem[];
    const totalItems = count ?? items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / CATALOG_PAGE_SIZE));

    return (
        <div className="animate-in fade-in duration-500">
            <div className="mb-6 flex items-center gap-2">
                <Clock3 className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">All Content</h2>
                <span className="text-sm text-muted-foreground">({totalItems})</span>
            </div>

            {items.length > 0 ? (
                <>
                    <ContentGrid items={items} />
                    <CatalogPagination
                        currentPage={page}
                        totalPages={totalPages}
                        category={categoryLabel}
                        type={type}
                    />
                </>
            ) : (
                <p className="py-12 text-center text-muted-foreground">No content matches these filters.</p>
            )}
        </div>
    );
}

function ContentGrid({ items }: { items: ContentItem[] }) {
    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 md:gap-6 lg:grid-cols-4 xl:grid-cols-4">
            {items.map((item, index) => (
                <ContentCard
                    key={item.id}
                    item={item}
                    titleDensity="app-compact"
                    priority={index === 0}
                />
            ))}
        </div>
    );
}

function CatalogPagination({
    currentPage,
    totalPages,
    category,
    type,
}: {
    currentPage: number;
    totalPages: number;
    category?: string;
    type?: ContentType;
}) {
    if (totalPages <= 1) {
        return null;
    }

    return (
        <nav aria-label="Catalog pagination" className="mt-10 flex items-center justify-center gap-4">
            <Link
                href={currentPage > 1 ? buildSearchHref({ category, type, page: currentPage - 1 }) : "#"}
                aria-disabled={currentPage <= 1}
                className={`focus-ring inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors ${
                    currentPage > 1
                        ? "bg-secondary/30 text-foreground hover:bg-secondary/50"
                        : "pointer-events-none text-muted-foreground opacity-40"
                }`}
            >
                <ArrowLeft className="size-4" />
                Previous
            </Link>
            <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
            </span>
            <Link
                href={currentPage < totalPages ? buildSearchHref({ category, type, page: currentPage + 1 }) : "#"}
                aria-disabled={currentPage >= totalPages}
                className={`focus-ring inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors ${
                    currentPage < totalPages
                        ? "bg-secondary/30 text-foreground hover:bg-secondary/50"
                        : "pointer-events-none text-muted-foreground opacity-40"
                }`}
            >
                Next
                <ArrowRight className="size-4" />
            </Link>
        </nav>
    );
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

    const filtersCount = Number(normalizedCategoryValues.length > 0) + Number(Boolean(normalizedType));

    return (
        <div className="animate-in fade-in duration-500">
            <SearchAnalyticsTracker
                queryPresent={hasQuery}
                queryLength={hasQuery ? trimmedQuery.length : undefined}
                resultCount={results.length}
                filtersCount={filtersCount}
            />
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <p className="text-muted-foreground text-lg font-medium">
                    {results.length} result{results.length !== 1 ? "s" : ""}
                    {query && ` for "${query}"`}
                    {categoryLabel && ` in ${categoryLabel}`}
                    {normalizedType && ` (${normalizedType})`}
                </p>
                {hasQuery && results.length > 0 ? (
                    <Link
                        href={buildRequestHref({ query: trimmedQuery, type: normalizedType })}
                        className="focus-ring inline-flex w-fit items-center gap-2 rounded-full border border-border bg-secondary/30 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground lg:hidden"
                    >
                        <Megaphone className="size-4" />
                        Request a summary
                    </Link>
                ) : null}
            </div>

            {results.length > 0 ? (
                <ContentGrid items={results} />
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
    const { q: query, category, type, sort, page } = await searchParams;
    const selectedType = normalizeType(type);
    const selectedTypeParam = selectedType ?? undefined;
    const selectedSort = normalizeCatalogSort(sort);
    const selectedPage = normalizePage(page);
    const normalizedCategory = normalizeContentCategoryLabel(category);
    const aliasCategory = resolveContentCategoryAlias(normalizedCategory);
    const canonicalCategory = aliasCategory ?? getCanonicalContentCategory(normalizedCategory);

    if (aliasCategory) {
        redirect(buildSearchHref({ query, category: aliasCategory, type: selectedTypeParam, sort: selectedSort, page: selectedPage }));
    }

    const hasContentSearch = (query?.trim().length ?? 0) > 0;

    const supabase = createPublicServerClient();
    const rpcClient = supabase as typeof supabase & {
        rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
    };
    const categoryStats = await getCategoryStats();
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
    const { data: popularData } = !hasContentSearch && selectedSort === "popular"
        ? await rpcClient.rpc("get_trending_content", {
            p_limit: POPULAR_LIMIT,
            p_type: selectedType ?? null,
            p_categories: selectedTopicValues.length > 0 ? selectedTopicValues : null,
        })
        : { data: null };
    const popularItems = (popularData || []) as unknown as ContentItem[];

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
                                        sort: selectedSort,
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
                                    sort: selectedSort,
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
                                            sort: selectedSort,
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
                                sort={selectedSort}
                                value={selectedTopicLabel && !CURATED_SEARCH_TOPICS.includes(selectedTopicLabel as typeof CURATED_SEARCH_TOPICS[number])
                                    ? selectedTopicLabel
                                    : ""}
                                options={dropdownOptions}
                            />
                        </div>
                    </div>
                ) : null}

                {!hasContentSearch ? (
                    <div className="mb-6 border-b border-border pb-3 md:mb-8">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                            Sort by
                        </p>
                        <div className="flex items-center gap-2">
                            <Link
                                href={buildSearchHref({
                                    category: selectedTopicLabel,
                                    type: selectedTypeParam,
                                    sort: "recent",
                                })}
                                aria-current={selectedSort === "recent" ? "page" : undefined}
                                className={`focus-ring rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                                    selectedSort === "recent"
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                                }`}
                            >
                                Newest
                            </Link>
                            <Link
                                href={buildSearchHref({
                                    category: selectedTopicLabel,
                                    type: selectedTypeParam,
                                    sort: "popular",
                                })}
                                aria-current={selectedSort === "popular" ? "page" : undefined}
                                className={`focus-ring rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                                    selectedSort === "popular"
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                                }`}
                            >
                                Popular
                            </Link>
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
                ) : selectedSort === "recent" ? (
                    <Suspense fallback={<ResultsSkeleton />}>
                        <RecentCatalog
                            categoryLabel={selectedTopicLabel}
                            categoryValues={selectedTopicValues}
                            type={selectedType}
                            page={selectedPage}
                        />
                    </Suspense>
                ) : popularItems.length > 0 ? (
                    <div className="animate-in fade-in duration-500">
                        <div className="flex items-center gap-2 mb-6">
                            <TrendingUp className="size-5 text-primary" />
                            <h2 className="text-lg font-semibold text-foreground">{formatPopularLabel(selectedType)}</h2>
                        </div>
                        <ContentGrid items={popularItems} />
                    </div>
                ) : (
                    <p className="py-12 text-center text-muted-foreground">No popular content matches these filters yet.</p>
                )}
            </div>
        </div>
    );
}
