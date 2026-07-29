import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TextSelectionToolbar } from "@/components/reader/TextSelectionToolbar";
import { HighlightConflictError } from "@/hooks/useHighlights";

const mocks = vi.hoisted(() => ({
    createHighlight: vi.fn(),
    updateHighlight: vi.fn(),
    toastInfo: vi.fn(),
    toastSuccess: vi.fn(),
    toastWarning: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock("@/hooks/useHighlights", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/hooks/useHighlights")>();
    return {
        ...actual,
        useCreateHighlight: () => ({
            mutateAsync: mocks.createHighlight,
            isPending: false,
        }),
        useUpdateHighlight: () => ({
            mutateAsync: mocks.updateHighlight,
            isPending: false,
        }),
    };
});
vi.mock("sonner", () => ({
    toast: {
        info: mocks.toastInfo,
        success: mocks.toastSuccess,
        warning: mocks.toastWarning,
        error: mocks.toastError,
    },
}));

function selectSegmentText(segment: HTMLElement, start: number, end: number) {
    const textNode = segment.firstChild;
    if (!textNode) throw new Error("Missing segment text node");

    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    Object.defineProperty(range, "getBoundingClientRect", {
        value: () => ({
            top: 100,
            left: 100,
            width: 120,
            height: 20,
            right: 220,
            bottom: 120,
            x: 100,
            y: 100,
            toJSON: () => ({}),
        }),
    });

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.mouseUp(document);
}

describe("TextSelectionToolbar overlap handling", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.getSelection()?.removeAllRanges();
        mocks.updateHighlight.mockResolvedValue({ id: "highlight-existing" });
    });

    it("treats an exact duplicate as already highlighted", async () => {
        mocks.createHighlight.mockResolvedValue({
            highlight: { id: "highlight-existing" },
            disposition: "existing",
        });

        const { container } = render(
            <>
                <div data-segment-id="segment-1">Alpha Beta</div>
                <TextSelectionToolbar contentItemId="content-1" />
            </>
        );

        selectSegmentText(container.querySelector("[data-segment-id]")!, 0, 5);
        await screen.findByRole("button", { name: "Highlight text" });
        fireEvent.click(screen.getByRole("button", { name: "Highlight text" }));

        await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledWith("Already highlighted"));
        expect(mocks.updateHighlight).not.toHaveBeenCalled();
    });

    it("offers to replace an overlapping highlight", async () => {
        mocks.createHighlight.mockRejectedValue(
            new HighlightConflictError("Overlap", {
                existingHighlightId: "highlight-existing",
                relationship: "contained",
            })
        );

        const { container } = render(
            <>
                <div data-segment-id="segment-1">Alpha Beta</div>
                <TextSelectionToolbar contentItemId="content-1" />
            </>
        );

        selectSegmentText(container.querySelector("[data-segment-id]")!, 6, 10);
        await screen.findByRole("button", { name: "Highlight text" });
        fireEvent.click(screen.getByRole("button", { name: "Highlight text" }));

        await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalledTimes(1));
        const toastOptions = mocks.toastWarning.mock.calls[0]?.[1] as {
            action?: { onClick?: () => void };
        };

        await act(async () => {
            toastOptions.action?.onClick?.();
        });

        await waitFor(() => {
            expect(mocks.updateHighlight).toHaveBeenCalledWith({
                id: "highlight-existing",
                highlighted_text: "Beta",
                anchor_start: 6,
                anchor_end: 10,
            });
        });
    });
});
