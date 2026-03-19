import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock, getLatestQueryBuilder, resetSupabaseMocks, routerPushMock } = vi.hoisted(() => {
    let latestQueryBuilder: Record<string, ReturnType<typeof vi.fn>> | null = null;

    const createQueryBuilder = () => {
        const builder = {
            select: vi.fn(),
            eq: vi.fn(),
            in: vi.fn(),
            is: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(),
            or: vi.fn(),
            then: vi.fn(),
        };

        builder.select.mockReturnValue(builder);
        builder.eq.mockReturnValue(builder);
        builder.in.mockReturnValue(builder);
        builder.is.mockReturnValue(builder);
        builder.order.mockReturnValue(builder);
        builder.limit.mockReturnValue(builder);
        builder.or.mockReturnValue(builder);
        builder.then.mockImplementation((resolve: (value: { data: Array<{ title: string }> }) => unknown) =>
            Promise.resolve(resolve({ data: [{ id: "matched-result", title: "Matched Result" }] }))
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
        },
        routerPushMock: vi.fn(),
    };
});

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: routerPushMock,
    }),
}));

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: React.ReactNode;
        href: string | { pathname?: string; query?: Record<string, string | undefined> };
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
            <a href={resolvedHref} {...props}>
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

vi.mock("@/components/ui/SearchInput", () => ({
    SearchInput: () => <div data-testid="search-input">Search Input</div>,
}));

vi.mock("@/components/ui/ContentCard", () => ({
    ContentCard: ({ item }: { item: { title: string } }) => <div>{item.title}</div>,
}));

async function renderSearchPage(searchParams: { q?: string; category?: string; type?: string } = {}) {
    const { default: SearchPage } = await import("@/app/(public)/search/page");
    return render(await SearchPage({ searchParams: Promise.resolve(searchParams) }));
}

describe("SearchPage", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        resetSupabaseMocks();
        routerPushMock.mockReset();
        rpcMock.mockImplementation((fn: string, args?: Record<string, unknown>) => {
            if (fn === "get_category_stats") {
                return Promise.resolve({
                    data: [
                        { category: "Business", count: 6 },
                        { category: "'Business'", count: 2 },
                        { category: "Finance", count: 4 },
                        { category: "Productivity", count: 5 },
                        { category: "Health", count: 3 },
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

    it("loads default trending items when no query or category is present", async () => {
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_category_stats") {
                return Promise.resolve({
                    data: [
                        { category: "Business", count: 6 },
                        { category: "'Business'", count: 2 },
                        { category: "Productivity", count: 5 },
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
        expect(rpcMock).toHaveBeenCalledWith("get_trending_content", {
            p_limit: 10,
            p_type: null,
        });
        expect(screen.getByText("Trending Now")).toBeInTheDocument();
        expect(screen.getByText("Trending Item")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "All topics" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Business" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Productivity" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Psychology" })).not.toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Others" })).toBeInTheDocument();
        expect(fromMock).not.toHaveBeenCalled();
    });

    it("loads type-filtered trending items when only a type is selected", async () => {
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
                return Promise.resolve({
                    data: [{ id: "deep-work", title: "Deep Work" }],
                });
            }

            throw new Error(`Unexpected RPC: ${fn}`);
        });

        await renderSearchPage({ type: "book" });

        expect(rpcMock).toHaveBeenCalledWith("get_category_stats");
        expect(rpcMock).toHaveBeenCalledWith("get_trending_content", {
            p_limit: 10,
            p_type: "book",
        });
        expect(screen.getByText("Trending Books")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Mindset" })).toBeInTheDocument();
        expect(fromMock).not.toHaveBeenCalled();
    });

    it("uses the main results query for text search and applies the type filter", async () => {
        await renderSearchPage({ q: "focus", type: "podcast" });

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith("content_item");
        });

        const queryBuilder = getLatestQueryBuilder();
        expect(rpcMock).toHaveBeenCalledWith("get_category_stats");
        expect(rpcMock).not.toHaveBeenCalledWith("get_trending_content", expect.anything());
        expect(queryBuilder?.eq).toHaveBeenCalledWith("type", "podcast");
        expect(queryBuilder?.or).toHaveBeenCalledWith("title.ilike.%focus%,author.ilike.%focus%,category.ilike.%focus%");
    });

    it("uses the main results query for category pages and still applies the type filter", async () => {
        await renderSearchPage({ category: "Productivity", type: "article" });

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith("content_item");
        });

        const queryBuilder = getLatestQueryBuilder();
        expect(rpcMock).toHaveBeenCalledWith("get_category_stats");
        expect(rpcMock).not.toHaveBeenCalledWith("get_trending_content", expect.anything());
        expect(queryBuilder?.eq).toHaveBeenCalledWith("category", "Productivity");
        expect(queryBuilder?.eq).toHaveBeenCalledWith("type", "article");
    });

    it("queries across duplicate raw variants for normalized topics", async () => {
        await renderSearchPage({ category: "Business" });

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith("content_item");
        });

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

    it("preserves query and type when selecting a category chip", async () => {
        await renderSearchPage({ q: "focus", type: "podcast" });

        expect(screen.getByRole("link", { name: "Business" })).toHaveAttribute("href", "/search?q=focus&category=Business&type=podcast");
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

    it("renders remaining normalized topics in the dropdown", async () => {
        await renderSearchPage({});

        const select = screen.getByRole("combobox", { name: "Others" });
        const optionLabels = Array.from(select.querySelectorAll("option")).map((option) => option.textContent);

        expect(optionLabels).toEqual(["Others", "Christian", "Psychology"]);
    });

    it("reflects a selected non-curated topic in the dropdown", async () => {
        await renderSearchPage({ category: "Psychology" });

        expect(screen.getByRole("combobox", { name: "Others" })).toHaveValue("Psychology");
    });

    it("preserves query and type when selecting a dropdown topic", async () => {
        await renderSearchPage({ q: "focus", type: "podcast" });

        fireEvent.change(screen.getByRole("combobox", { name: "Others" }), {
            target: { value: "Psychology" },
        });

        expect(routerPushMock).toHaveBeenCalledWith("/search?q=focus&category=Psychology&type=podcast");
    });

    it("keeps the search input stack layer above the filter row", async () => {
        await renderSearchPage({});

        const searchInputWrapper = screen.getByTestId("search-input").parentElement;
        const filterRow = screen.getByRole("link", { name: "All" }).parentElement;

        expect(searchInputWrapper).toHaveClass("z-20");
        expect(filterRow?.className).not.toContain("z-10");
    });
});
