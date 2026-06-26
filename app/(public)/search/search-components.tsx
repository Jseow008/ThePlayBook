import { ContentCard } from "@/components/ui/ContentCard";
import { SearchAnalyticsTracker } from "@/app/(public)/search/SearchAnalyticsTracker";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { escapePostgrestLikeValue } from "@/lib/postgrest-filters";
import type { ContentItem, ContentType } from "@/types/database";
import { ArrowLeft, ArrowRight, Clock3, Search } from "lucide-react";
import Link from "next/link";

const CONTENT_CARD_SELECT = "id, type, title, author, category, cover_image_url, duration_seconds, created_at, quick_mode_json";
const CATALOG_PAGE_SIZE = 20;
const SEARCHABLE_TYPES: ContentType[] = ["book", "podcast", "article"];
type CatalogSort = "recent" | "popular";

export function normalizeType(type?: string): ContentType | undefined {
    if (!type || type.toLowerCase() === "all") {
        return undefined;
    }

    const normalized = type.toLowerCase() as ContentType;
    return SEARCHABLE_TYPES.includes(normalized) ? normalized : undefined;
}

function formatTypeLabel(type: ContentType) {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

export function formatPopularLabel(type?: ContentType) {
    if (!type) {
        return "Popular";
    }

    return `Popular ${formatTypeLabel(type)}s`;
}

export function normalizeCatalogSort(sort?: string): CatalogSort {
    return sort === "popular" ? "popular" : "recent";
}

export function normalizePage(page?: string) {
    const parsed = Number.parseInt(page ?? "1", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function buildSearchHref({
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

export function ContentGrid({ items }: { items: ContentItem[] }) {
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

export function ResultsSkeleton() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6">
            {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-secondary/50 rounded-lg animate-pulse" />
            ))}
        </div>
    );
}
