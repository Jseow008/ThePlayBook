import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "@/components/ui/SearchInput";

const { routerPushMock } = vi.hoisted(() => ({
    routerPushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: routerPushMock,
    }),
}));

describe("SearchInput", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows recent searches on focus when local storage has entries", async () => {
        vi.mocked(window.localStorage.getItem).mockReturnValue(JSON.stringify(["Deep Work", "Atomic Habits"]));

        render(<SearchInput />);

        const input = screen.getByPlaceholderText("Search by title, author, or keyword...");
        fireEvent.focus(input);

        await waitFor(() => {
            expect(screen.getByText("Recent Searches")).toBeInTheDocument();
        });

        expect(screen.getByText("Deep Work")).toBeInTheDocument();
        expect(screen.getByText("Atomic Habits")).toBeInTheDocument();
    });

    it("keeps recent-search navigation working from the dropdown", async () => {
        vi.mocked(window.localStorage.getItem).mockReturnValue(JSON.stringify(["Deep Work"]));

        render(<SearchInput />);

        const input = screen.getByPlaceholderText("Search by title, author, or keyword...");
        fireEvent.focus(input);

        const recentSearchButton = await screen.findByRole("button", { name: /deep work/i });
        fireEvent.click(recentSearchButton);

        expect(routerPushMock).toHaveBeenCalledWith("/search?q=Deep+Work");
        expect(window.localStorage.setItem).toHaveBeenCalledWith(
            "flux_recent_searches",
            JSON.stringify(["Deep Work"])
        );
    });

    it("preserves the selected type when clearing an active query", () => {
        render(<SearchInput initialQuery="Deep Work" type="book" />);

        fireEvent.click(screen.getByRole("button", { name: /clear search/i }));

        expect(routerPushMock).toHaveBeenCalledWith("/search?type=book");
    });
});
