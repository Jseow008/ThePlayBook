/**
 * Search Page
 * 
 * Full-text search across content titles, authors, and categories.
 * Supports filtering by category and type.
 */

import { searchCatalog } from "@/lib/server/catalog-search";
import { getPopularCatalogItems, getRecentCatalogPage, getSearchCategoryStats } from "@/lib/server/search-catalog";
import { redirect } from "next/navigation";
import { SearchInput } from "@/components/ui/SearchInput";
import { SearchFilterLink } from "@/components/ui/SearchFilterLink";
import { Suspense } from "react";
import { SearchTopicSelect } from "@/components/ui/SearchTopicSelect";
import {
    buildCanonicalCategoryStats,
    CURATED_SEARCH_TOPICS,
    getCanonicalContentCategory,
    normalizeContentCategoryLabel,
    resolveContentCategoryAlias,
} from "@/lib/content-categories";
import {
    buildSearchHref,
    normalizeCatalogSort,
    normalizePage,
    normalizeType,
    PopularCatalog,
    RecentCatalog,
    ResultsSkeleton,
    SearchResults,
} from "./search-components";

interface SearchPageProps {
    searchParams: Promise<{ q?: string; category?: string; type?: string; sort?: string; page?: string; cursor?: string }>;
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

function buildNormalizedTopics(categoryStats: CategoryStat[]) {
    return buildCanonicalCategoryStats(categoryStats)
        .map((item) => ({
            label: item.category,
            count: item.count,
            rawValues: item.rawValues,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const { q: query, category, type, sort, page, cursor } = await searchParams;
    const selectedType = normalizeType(type);
    const selectedTypeParam = selectedType ?? undefined;
    const selectedSort = normalizeCatalogSort(sort);
    const selectedPage = normalizePage(page);
    const normalizedCategory = normalizeContentCategoryLabel(category);
    const aliasCategory = resolveContentCategoryAlias(normalizedCategory);
    const canonicalCategory = aliasCategory ?? getCanonicalContentCategory(normalizedCategory);

    if (aliasCategory) {
        redirect(buildSearchHref({ query, category: aliasCategory, type: selectedTypeParam, sort: selectedSort, page: selectedPage, cursor }));
    }

    const hasContentSearch = (query?.trim().length ?? 0) > 0;

    // Unfiltered results do not depend on the topic list, so start both reads together.
    // Category-filtered results still use the raw values returned by category stats.
    const categoryStatsPromise = getSearchCategoryStats().catch((error): CategoryStat[] => {
        console.error("Search topic stats read failed", error);
        return [];
    });
    const preloadedSearchResponse = hasContentSearch && !canonicalCategory
        ? searchCatalog({ query: query?.trim() ?? "", categories: [], type: selectedType ?? null, cursor: cursor ?? null })
        : undefined;
    const preloadedRecentPage = !hasContentSearch && selectedSort === "recent" && !canonicalCategory
        ? getRecentCatalogPage({ categoryValues: [], type: selectedType, page: selectedPage })
        : undefined;
    const preloadedPopular = !hasContentSearch && selectedSort === "popular" && !canonicalCategory
        ? getPopularCatalogItems({ categoryValues: [], type: selectedType })
        : undefined;
    void preloadedSearchResponse?.catch(() => undefined);
    void preloadedRecentPage?.catch(() => undefined);
    void preloadedPopular?.catch(() => undefined);

    const categoryStats = await categoryStatsPromise;
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
                <div className="mb-6 md:mb-8 lg:mb-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                        Type
                    </p>
                    <div className="flex flex-wrap justify-start gap-2">
                        {contentTypes.map((t) => {
                            const isActive = t === "All"
                                ? !selectedType
                                : selectedType === t.toLowerCase();

                            return (
                                <SearchFilterLink
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
                                </SearchFilterLink>
                            );
                        })}
                    </div>
                </div>

                {curatedTopicItems.length > 0 || dropdownOptions.length > 0 ? (
                    <div className="mb-6 md:mb-8 lg:mb-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                            Topics
                        </p>
                        <div className="flex flex-wrap justify-start gap-2">
                            <SearchFilterLink
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
                            </SearchFilterLink>

                            {curatedTopicItems.map((item) => {
                                const isActive = selectedTopicLabel === item.label;

                                return (
                                    <SearchFilterLink
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
                                    </SearchFilterLink>
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
                    <div className="mb-6 border-b border-border pb-3 md:mb-8 lg:mb-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                            Sort by
                        </p>
                        <div className="flex items-center gap-2">
                            <SearchFilterLink
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
                            </SearchFilterLink>
                            <SearchFilterLink
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
                            </SearchFilterLink>
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
                            cursor={cursor}
                            preloadedResponse={preloadedSearchResponse}
                        />
                    </Suspense>
                ) : selectedSort === "recent" ? (
                    <Suspense fallback={<ResultsSkeleton />}>
                        <RecentCatalog
                            categoryLabel={selectedTopicLabel}
                            categoryValues={selectedTopicValues}
                            type={selectedType}
                            page={selectedPage}
                            preloadedPage={preloadedRecentPage}
                        />
                    </Suspense>
                ) : (
                    <Suspense fallback={<ResultsSkeleton />}>
                        <PopularCatalog
                            categoryLabel={selectedTopicLabel}
                            categoryValues={selectedTopicValues}
                            type={selectedType}
                            preloadedItems={preloadedPopular}
                        />
                    </Suspense>
                )}
            </div>
        </div>
    );
}
