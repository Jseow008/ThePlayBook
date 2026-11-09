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
    CANONICAL_CONTENT_CATEGORIES,
    CURATED_SEARCH_TOPICS,
    isContentCategory,
    normalizeContentCategoryLabel,
} from "@/lib/content-categories";
import {
    buildSearchHref,
    formatTypeLabel,
    normalizeCatalogSort,
    normalizePage,
    normalizeType,
    PopularCatalog,
    RecentCatalog,
    ResultsSkeleton,
    SEARCHABLE_TYPES,
    SearchResults,
} from "./search-components";

interface SearchPageProps {
    searchParams: Promise<{ q?: string; category?: string; type?: string; sort?: string; page?: string; cursor?: string }>;
}

const MORE_SEARCH_TOPICS = CANONICAL_CONTENT_CATEGORIES.filter((topic) => !CURATED_SEARCH_TOPICS.includes(topic));

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const { q: query, category, type, sort, page, cursor } = await searchParams;
    const selectedType = normalizeType(type);
    const selectedTypeParam = selectedType ?? undefined;
    const selectedSort = normalizeCatalogSort(sort);
    const selectedPage = normalizePage(page);
    const normalizedCategory = normalizeContentCategoryLabel(typeof category === "string" ? category : undefined);
    const selectedTopicLabel = isContentCategory(normalizedCategory) ? normalizedCategory : undefined;

    if (category && !selectedTopicLabel) {
        redirect(buildSearchHref({ query, type: selectedTypeParam, sort: selectedSort }));
    }

    const hasContentSearch = (query?.trim().length ?? 0) > 0;

    const preloadedSearchResponse = hasContentSearch && !selectedTopicLabel
        ? searchCatalog({ query: query?.trim() ?? "", categories: [], type: selectedType ?? null, cursor: cursor ?? null })
        : undefined;
    const preloadedRecentPage = !hasContentSearch && selectedSort === "recent" && !selectedTopicLabel
        ? getRecentCatalogPage({ categoryValues: [], type: selectedType, page: selectedPage })
        : undefined;
    const preloadedPopular = !hasContentSearch && selectedSort === "popular" && !selectedTopicLabel
        ? getPopularCatalogItems({ categoryValues: [], type: selectedType })
        : undefined;
    void preloadedSearchResponse?.catch(() => undefined);
    void preloadedRecentPage?.catch(() => undefined);
    void preloadedPopular?.catch(() => undefined);

    let selectedTopicValues: string[] = [];
    if (selectedTopicLabel) {
        // Keep matching stored variants of approved topics without exposing them in the picker.
        const categoryStats = await getSearchCategoryStats().catch((error) => {
            console.error("Search topic stats read failed", error);
            return [];
        });
        const selectedTopic = buildCanonicalCategoryStats(categoryStats).find(({ category }) => category === selectedTopicLabel);
        selectedTopicValues = selectedTopic?.rawValues ?? [selectedTopicLabel];
    }

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
                    <div className="flex flex-wrap justify-start gap-x-2 sm:gap-y-2">
                        {[undefined, ...SEARCHABLE_TYPES].map((choice) => {
                            const isActive = selectedType === choice;

                            return (
                                <div key={choice ?? "all"} className="flex min-h-11 items-center sm:contents">
                                    <SearchFilterLink
                                        filterParam="type"
                                        filterValue={choice}
                                        aria-current={isActive ? "true" : undefined}
                                        href={buildSearchHref({
                                            query,
                                            category: selectedTopicLabel,
                                            type: choice,
                                            sort: selectedSort,
                                        })}
                                        className={`touch-target-44 px-3.5 md:px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${isActive
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/50 hover:text-foreground"
                                            }`}
                                    >
                                        {choice ? formatTypeLabel(choice) : "All"}
                                    </SearchFilterLink>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="mb-6 md:mb-8 lg:mb-5">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                        Topics
                    </p>
                    <div className="sm:hidden">
                        <SearchTopicSelect
                            query={query}
                            type={selectedTypeParam}
                            sort={selectedSort}
                            value={selectedTopicLabel ?? ""}
                            options={[...CANONICAL_CONTENT_CATEGORIES]}
                            variant="all-topics"
                        />
                    </div>
                    <div className="hidden flex-wrap justify-start gap-2 sm:flex">
                        <SearchFilterLink
                            filterParam="category"
                            aria-current={!selectedTopicLabel ? "true" : undefined}
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

                        {CURATED_SEARCH_TOPICS.map((topic) => {
                            const isActive = selectedTopicLabel === topic;

                            return (
                                <SearchFilterLink
                                    key={topic}
                                    filterParam="category"
                                    filterValue={topic}
                                    aria-current={isActive ? "true" : undefined}
                                    href={buildSearchHref({
                                        query,
                                        category: topic,
                                        type: selectedTypeParam,
                                        sort: selectedSort,
                                    })}
                                    className={`px-3.5 md:px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${isActive
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-secondary/30 text-muted-foreground border-transparent hover:bg-secondary/50 hover:text-foreground"
                                        }`}
                                >
                                    {topic}
                                </SearchFilterLink>
                            );
                        })}

                        <SearchTopicSelect
                            query={query}
                            type={selectedTypeParam}
                            sort={selectedSort}
                            value={selectedTopicLabel && !CURATED_SEARCH_TOPICS.includes(selectedTopicLabel)
                                ? selectedTopicLabel
                                : ""}
                            options={MORE_SEARCH_TOPICS}
                        />
                    </div>
                </div>

                {!hasContentSearch ? (
                    <div className="mb-6 border-b border-border pb-3 md:mb-8 lg:mb-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
                            Sort by
                        </p>
                        <div className="flex items-center gap-2">
                            <SearchFilterLink
                                filterParam="sort"
                                filterValue="recent"
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
                                filterParam="sort"
                                filterValue="popular"
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
