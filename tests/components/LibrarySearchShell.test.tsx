import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibrarySearchShell } from "@/components/ui/LibrarySearchShell";
import ContinueReadingPage from "@/app/(public)/library/reading/page";

const mocks = vi.hoisted(() => ({
    batch: vi.fn(),
    library: {
        completedIds: ["shared", "completed"],
        inProgressIds: ["shared"],
        isLoaded: true,
        isCheckingLibrary: false,
        hydrationStatus: "ready",
        hydrationIssue: null,
        retryHydration: vi.fn(),
        myListIds: ["shared", "saved"],
        getProgress: () => ({ completed: ["first"], totalSegments: 3 }),
        archiveFromProgressList: vi.fn(),
        restoreProgressListArchive: vi.fn(),
    },
}));

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/hooks/useReadingProgress", () => ({ useReadingProgress: () => mocks.library }));
vi.mock("@/hooks/use-content-queries", () => ({ useBatchContentItems: mocks.batch }));
vi.mock("@/components/ui/LibraryNav", () => ({ LibraryNav: () => <nav>Library views</nav> }));
vi.mock("@/components/ui/ContentCard", () => ({
    ContentCard: ({ item }: { item: { title: string } }) => <div>{item.title}</div>,
}));

describe("LibrarySearchShell", () => {
    beforeEach(() => {
        window.history.replaceState(null, "", "/library/reading");
        mocks.library.isCheckingLibrary = false;
        mocks.library.hydrationStatus = "ready";
        mocks.library.isLoaded = true;
        mocks.batch.mockReset();
        mocks.batch.mockReturnValue({
            data: [
                { id: "shared", title: "Thinking Clearly", author: "Alex", type: "book", audio_url: "https://example.com/audio.mp3" },
                { id: "saved", title: "Another Book", author: "Taylor" },
                { id: "completed", title: "Other Work", author: "Jordan" },
            ],
            isError: false,
            isLoading: false,
            refetch: vi.fn(),
        });
    });

    it("keeps the normal view and defers the combined fetch until search", () => {
        render(<LibrarySearchShell><p>Saved view</p></LibrarySearchShell>);

        expect(screen.getByText("Saved view")).toBeInTheDocument();
        expect(screen.getByText("Library views")).toBeInTheDocument();
        expect(mocks.batch).toHaveBeenCalledWith(["shared", "saved", "completed"], { enabled: false });
    });

    it("identifies the saved copy while the latest library is checked", () => {
        mocks.library.isCheckingLibrary = true;
        render(<LibrarySearchShell><p>Saved view</p></LibrarySearchShell>);
        expect(screen.getByRole("status")).toHaveTextContent("Showing your saved library while checking for updates");
        expect(screen.getByText("Saved view")).toBeVisible();
    });

    it("offers recovery when an initial library check fails", () => {
        mocks.library.isLoaded = false;
        mocks.library.hydrationStatus = "error";
        render(<LibrarySearchShell><p>Loading library</p></LibrarySearchShell>);
        expect(screen.getByRole("alert")).toHaveTextContent("Could not load your library.");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mocks.library.retryHydration).toHaveBeenCalledTimes(1);
    });

    it("finds title or author across views and shows every applicable status", () => {
        const { rerender } = render(<LibrarySearchShell><p>Saved view</p></LibrarySearchShell>);

        fireEvent.change(screen.getByRole("searchbox", { name: "Search your entire library" }), {
            target: { value: "Alex" },
        });
        // Next's native History API integration updates useSearchParams.
        rerender(<LibrarySearchShell><p>Saved view</p></LibrarySearchShell>);

        expect(mocks.batch).toHaveBeenLastCalledWith(["shared", "saved", "completed"], { enabled: true });
        expect(screen.getByText("Thinking Clearly")).toBeInTheDocument();
        expect(screen.queryByText("Another Book")).not.toBeInTheDocument();
        expect(screen.getByText("In progress")).toBeInTheDocument();
        expect(screen.getByText("Saved")).toBeInTheDocument();
        expect(screen.getByText("Completed")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Listen to Thinking Clearly" })).toHaveAttribute(
            "href",
            "/read/shared/thinking-clearly#audio-player",
        );
        expect(screen.queryByText("Saved view")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Clear library search" }));
        rerender(<LibrarySearchShell><p>Saved view</p></LibrarySearchShell>);
        expect(screen.getByText("Saved view")).toBeInTheDocument();
    });

    it.each(["/preview/shared", "/read/shared/thinking-clearly"])(
        "restores exact search and results after returning from %s",
        (destination) => {
            window.history.replaceState(null, "", "/library/reading?filter=book&sort=title#saved");
            const { unmount } = render(<LibrarySearchShell><p>Reading view</p></LibrarySearchShell>);
            const historyLength = window.history.length;
            fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  Alex  " } });
            const libraryHref = window.location.href;
            expect(new URL(libraryHref).searchParams.get("q")).toBe("  Alex  ");
            expect(window.history.length).toBe(historyLength);
            unmount();
            window.history.replaceState(null, "", destination);
            // Simulate the history destination restored by browser Back; native Back is checked in-browser.
            window.history.replaceState(null, "", libraryHref);
            render(<LibrarySearchShell><p>Reading view</p></LibrarySearchShell>);
            expect(screen.getByRole("searchbox")).toHaveValue("  Alex  ");
            expect(screen.getByRole("heading", { name: "Library results" })).toBeInTheDocument();
            expect(screen.getByText("Thinking Clearly")).toBeInTheDocument();
            expect(window.location.search).toContain("filter=book&sort=title");
            expect(window.location.hash).toBe("#saved");
        },
    );

    it("retains the latest query before immediate navigation and clears only search", () => {
        const { rerender } = render(<LibrarySearchShell><p>Reading view</p></LibrarySearchShell>);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Thinking" } });
        // Another control changes the URL before the search hook has rendered again.
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}&filter=book&sort=title&keep=yes#saved`);
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Taylor & Jordan" } });
        expect(new URLSearchParams(window.location.search).get("q")).toBe("Taylor & Jordan");
        expect(window.location.search).toContain("filter=book&sort=title&keep=yes");
        rerender(<LibrarySearchShell><p>Reading view</p></LibrarySearchShell>);
        fireEvent.click(screen.getByRole("button", { name: "Clear library search" }));
        rerender(<LibrarySearchShell><p>Reading view</p></LibrarySearchShell>);
        expect(window.location.search).toBe("?filter=book&sort=title&keep=yes");
        expect(window.location.hash).toBe("#saved");
        expect(screen.getByRole("searchbox")).toHaveValue("");
        expect(screen.getByText("Reading view")).toBeInTheDocument();
    });

    it("follows restored URL state while mounted and does not reuse stale results", () => {
        window.history.replaceState(null, "", "/library/completed?q=Alex");
        const { rerender } = render(<LibrarySearchShell><p>Completed view</p></LibrarySearchShell>);
        expect(screen.getByText("Thinking Clearly")).toBeInTheDocument();
        window.history.replaceState(null, "", "/library/completed?q=Taylor");
        rerender(<LibrarySearchShell><p>Completed view</p></LibrarySearchShell>);
        expect(screen.getByRole("searchbox")).toHaveValue("Taylor");
        expect(screen.getByText("Another Book")).toBeInTheDocument();
        expect(screen.queryByText("Thinking Clearly")).not.toBeInTheDocument();
    });

    it("reveals the retained Book and A-Z controls when restored search is cleared", () => {
        const { rerender, unmount } = render(<LibrarySearchShell><ContinueReadingPage /></LibrarySearchShell>);
        fireEvent.click(screen.getByRole("button", { name: "book" }));
        fireEvent.change(screen.getByRole("combobox", { name: "Sort library items" }), { target: { value: "title" } });
        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Alex" } });
        rerender(<LibrarySearchShell><ContinueReadingPage /></LibrarySearchShell>);
        expect(screen.getByRole("heading", { name: "Library results" })).toBeInTheDocument();
        unmount();
        const restored = render(<LibrarySearchShell><ContinueReadingPage /></LibrarySearchShell>);
        expect(screen.getByRole("searchbox")).toHaveValue("Alex");
        fireEvent.click(screen.getByRole("button", { name: "Clear library search" }));
        restored.rerender(<LibrarySearchShell><ContinueReadingPage /></LibrarySearchShell>);
        expect(screen.getByRole("heading", { name: "Continue Reading" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "book" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("combobox", { name: "Sort library items" })).toHaveValue("title");
        expect(window.location.search).toBe("?filter=book&sort=title");
    });
});
