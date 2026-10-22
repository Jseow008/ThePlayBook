import { Children, act, cloneElement, isValidElement } from "react";
import type { ElementType, ReactElement, ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock, getLatestQueryBuilder, resetSupabaseMocks, routerPushMock, redirectMock, searchCatalogMock, captureAnalyticsEventMock } = vi.hoisted(() => {
    let latestQueryBuilder: Record<string, ReturnType<typeof vi.fn>> | null = null;
    let queryData: Array<Record<string, unknown>> = [{ id: "matched-result", title: "Matched Result" }];

    const createQueryBuilder = () => {
        const builder = {
            select: vi.fn(),
            eq: vi.fn(),
            in: vi.fn(),
            is: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(),
            range: vi.fn(),
            or: vi.fn(),
            then: vi.fn(),
        };

        builder.select.mockReturnValue(builder);
        builder.eq.mockReturnValue(builder);
        builder.in.mockReturnValue(builder);
        builder.is.mockReturnValue(builder);
        builder.order.mockReturnValue(builder);
        builder.limit.mockReturnValue(builder);
        builder.range.mockReturnValue(builder);
        builder.or.mockReturnValue(builder);
        builder.then.mockImplementation((resolve: (value: { data: Array<Record<string, unknown>>; count: number }) => unknown) =>
            Promise.resolve(resolve({ data: queryData, count: queryData.length === 0 ? 0 : 41 }))
        );

        latestQueryBuilder = builder;
        return builder;
    };

    return {
        rpcMock: vi.fn(),
        fromMock: vi.fn(() => createQueryBuilder()),
        getLatestQueryBuilder: () => latestQueryBuilder,
        resetSupabaseMocks: () => {
            latestQueryBuilder = null;
            queryData = [{ id: "matched-result", title: "Matched Result" }];
        },
        routerPushMock: vi.fn(),
        searchCatalogMock: vi.fn(),
        captureAnalyticsEventMock: vi.fn(),
        redirectMock: vi.fn((url: string) => {
            throw new Error(`NEXT_REDIRECT:${url}`);
        }),
    };
});

vi.mock("next/navigation", () => ({
    redirect: redirectMock,
    useRouter: () => ({
        push: routerPushMock,
    }),
}));

vi.mock("next/cache", () => ({
    unstable_cache: (read: (...args: unknown[]) => Promise<unknown>) => read,
}));

vi.mock("next/link", () => ({
    useLinkStatus: () => ({ pending: false }),
    default: ({
        children,
        href,
        onNavigate,
        ...props
    }: {
        children: React.ReactNode;
        href: string | { pathname?: string; query?: Record<string, string | undefined> };
        onNavigate?: (event: { preventDefault: () => void }) => void;
    }) => {
        const resolvedHref = typeof href === "string"
            ? href
            : (() => {
                const params = new URLSearchParams();
                Object.entries(href.query || {}).forEach(([key, value]) => {
                    if (value) {
                        params.set(key, value);
                    }
                });

                const search = params.toString();
                return `${href.pathname || ""}${search ? `?${search}` : ""}`;
            })();

        return (
            <a href={resolvedHref} {...props} onClick={(event) => {
                // Keep the current URL unchanged while the test models a pending transition.
                event.preventDefault();
                onNavigate?.({ preventDefault: () => event.preventDefault() });
            }}>
            {children}
        </a>
        );
    },
}));

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: () => ({
        rpc: rpcMock,
        from: fromMock,
    }),
}));

vi.mock("@/lib/server/catalog-search", () => ({
    CatalogSearchError: class CatalogSearchError extends Error {},
    normalizeCatalogSearchQuery: (value: string | undefined) => (value ?? "").trim().replace(/\s+/g, " ").slice(0, 160),
    searchCatalog: searchCatalogMock,
}));

vi.mock("@/components/ui/SearchInput", () => ({
    SearchInput: () => <div data-testid="search-input">Search Input</div>,
}));

vi.mock("@/components/ui/ContentCard", () => ({
    ContentCard: ({ item }: { item: { title: string } }) => <div>{item.title}</div>,
}));

vi.mock("@/lib/analytics", () => ({
    captureAnalyticsEvent: captureAnalyticsEventMock,
}));

type SearchParams = { q?: string; category?: string; type?: string; sort?: string; page?: string; cursor?: string };
const suspenseType = Symbol.for("react.suspense") as unknown as ElementType;

function replaceAsyncResultsWithFallback(node: ReactNode): ReactNode {
    if (Array.isArray(node)) {
        return Children.map(node, replaceAsyncResultsWithFallback);
    }

    if (!isValidElement(node)) {
        return node;
    }

    const element = node as ReactElement<{ children?: ReactNode }>;

    if (element.type === suspenseType) {
        return (element.props as { fallback?: ReactNode }).fallback ?? null;
    }

    const children = element.props.children;

    if (children === undefined) {
        return element;
    }

    return cloneElement(element, undefined, replaceAsyncResultsWithFallback(children));
}

function findElementProps<TProps>(node: ReactNode, type: ElementType): TProps | null {
    if (Array.isArray(node)) {
        for (const child of node) {
            const result = findElementProps<TProps>(child, type);

            if (result) {
                return result;
            }
        }

        return null;
    }

    if (!isValidElement(node)) {
        return null;
    }

    if (node.type === type) {
        return node.props as TProps;
    }

    return findElementProps<TProps>((node as ReactElement<{ children?: ReactNode }>).props.children, type);
}

async function loadSearchPage(searchParams: SearchParams = {}) {
    const searchPageModule = await import("@/app/(public)/search/page");
    const searchComponentsModule = await import("@/app/(public)/search/search-components");
    const page = await searchPageModule.default({ searchParams: Promise.resolve(searchParams) });

    return { searchComponentsModule, page };
}

async function renderSearchPage(searchParams: SearchParams = {}) {
    const { page } = await loadSearchPage(searchParams);
    let view: ReturnType<typeof render> | undefined;

    await act(async () => {
        view = render(replaceAsyncResultsWithFallback(page));
    });

    return view!;
}

async function runSearchResultsFromPage(searchParams: SearchParams = {}) {
    const { searchComponentsModule, page } = await loadSearchPage(searchParams);
    const searchResultsProps = findElementProps<Parameters<typeof searchComponentsModule.SearchResults>[0]>(
        page,
        searchComponentsModule.SearchResults
    );

    if (!searchResultsProps) {
        throw new Error("SearchResults was not rendered for the supplied search params");
    }

    return searchComponentsModule.SearchResults(searchResultsProps);
}

async function runRecentCatalogFromPage(searchParams: SearchParams = {}) {
    const { searchComponentsModule, page } = await loadSearchPage(searchParams);
    const recentCatalogProps = findElementProps<Parameters<typeof searchComponentsModule.RecentCatalog>[0]>(
        page,
        searchComponentsModule.RecentCatalog
    );

    if (!recentCatalogProps) {
        throw new Error("RecentCatalog was not rendered for the supplied search params");
    }

    return searchComponentsModule.RecentCatalog(recentCatalogProps);
}

async function runPopularCatalogFromPage(searchParams: SearchParams = {}) {
    const { searchComponentsModule, page } = await loadSearchPage(searchParams);
    const popularCatalogProps = findElementProps<Parameters<typeof searchComponentsModule.PopularCatalog>[0]>(
        page,
        searchComponentsModule.PopularCatalog
    );

    if (!popularCatalogProps) {
        throw new Error("PopularCatalog was not rendered for the supplied search params");
    }

    return searchComponentsModule.PopularCatalog(popularCatalogProps);
}

describe("SearchPage", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        window.history.replaceState(null, "", "/search");
        resetSupabaseMocks();
        routerPushMock.mockReset();
        redirectMock.mockClear();
        searchCatalogMock.mockResolvedValue({
            outcome: "results",
            results: [{
                id: "matched-result",
                type: "book",
                title: "Matched Result",
                author: null,
                category: "Business",
                cover_image_url: null,
                duration_seconds: null,
                audio_url: null,
                created_at: "2026-09-17T00:00:00.000Z",
                quick_mode_json: {},
                rank: 1,
                snippet: { source: "Summary", text: "A matching snippet", highlights: [] },
            }],
            pageInfo: { nextCursor: null, previousCursor: null, page: 1 },
        });
        rpcMock.mockImplementation((fn: string, args?: Record<string, unknown>) => {
            if (fn === "get_category_stats") {
                return Promise.resolve({
                    data: [
                        { category: "Business", count: 6 },
                        { category: "'Business'", count: 2 },
                        { category: "Finance", count: 4 },
                        { category: "Productivity", count: 5 },
                        { category: "Health", count: 3 },
                        { category: "Pregnancy", count: 3 },
                        { category: "Parenthood", count: 2 },
                        { category: "Productivity", count: 5 },
                        { category: "Mindset", count: 3 },
                        { category: "Psychology", count: 2 },
                        { category: "'Psychology'", count: 1 },
                        { category: "Christian", count: 1 },
                    ],
                });
            }

            if (fn === "get_trending_content") {
                return Promise.resolve({ data: [] });
            }

            throw new Error(`Unexpected RPC: ${fn} ${JSON.stringify(args)}`);
        });
    });

    it("distinguishes unqueried catalog failures from empty filter results", async () => {
        const { RecentCatalog, PopularCatalog } = await import("@/app/(public)/search/search-components");
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

        render(await RecentCatalog({
            page: 1,
            preloadedPage: Promise.reject(new Error("recent unavailable")),
        }));
        expect(screen.getByRole("alert")).toHaveTextContent("Search is temporarily unavailable");
        expect(screen.queryByText("No content matches these filters.")).not.toBeInTheDocument();

        render(await PopularCatalog({
            preloadedItems: Promise.reject(new Error("popular unavailable")),
        }));
        expect(screen.getAllByRole("alert")).toHaveLength(2);
        expect(screen.queryByText("No popular content matches these filters yet.")).not.toBeInTheDocument();
        consoleError.mockRestore();
    });

    it("defaults the full catalog to newest-first when no query or category is present", async () => {
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_category_stats") {
                return Promise.resolve({
                    data: [
                        { category: "Business", count: 6 },
                        { category: "'Business'", count: 2 },
                        { category: "Productivity", count: 5 },
                        { category: "Pregnancy", count: 3 },
                        { category: "Parenthood", count: 2 },
                        { category: "Psychology", count: 2 },
                    ],
                });
            }

            if (fn === "get_trending_content") {
                return Promise.resolve({
                    data: [{ id: "trending-item", title: "Trending Item" }],
                });
            }

            throw new Error(`Unexpected RPC: ${fn}`);
        });

        await renderSearchPage({});

        expect(rpcMock).toHaveBeenCalledWith("get_category_stats");
        expect(rpcMock).not.toHaveBeenCalledWith("get_trending_content", expect.anything());
        expect(screen.getByText("Sort by")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Newest" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", { name: "Popular" })).toHaveAttribute("href", "/search?sort=popular");
        expect(screen.getByRole("link", { name: "All topics" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Business" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Productivity" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Parenting" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Psychology" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Pregnancy" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Parenthood" })).not.toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "More topics" })).not.toBeInTheDocument();
        expect(fromMock).toHaveBeenCalledWith("content_item");
    });

    it("starts the unfiltered catalog read while category stats are pending", async () => {
        let resolveStats!: (value: { data: Array<{ category: string; count: number }> }) => void;
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_category_stats") {
                return new Promise((resolve) => { resolveStats = resolve; });
            }
            throw new Error(`Unexpected RPC: ${fn}`);
        });

        const pendingPage = loadSearchPage({});
        await waitFor(() => expect(fromMock).toHaveBeenCalledWith("content_item"));
        resolveStats({ data: [] });
        await pendingPage;
    });

    it("starts text search while category stats are pending", async () => {
        let resolveStats!: (value: { data: Array<{ category: string; count: number }> }) => void;
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_category_stats") {
                return new Promise((resolve) => { resolveStats = resolve; });
            }
            throw new Error(`Unexpected RPC: ${fn}`);
        });

        const pendingPage = loadSearchPage({ q: "focus" });
        await waitFor(() => expect(searchCatalogMock).toHaveBeenCalledWith(expect.objectContaining({ query: "focus", categories: [] })));
        resolveStats({ data: [] });
        await pendingPage;
    });

    it("labels the newest-first result grid as the full catalog", async () => {
        const catalog = await runRecentCatalogFromPage({});

        await act(async () => {
            render(catalog);
        });

        expect(screen.getByRole("heading", { name: "All Content" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Recently Added" })).not.toBeInTheDocument();
    });

    it("loads type-filtered popular items when Popular is selected", async () => {
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_category_stats") {
                return Promise.resolve({
                    data: [
                        { category: "Mindset", count: 3 },
                        { category: "Science", count: 2 },
                    ],
                });
            }

            if (fn === "get_trending_content") {
                // Supabase RPC builders are awaitable but do not expose .catch().
                return {
                    then(resolve: (value: { data: Array<{ id: string; title: string }> }) => unknown) {
                        return Promise.resolve(resolve({ data: [{ id: "deep-work", title: "Deep Work" }] }));
                    },
                };
            }

            throw new Error(`Unexpected RPC: ${fn}`);
        });

        await renderSearchPage({ type: "book", sort: "popular" });
        await act(async () => {
            render(await runPopularCatalogFromPage({ type: "book", sort: "popular" }));
        });

        expect(rpcMock).toHaveBeenCalledWith("get_category_stats");
        expect(rpcMock).toHaveBeenCalledWith("get_trending_content", {
            p_limit: 20,
            p_type: "book",
            p_categories: undefined,
        });
        expect(screen.getByText("Popular Books")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Personal Development" })).toBeInTheDocument();
        expect(fromMock).toHaveBeenCalledWith("content_item");
        expect(getLatestQueryBuilder()?.select).toHaveBeenCalledWith("id, audio_url");
    });

    it("renders Popular filters and result placeholders before popular items resolve", async () => {
        let resolvePopular!: (value: { data: Array<{ id: string; title: string }> }) => void;
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_category_stats") {
                return Promise.resolve({ data: [{ category: "Business", count: 2 }] });
            }
            if (fn === "get_trending_content") {
                return new Promise((resolve) => { resolvePopular = resolve; });
            }
            throw new Error(`Unexpected RPC: ${fn}`);
        });

        const { page } = await loadSearchPage({ type: "podcast", sort: "popular" });
        render(replaceAsyncResultsWithFallback(page));

        expect(screen.getByRole("link", { name: "Podcast" })).toHaveClass("bg-primary");
        expect(screen.getByRole("link", { name: "Popular" })).toHaveAttribute("aria-current", "page");
        expect(document.querySelectorAll(".animate-pulse")).toHaveLength(12);
        resolvePopular({ data: [] });
    });

    it("uses the indexed search service for text search and applies the type filter", async () => {
        await runSearchResultsFromPage({ q: "focus", type: "podcast" });

        expect(rpcMock).toHaveBeenCalledWith("get_category_stats");
        expect(rpcMock).not.toHaveBeenCalledWith("get_trending_content", expect.anything());
        expect(searchCatalogMock).toHaveBeenCalledWith({
            query: "focus",
            categories: [],
            type: "podcast",
            cursor: null,
        });
    });

    it("offers Listen only on search results with audio", async () => {
        searchCatalogMock.mockResolvedValueOnce({
            outcome: "results",
            results: [
                {
                    id: "audio-item", type: "book", title: "Audio Book", author: null, category: "Business", cover_image_url: null,
                    duration_seconds: null, audio_url: "https://example.com/audio.mp3", created_at: "2026-09-17T00:00:00.000Z", quick_mode_json: {}, rank: 1,
                    snippet: { source: "Summary", text: "A matching snippet", highlights: [] },
                },
                {
                    id: "text-item", type: "book", title: "Text Book", author: null, category: "Business", cover_image_url: null,
                    duration_seconds: null, audio_url: null, created_at: "2026-09-17T00:00:00.000Z", quick_mode_json: {}, rank: 2,
                    snippet: { source: "Summary", text: "Another snippet", highlights: [] },
                },
            ],
            pageInfo: { nextCursor: null, previousCursor: null, page: 1 },
        });

        const results = await runSearchResultsFromPage({ q: "book" });
        await act(async () => { render(results); });

        expect(screen.getByRole("link", { name: "Listen to Audio Book" })).toHaveAttribute(
            "href",
            "/read/audio-item/audio-book#audio-player",
        );
        expect(screen.queryByRole("link", { name: "Listen to Text Book" })).not.toBeInTheDocument();
    });

    it("binds the next search page to its opaque cursor and preserves its filters in pagination links", async () => {
        searchCatalogMock.mockResolvedValueOnce({
            outcome: "results",
            results: [{
                id: "matched-result", type: "book", title: "Matched Result", author: null, category: "Business", cover_image_url: null,
                duration_seconds: null, audio_url: null, created_at: "2026-09-17T00:00:00.000Z", quick_mode_json: {}, rank: 1,
                snippet: { source: "Summary", text: "A matching snippet", highlights: [] },
            }],
            pageInfo: { nextCursor: "next-cursor", previousCursor: "previous-cursor", page: 2 },
        });
        const results = await runSearchResultsFromPage({ q: "focus", type: "book", cursor: "current-cursor" });

        expect(searchCatalogMock).toHaveBeenCalledWith(expect.objectContaining({ cursor: "current-cursor", type: "book" }));

        await act(async () => {
            render(results);
        });

        expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/search?q=focus&type=book&cursor=previous-cursor");
        expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/search?q=focus&type=book&cursor=next-cursor");
        expect(screen.getByText("Page 2")).toBeInTheDocument();
    });

    it("does not show a request-summary action when search has matching results", async () => {
        const results = await runSearchResultsFromPage({ q: "focus", type: "book" });

        await act(async () => {
            render(results);
        });

        expect(screen.getByText('1 result on this page for "focus" (book)')).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /request a summary/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /request this summary/i })).not.toBeInTheDocument();
    });

    it("shows a request-summary action when search has zero results", async () => {
        searchCatalogMock.mockResolvedValueOnce({ outcome: "no_results", results: [], pageInfo: { nextCursor: null, previousCursor: null, page: 1 } });
        const results = await runSearchResultsFromPage({ q: "focus", type: "book" });

        await act(async () => {
            render(results);
        });

        expect(screen.getByText('0 results on this page for "focus" (book)')).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /request this summary/i })).toHaveAttribute(
            "href",
            "/requests?prefill=focus&type=book"
        );
        expect(screen.getByText("We couldn't find anything matching that title, author, category, or filter.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Clear all filters" })).toHaveAttribute("href", "/search?q=focus");
    });

    it("offers to clear the query when a zero-result search has no filters", async () => {
        searchCatalogMock.mockResolvedValueOnce({ outcome: "no_results", results: [], pageInfo: { nextCursor: null, previousCursor: null, page: 1 } });
        const results = await runSearchResultsFromPage({ q: "Disney" });

        await act(async () => { render(results); });

        expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/search");
        expect(screen.queryByRole("link", { name: "Clear all filters" })).not.toBeInTheDocument();
    });

    it("renders stop-word-only input as an input outcome without a request action or zero-result event", async () => {
        searchCatalogMock.mockResolvedValueOnce({ outcome: "input_empty", results: [], pageInfo: { nextCursor: null, previousCursor: null, page: 1 } });
        const results = await runSearchResultsFromPage({ q: "the and or" });

        await act(async () => {
            render(results);
        });

        expect(screen.getByRole("heading", { name: "Try a more specific search" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "No results found" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /request this summary/i })).not.toBeInTheDocument();
        await waitFor(() => expect(captureAnalyticsEventMock).toHaveBeenCalledWith("search_input_empty", expect.any(Object)));
        expect(captureAnalyticsEventMock).not.toHaveBeenCalledWith("search_no_results", expect.any(Object));
        expect(captureAnalyticsEventMock).not.toHaveBeenCalledWith("search_performed", expect.any(Object));
    });

    it("uses the recent catalog query for category pages and still applies the type filter", async () => {
        await runRecentCatalogFromPage({ category: "Productivity", type: "article" });

        const queryBuilder = getLatestQueryBuilder();
        expect(rpcMock).toHaveBeenCalledWith("get_category_stats");
        expect(rpcMock).not.toHaveBeenCalledWith("get_trending_content", expect.anything());
        expect(queryBuilder?.eq).toHaveBeenCalledWith("category", "Productivity");
        expect(queryBuilder?.eq).toHaveBeenCalledWith("type", "article");
    });

    it("queries across duplicate raw variants for normalized topics", async () => {
        await runRecentCatalogFromPage({ category: "Business" });

        const queryBuilder = getLatestQueryBuilder();
        expect(queryBuilder?.in).toHaveBeenCalledWith("category", ["'Business'", "Business"]);
    });

    it("does not show a back-to-browse link on category-filtered search pages", async () => {
        await renderSearchPage({ category: "Productivity" });

        expect(screen.queryByRole("link", { name: /back to browse/i })).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Productivity Content" })).toBeInTheDocument();
    });

    it("highlights the selected category chip when a category is present", async () => {
        await renderSearchPage({ category: "Productivity" });

        expect(screen.getByRole("link", { name: "Productivity" })).toHaveClass("bg-primary");
        expect(screen.getByRole("link", { name: "All topics" })).not.toHaveClass("bg-primary");
    });

    it("normalizes raw deep links for display", async () => {
        await renderSearchPage({ category: "'Business'" });

        expect(screen.getByRole("heading", { name: "Business Content" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Business" })).toHaveClass("bg-primary");
    });

    it("redirects old category aliases to canonical search URLs", async () => {
        await expect(renderSearchPage({ category: "Mindset", type: "book" })).rejects.toThrow(
            "NEXT_REDIRECT:/search?category=Personal+Development&type=book"
        );

        expect(redirectMock).toHaveBeenCalledWith("/search?category=Personal+Development&type=book");
        expect(fromMock).not.toHaveBeenCalled();
    });

    it("preserves query and type when selecting a category chip", async () => {
        await renderSearchPage({ q: "focus", type: "podcast" });

        expect(screen.getByRole("link", { name: "Business" })).toHaveAttribute("href", "/search?q=focus&category=Business&type=podcast");
    });

    it("keeps a rapid Book then Business selection during the first navigation", async () => {
        window.history.replaceState(null, "", "/search?type=podcast");
        await renderSearchPage({ type: "podcast" });

        fireEvent.click(screen.getByRole("link", { name: "Book" }));
        fireEvent.click(screen.getByRole("link", { name: "Business" }));

        expect(routerPushMock).toHaveBeenCalledWith("/search?category=Business&type=book");
    });

    it("clears only the category when selecting all topics", async () => {
        await renderSearchPage({ q: "focus", type: "podcast", category: "Productivity" });

        expect(screen.getByRole("link", { name: "All topics" })).toHaveAttribute("href", "/search?q=focus&type=podcast");
    });

    it("keeps the selected category when switching type filters", async () => {
        await renderSearchPage({ category: "Productivity" });

        expect(screen.getByRole("link", { name: "Podcast" })).toHaveAttribute("href", "/search?category=Productivity&type=podcast");
        expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/search?category=Productivity");
    });

    it("preserves Popular mode when switching filters", async () => {
        await renderSearchPage({ category: "Productivity", sort: "popular" });
        await runPopularCatalogFromPage({ category: "Productivity", sort: "popular" });

        expect(screen.getByRole("link", { name: "Podcast" })).toHaveAttribute(
            "href",
            "/search?category=Productivity&type=podcast&sort=popular"
        );
        expect(rpcMock).toHaveBeenCalledWith("get_trending_content", {
            p_limit: 20,
            p_type: undefined,
            p_categories: ["Productivity"],
        });
    });

    it("renders remaining normalized topics in the dropdown", async () => {
        await renderSearchPage({});

        const select = screen.getByRole("combobox", { name: "More topics" });
        const optionLabels = Array.from(select.querySelectorAll("option")).map((option) => option.textContent);

        expect(optionLabels).toEqual(["More topics", "Religion & Spirituality"]);
    });

    it("groups reported topic variants without exposing the content-format category", async () => {
        const categories = [
            { category: "Self-help", count: 2 }, { category: "Self-Help", count: 1 },
            { category: "Decision Making", count: 1 }, { category: "Decision-Making", count: 1 },
            { category: "Science & Technology", count: 1 }, { category: "Science and Technology", count: 1 },
            { category: "book_summary", count: 1 },
        ];
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_category_stats") return Promise.resolve({ data: categories });
            throw new Error(`Unexpected RPC: ${fn}`);
        });

        await renderSearchPage({});
        const labels = Array.from(screen.getByRole("combobox", { name: "More topics" }).querySelectorAll("option"))
            .map((option) => option.textContent);
        for (const label of ["Self-Help", "Decision-Making", "Science & Technology"]) {
            expect(labels.filter((option) => option === label)).toHaveLength(1);
        }
        for (const label of ["Self-help", "Decision Making", "Science and Technology", "book_summary"]) {
            expect(labels).not.toContain(label);
        }

        for (const [label, rawValues] of [
            ["Self-Help", ["Self-help", "Self-Help"]],
            ["Decision-Making", ["Decision Making", "Decision-Making"]],
            ["Science & Technology", ["Science & Technology", "Science and Technology"]],
        ] as const) {
            await runSearchResultsFromPage({ q: "focus", category: label });
            const actual = searchCatalogMock.mock.lastCall?.[0].categories as string[];
            expect(actual).toHaveLength(2);
            expect(actual).toEqual(expect.arrayContaining([...rawValues]));
        }

        await runRecentCatalogFromPage({ category: "Self-Help" });
        expect(getLatestQueryBuilder()?.in).toHaveBeenCalledWith("category", expect.arrayContaining(["Self-help", "Self-Help"]));
    });

    it("redirects old topic spellings and the internal content-format category", async () => {
        await expect(loadSearchPage({ q: "focus", category: "Self-help" })).rejects.toThrow("NEXT_REDIRECT");
        expect(redirectMock).toHaveBeenCalledWith("/search?q=focus&category=Self-Help");

        await expect(loadSearchPage({ q: "focus", category: "book_summary", type: "book", cursor: "old-cursor" })).rejects.toThrow("NEXT_REDIRECT");
        expect(redirectMock).toHaveBeenCalledWith("/search?q=focus&type=book");
    });

    it("reflects a selected non-curated topic in the dropdown", async () => {
        await renderSearchPage({ category: "Religion & Spirituality" });

        expect(screen.getByRole("combobox", { name: "More topics" })).toHaveValue("Religion & Spirituality");
    });

    it("preserves query and type when selecting a dropdown topic", async () => {
        window.history.replaceState(null, "", "/search?q=focus&type=podcast");
        await renderSearchPage({ q: "focus", type: "podcast" });

        fireEvent.change(screen.getByRole("combobox", { name: "More topics" }), {
            target: { value: "Religion & Spirituality" },
        });

        expect(routerPushMock).toHaveBeenCalledWith("/search?q=focus&category=Religion+%26+Spirituality&type=podcast");
    });

    it("treats invalid type params as the default All state", async () => {
        await renderSearchPage({ type: "invalid", sort: "popular" });

        expect(screen.getByRole("link", { name: "All" })).toHaveClass("bg-primary");
        expect(screen.getByRole("link", { name: "Podcast" })).toHaveAttribute("href", "/search?type=podcast&sort=popular");
        expect(rpcMock).toHaveBeenCalledWith("get_trending_content", {
            p_limit: 20,
            p_type: undefined,
            p_categories: undefined,
        });
    });

    it("passes reserved punctuation to the parameterized search service", async () => {
        await runSearchResultsFromPage({ q: "focus, deep" });

        expect(searchCatalogMock).toHaveBeenCalledWith(expect.objectContaining({ query: "focus, deep" }));
    });

    it("passes SQL wildcard characters as data to the parameterized search service", async () => {
        await runSearchResultsFromPage({ q: "100%_focus" });

        expect(searchCatalogMock).toHaveBeenCalledWith(expect.objectContaining({ query: "100%_focus" }));
    });

    it("keeps the search input stack layer above the filter row", async () => {
        await renderSearchPage({});

        const searchInputWrapper = screen.getByTestId("search-input").parentElement;
        const filterRow = screen.getByRole("link", { name: "All" }).parentElement;

        expect(searchInputWrapper).toHaveClass("z-20");
        expect(filterRow?.className).not.toContain("z-10");
    });
});
