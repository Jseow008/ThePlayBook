import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchPage from "@/app/(public)/search/page";

const { rpcMock, fromMock, getLatestQueryBuilder, resetSupabaseMocks } = vi.hoisted(() => {
    let latestQueryBuilder: Record<string, ReturnType<typeof vi.fn>> | null = null;

    const createQueryBuilder = () => {
        const builder = {
            select: vi.fn(),
            eq: vi.fn(),
            is: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(),
            or: vi.fn(),
            then: vi.fn(),
        };

        builder.select.mockReturnValue(builder);
        builder.eq.mockReturnValue(builder);
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
    };
});

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string | { pathname?: string } }) => (
        <a href={typeof href === "string" ? href : href.pathname || ""} {...props}>
            {children}
        </a>
    ),
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

describe("SearchPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetSupabaseMocks();
    });

    it("loads default trending items when no query or category is present", async () => {
        rpcMock.mockResolvedValue({
            data: [{ id: "trending-item", title: "Trending Item" }],
        });

        render(await SearchPage({ searchParams: Promise.resolve({}) }));

        expect(rpcMock).toHaveBeenCalledWith("get_trending_content", {
            p_limit: 10,
            p_type: null,
        });
        expect(screen.getByText("Trending Now")).toBeInTheDocument();
        expect(screen.getByText("Trending Item")).toBeInTheDocument();
        expect(fromMock).not.toHaveBeenCalled();
    });

    it("loads type-filtered trending items when only a type is selected", async () => {
        rpcMock.mockResolvedValue({
            data: [{ id: "deep-work", title: "Deep Work" }],
        });

        render(await SearchPage({ searchParams: Promise.resolve({ type: "book" }) }));

        expect(rpcMock).toHaveBeenCalledWith("get_trending_content", {
            p_limit: 10,
            p_type: "book",
        });
        expect(screen.getByText("Trending Books")).toBeInTheDocument();
        expect(fromMock).not.toHaveBeenCalled();
    });

    it("uses the main results query for text search and applies the type filter", async () => {
        rpcMock.mockResolvedValue({
            data: [{ title: "Should Not Render" }],
        });

        render(await SearchPage({ searchParams: Promise.resolve({ q: "focus", type: "podcast" }) }));

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith("content_item");
        });

        const queryBuilder = getLatestQueryBuilder();
        expect(rpcMock).not.toHaveBeenCalled();
        expect(queryBuilder?.eq).toHaveBeenCalledWith("type", "podcast");
        expect(queryBuilder?.or).toHaveBeenCalledWith("title.ilike.%focus%,author.ilike.%focus%,category.ilike.%focus%");
    });

    it("uses the main results query for category pages and still applies the type filter", async () => {
        rpcMock.mockResolvedValue({
            data: [{ title: "Should Not Render" }],
        });

        render(await SearchPage({ searchParams: Promise.resolve({ category: "Productivity", type: "article" }) }));

        await waitFor(() => {
            expect(fromMock).toHaveBeenCalledWith("content_item");
        });

        const queryBuilder = getLatestQueryBuilder();
        expect(rpcMock).not.toHaveBeenCalled();
        expect(queryBuilder?.eq).toHaveBeenCalledWith("category", "Productivity");
        expect(queryBuilder?.eq).toHaveBeenCalledWith("type", "article");
    });

    it("keeps the search input stack layer above the filter row", async () => {
        rpcMock.mockResolvedValue({
            data: [],
        });

        render(await SearchPage({ searchParams: Promise.resolve({}) }));

        const searchInputWrapper = screen.getByTestId("search-input").parentElement;
        const filterRow = screen.getByRole("link", { name: "All" }).parentElement;

        expect(searchInputWrapper).toHaveClass("z-20");
        expect(filterRow?.className).not.toContain("z-10");
    });
});
