import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotesDrawer } from "@/components/reader/NotesDrawer";
import { vi } from "vitest";
import type { HighlightWithContent } from "@/hooks/useHighlights";

const {
    deleteHighlightMock,
    toastSuccessMock,
    toastErrorMock,
} = vi.hoisted(() => ({
    deleteHighlightMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
}));

vi.mock("framer-motion", () => ({
    motion: {
        div: ({ children, ...props }: any) => {
            delete props.drag;
            delete props.dragMomentum;
            delete props.dragElastic;
            return <div {...props}>{children}</div>;
        },
    },
}));

vi.mock("@/hooks/useHighlights", () => ({
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

describe("NotesDrawer", () => {
    const onHighlightJump = vi.fn();

    const highlights: HighlightWithContent[] = [
        {
            id: "highlight-1",
            user_id: "user-1",
            content_item_id: "content-1",
            segment_id: "seg-1",
            highlighted_text: "The highlighted passage",
            note_body: "My note body",
            color: "blue",
            anchor_start: 0,
            anchor_end: 10,
            created_at: "2026-03-11T12:00:00.000Z",
            updated_at: null,
            content_item: null,
        },
        {
            id: "highlight-2",
            user_id: "user-1",
            content_item_id: "content-1",
            segment_id: "seg-2",
            highlighted_text: "A second highlight",
            note_body: null,
            color: "yellow",
            anchor_start: 20,
            anchor_end: 30,
            created_at: "2026-03-10T12:00:00.000Z",
            updated_at: null,
            content_item: null,
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
            content_item: null,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders navigation-first cards with source context and note content", async () => {
        render(
            <NotesDrawer
                highlights={highlights}
                isLoading={false}
                hasError={false}
                sections={[
                    { id: "seg-1", title: "Introduction" },
                    { id: "seg-2", title: "Chapter 1" },
                    { id: "seg-3", title: "Appendix" },
                ]}
                activeHighlightId="highlight-1"
                onHighlightJump={onHighlightJump}
            />
        );

        fireEvent.click(await screen.findByRole("button", { name: /open notes drawer/i }));

        const activeRow = screen.getByRole("button", { name: /note introduction/i });
        const quote = await screen.findByText(/highlighted passage/i);

        expect(activeRow).toHaveAttribute("data-active", "true");
        expect(activeRow.className).not.toContain("border");
        expect(activeRow.className).toContain("bg-card/50");
        expect(quote).toBeInTheDocument();
        expect(screen.getByText("My note body")).toBeInTheDocument();
        expect(screen.getByText("Introduction")).toBeInTheDocument();
        expect(screen.getByText("Note")).toBeInTheDocument();
        expect(screen.getAllByText("Highlight").length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Mar/).length).toBeGreaterThan(0);
        expect(document.querySelectorAll('[data-highlight-rail="true"]').length).toBe(highlights.length);
        expect(document.querySelector('[data-highlight-quote="true"]')?.className).toContain("text-[0.94rem]");
        expect(screen.queryByText("?")).not.toBeInTheDocument();
    });

    it("jumps on card tap and keeps delete isolated", async () => {
        deleteHighlightMock.mockResolvedValue("highlight-1");
        onHighlightJump.mockResolvedValue(undefined);

        render(
            <NotesDrawer
                highlights={highlights}
                isLoading={false}
                hasError={false}
                sections={[
                    { id: "seg-1", title: "Introduction" },
                    { id: "seg-2", title: "Chapter 1" },
                    { id: "seg-3", title: "Appendix" },
                ]}
                onHighlightJump={onHighlightJump}
            />
        );

        fireEvent.click(await screen.findByRole("button", { name: /open notes drawer/i }));
        fireEvent.click(await screen.findByRole("button", { name: /delete note from introduction/i }));

        await waitFor(() => {
            expect(deleteHighlightMock).toHaveBeenCalledWith("highlight-1");
        });
        expect(onHighlightJump).not.toHaveBeenCalled();

        const jumpButton = screen.getByRole("button", { name: /note introduction/i });
        fireEvent.click(jumpButton);

        await waitFor(() => {
            expect(onHighlightJump).toHaveBeenCalledWith("highlight-1");
        });
    });

    it("treats whitespace-only notes as plain highlights", async () => {
        render(
            <NotesDrawer
                highlights={highlights}
                isLoading={false}
                hasError={false}
                sections={[
                    { id: "seg-1", title: "Introduction" },
                    { id: "seg-2", title: "Chapter 1" },
                    { id: "seg-3", title: "Appendix" },
                ]}
                onHighlightJump={onHighlightJump}
            />
        );

        fireEvent.click(await screen.findByRole("button", { name: /open notes drawer/i }));

        expect(screen.getByRole("button", { name: /highlight appendix/i })).toBeInTheDocument();
        expect(screen.queryByText("   ")).not.toBeInTheDocument();
    });
});
