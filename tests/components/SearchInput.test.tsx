import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchInput } from "@/components/ui/SearchInput";

const { routerPushMock, routerReplaceMock } = vi.hoisted(() => ({
    routerPushMock: vi.fn(),
    routerReplaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: routerPushMock,
        replace: routerReplaceMock,
    }),
}));

describe("SearchInput", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
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

        const recentSearchButton = await screen.findByRole("button", { name: /^deep work$/i });
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

        expect(routerReplaceMock).toHaveBeenCalledWith("/search?type=book");
    });

    it("keeps the dropdown open when removing a recent search", async () => {
        vi.mocked(window.localStorage.getItem).mockReturnValue(
            JSON.stringify(["Deep Work", "Atomic Habits", "Outlive", "The Almanack", "Essentialism"])
        );

        render(<SearchInput />);

        const input = screen.getByPlaceholderText("Search by title, author, or keyword...");
        fireEvent.focus(input);

        await screen.findByText("Recent Searches");

        const removeButton = screen.getByRole("button", { name: /remove atomic habits from recent searches/i });

        fireEvent.mouseDown(removeButton);
        fireEvent.click(removeButton);

        expect(screen.getByText("Recent Searches")).toBeInTheDocument();
        expect(screen.queryByText("Atomic Habits")).not.toBeInTheDocument();
        expect(screen.getByText("Deep Work")).toBeInTheDocument();
        expect(screen.getByText("Outlive")).toBeInTheDocument();
        expect(screen.getByText("The Almanack")).toBeInTheDocument();
        expect(screen.getByText("Essentialism")).toBeInTheDocument();
        expect(routerPushMock).not.toHaveBeenCalled();
        expect(window.localStorage.setItem).toHaveBeenCalledWith(
            "flux_recent_searches",
            JSON.stringify(["Deep Work", "Outlive", "The Almanack", "Essentialism"])
        );
    });

    it("syncs the input value when the route-provided query changes", () => {
        const view = render(<SearchInput initialQuery="Deep Work" />);
        const input = screen.getByRole("searchbox");

        expect(input).toHaveValue("Deep Work");

        view.rerender(<SearchInput initialQuery="Atomic Habits" />);

        expect(input).toHaveValue("Atomic Habits");
    });

    it("uses replace for debounced query changes so typing does not spam browser history", async () => {
        vi.useFakeTimers();

        render(<SearchInput />);

        fireEvent.change(screen.getByRole("searchbox"), {
            target: { value: "Focus" },
        });

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(routerReplaceMock).toHaveBeenCalledWith("/search?q=Focus");
        expect(routerPushMock).not.toHaveBeenCalled();
    });

    it("removes the query from the URL when the user deletes the last character", async () => {
        vi.useFakeTimers();

        render(<SearchInput initialQuery="Focus" type="book" />);

        fireEvent.change(screen.getByRole("searchbox"), {
            target: { value: "" },
        });

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(routerReplaceMock).toHaveBeenCalledWith("/search?type=book");
    });
});
