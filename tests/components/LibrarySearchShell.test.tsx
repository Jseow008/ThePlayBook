import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibrarySearchShell } from "@/components/ui/LibrarySearchShell";

const mocks = vi.hoisted(() => ({
    batch: vi.fn(),
    library: {
        completedIds: ["shared", "completed"],
        inProgressIds: ["shared"],
        isLoaded: true,
        myListIds: ["shared", "saved"],
    },
}));

vi.mock("@/hooks/useReadingProgress", () => ({ useReadingProgress: () => mocks.library }));
vi.mock("@/hooks/use-content-queries", () => ({ useBatchContentItems: mocks.batch }));
vi.mock("@/components/ui/LibraryNav", () => ({ LibraryNav: () => <nav>Library views</nav> }));
vi.mock("@/components/ui/ContentCard", () => ({
    ContentCard: ({ item }: { item: { title: string } }) => <div>{item.title}</div>,
}));

describe("LibrarySearchShell", () => {
    beforeEach(() => {
        mocks.batch.mockReset();
        mocks.batch.mockReturnValue({
            data: [
                { id: "shared", title: "Thinking Clearly", author: "Alex", audio_url: "https://example.com/audio.mp3" },
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

    it("finds title or author across views and shows every applicable status", () => {
        render(<LibrarySearchShell><p>Saved view</p></LibrarySearchShell>);

        fireEvent.change(screen.getByRole("searchbox", { name: "Search your entire library" }), {
            target: { value: "Alex" },
        });

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
        expect(screen.getByText("Saved view")).toBeInTheDocument();
    });
});
