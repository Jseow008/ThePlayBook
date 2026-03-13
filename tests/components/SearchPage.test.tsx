import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SearchPage from "@/app/(public)/search/page";

const rpcMock = vi.fn();

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: () => ({
        rpc: rpcMock,
    }),
}));

vi.mock("@/components/ui/SearchInput", () => ({
    SearchInput: () => <div data-testid="search-input">Search Input</div>,
}));

vi.mock("@/components/ui/ContentCard", () => ({
    ContentCard: ({ item }: { item: { title: string } }) => <div>{item.title}</div>,
}));

describe("SearchPage", () => {
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
