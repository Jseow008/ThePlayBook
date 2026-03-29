import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrainClientPage } from "@/app/(public)/notes/client-page";
import type { HighlightsPage } from "@/hooks/useHighlights";
import { vi } from "vitest";

const {
    deleteHighlightMock,
    fetchNextPageMock,
    toastSuccessMock,
    toastErrorMock,
    infiniteHighlightsState,
} = vi.hoisted(() => ({
    deleteHighlightMock: vi.fn(),
    fetchNextPageMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    infiniteHighlightsState: {
        value: {
            data: undefined as
                | {
                    pages: HighlightsPage[];
                    pageParams: Array<string | null>;
                }
                | undefined,
            fetchNextPage: vi.fn(),
            hasNextPage: false,
            isFetchingNextPage: false,
            isLoading: false,
            isError: false,
        },
    },
}));

const notesAskPanelMock = vi.fn();
const routerReplaceMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock("@/hooks/useHighlights", () => ({
    useInfiniteHighlights: () => infiniteHighlightsState.value,
    useDeleteHighlight: () => ({
        mutateAsync: deleteHighlightMock,
        isPending: false,
    }),
}));

vi.mock("sonner", () => ({
    toast: {
        success: toastSuccessMock,
        error: toastErrorMock,
    },
}));

vi.mock("@/components/notes/NotesAskPanel", () => ({
    NotesAskPanel: (props: any) => {
        notesAskPanelMock(props);
        return <div data-testid="notes-ask-panel">Notes AI Panel</div>;
    },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        replace: routerReplaceMock,
        push: routerPushMock,
    }),
    usePathname: () => "/notes",
    useSearchParams: () => new URLSearchParams(""),
}));

describe("BrainClientPage", () => {
    const initialPage: HighlightsPage = {
        data: [
            {
                id: "highlight-1",
                user_id: "user-1",
                content_item_id: "content-1",
                segment_id: "seg-1",
                highlighted_text: "The highlighted passage",
                note_body: "?",
                color: "blue",
                anchor_start: 0,
                anchor_end: 10,
                created_at: "2026-03-11T12:00:00.000Z",
                updated_at: null,
                content_item: {
                    id: "content-1",
                    title: "Can't Hurt Me",
                    author: "David Goggins",
                    cover_image_url: "https://example.com/cover-1.jpg",
                },
                segment: {
                    id: "seg-1",
                    title: "Introduction",
                },
            },
            {
                id: "highlight-2",
                user_id: "user-1",
                content_item_id: "content-2",
                segment_id: "seg-2",
                highlighted_text: "A second highlight",
                note_body: null,
                color: "yellow",
                anchor_start: 20,
                anchor_end: 30,
                created_at: "2026-03-10T12:00:00.000Z",
                updated_at: null,
                content_item: {
                    id: "content-2",
                    title: "12 Rules for Life",
                    author: "Jordan Peterson",
                    cover_image_url: null,
                },
                segment: {
                    id: "seg-2",
                    title: "Chapter 1",
                },
            },
            {
                id: "highlight-3",
                user_id: "user-1",
                content_item_id: "content-1",
                segment_id: "seg-3",
                highlighted_text: "Whitespace note highlight",
                note_body: "   ",
                color: "green",
                anchor_start: 40,
                anchor_end: 55,
                created_at: "2026-03-09T12:00:00.000Z",
                updated_at: null,
                content_item: {
                    id: "content-1",
                    title: "Can't Hurt Me",
                    author: "David Goggins",
                    cover_image_url: "https://example.com/cover-1.jpg",
                },
                segment: {
                    id: "seg-3",
                    title: "Chapter 3",
                },
            },
        ],
        nextCursor: "2026-03-09T12:00:00.000Z",
    };

    beforeEach(() => {
        vi.clearAllMocks();
        notesAskPanelMock.mockClear();
        routerReplaceMock.mockClear();
        routerPushMock.mockClear();
        document.body.style.overflow = "";
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            writable: true,
            value: 1280,
        });
        fetchNextPageMock.mockResolvedValue(undefined);
        infiniteHighlightsState.value = {
            data: {
                pages: [initialPage],
                pageParams: [null],
            },
            fetchNextPage: fetchNextPageMock,
            hasNextPage: true,
            isFetchingNextPage: false,
            isLoading: false,
            isError: false,
        };
    });

    it("renders list rows with note hierarchy and jump links", () => {
        render(<BrainClientPage initialPage={initialPage} />);

        expect(screen.getByRole("link", { name: /note from introduction/i })).toHaveAttribute(
            "href",
            "/read/content-1?highlightId=highlight-1"
        );
        expect(screen.getByText("?")).toBeInTheDocument();
        expect(screen.getByText("Introduction")).toBeInTheDocument();
        expect(screen.getByText("Note")).toBeInTheDocument();
        expect(screen.getAllByText("Highlight").length).toBeGreaterThan(0);
        expect(screen.queryByText("   ")).not.toBeInTheDocument();
    });

    it("filters by search, type, and color and supports inline two-step deletion", async () => {
        deleteHighlightMock.mockResolvedValue("highlight-1");

        render(<BrainClientPage initialPage={initialPage} />);

        fireEvent.change(screen.getAllByPlaceholderText(/search notes/i)[0], {
            target: { value: "second" },
        });
        expect(screen.getByText(/second highlight/i)).toBeInTheDocument();
        expect(screen.queryByText(/highlighted passage/i)).not.toBeInTheDocument();

        fireEvent.change(screen.getAllByDisplayValue("All types")[0], {
            target: { value: "note" },
        });
        expect(screen.queryByText("A second highlight")).not.toBeInTheDocument();

        fireEvent.change(screen.getAllByPlaceholderText(/search notes/i)[0], {
            target: { value: "" },
        });
        fireEvent.change(screen.getAllByDisplayValue("Notes")[0], {
            target: { value: "all" },
        });
        fireEvent.change(screen.getAllByDisplayValue("All colors")[0], {
            target: { value: "blue" },
        });

        expect(screen.getByText(/highlighted passage/i)).toBeInTheDocument();
        expect(screen.queryByText(/second highlight/i)).not.toBeInTheDocument();

        fireEvent.click(screen.getByLabelText("Delete note"));

        expect(deleteHighlightMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText("Confirm delete note"));

        await waitFor(() => {
            expect(deleteHighlightMock).toHaveBeenCalledWith("highlight-1");
        });
    });

    it("loads more notes when another page is available", async () => {
        render(<BrainClientPage initialPage={initialPage} />);

        fireEvent.click(screen.getByRole("button", { name: /load more notes/i }));

        await waitFor(() => {
            expect(fetchNextPageMock).toHaveBeenCalled();
        });
    });

    it("opens the notes AI panel with the current filtered scope", async () => {
        render(<BrainClientPage initialPage={initialPage} />);

        fireEvent.click(screen.getByRole("button", { name: /ask these notes/i }));

        expect((await screen.findAllByTestId("notes-ask-panel")).length).toBeGreaterThan(0);
        expect(
            screen
                .getAllByRole("button", { name: /close notes ai/i })
                .find((button) => button.getAttribute("aria-pressed") === "true")
        ).toBeTruthy();
        expect(notesAskPanelMock).toHaveBeenCalledWith(
            expect.objectContaining({
                currentScope: expect.objectContaining({
                    noteCount: 3,
                    totalMatches: 3,
                    highlightIds: ["highlight-1", "highlight-2", "highlight-3"],
                    summary: "All content",
                }),
                onClose: expect.any(Function),
            })
        );
    });

    it("starts with the notes AI panel open when initialAskOpen is true", async () => {
        render(<BrainClientPage initialPage={initialPage} initialAskOpen />);

        expect((await screen.findAllByTestId("notes-ask-panel")).length).toBeGreaterThan(0);
        expect(
            screen
                .getAllByRole("button", { name: /close notes ai/i })
                .find((button) => button.getAttribute("aria-pressed") === "true")
        ).toBeTruthy();
    });

    it("routes mobile ask entry to the full-screen notes ask page", () => {
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            writable: true,
            value: 390,
        });

        render(<BrainClientPage initialPage={initialPage} />);

        fireEvent.click(screen.getAllByRole("button", { name: /ask/i })[0]);

        expect(routerPushMock).toHaveBeenCalledWith(
            expect.stringContaining("/ask?scope=notes")
        );
        expect(routerPushMock).toHaveBeenCalledWith(
            expect.stringContaining("returnTo=%2Fnotes")
        );
    });

    it("does not lock body scroll for the desktop ask sidebar", async () => {
        render(<BrainClientPage initialPage={initialPage} initialAskOpen />);

        expect((await screen.findAllByTestId("notes-ask-panel")).length).toBeGreaterThan(0);
        expect(document.body.style.overflow).toBe("");
    });
});
