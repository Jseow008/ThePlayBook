import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileSelectionActions } from "@/components/reader/MobileSelectionActions";
import { HighlightConflictError } from "@/hooks/useHighlights";

const mocks = vi.hoisted(() => ({
    createHighlight: vi.fn(),
    updateHighlight: vi.fn(),
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
vi.mock("@/hooks/useReaderSettings", () => ({
    useReaderSettings: () => ({ readerTheme: "dark" }),
}));

vi.mock("sonner", () => ({
    toast: {
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

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.touchEnd(document);
}

describe("MobileSelectionActions overlap handling", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.getSelection()?.removeAllRanges();
        mocks.updateHighlight.mockResolvedValue({ id: "highlight-existing" });
    });

    it("reports an exact duplicate without creating another visible record", async () => {
        mocks.createHighlight.mockResolvedValue({
            highlight: { id: "highlight-existing" },
            disposition: "existing",
        });

        const { container } = render(
            <>
                <div data-segment-id="segment-1">Alpha Beta</div>
                <MobileSelectionActions
                    contentItemId="content-1"
                    contentTitle="Example"
                    sections={[{ id: "segment-1", title: "Section" }]}
                />
            </>
        );

        selectSegmentText(container.querySelector("[data-segment-id]")!, 0, 5);
        const saveButton = await screen.findByRole("button", { name: "Save highlight" });
        fireEvent.click(saveButton);

        await waitFor(() => {
            expect(mocks.toastSuccess).toHaveBeenCalledWith("Already highlighted");
        });
    });

    it("offers range replacement for an overlap", async () => {
        mocks.createHighlight.mockRejectedValue(
            new HighlightConflictError("Overlap", {
                existingHighlightId: "highlight-existing",
                relationship: "contained",
            })
        );

        const { container } = render(
            <>
                <div data-segment-id="segment-1">Alpha Beta</div>
                <MobileSelectionActions
                    contentItemId="content-1"
                    contentTitle="Example"
                    sections={[{ id: "segment-1", title: "Section" }]}
                />
            </>
        );

        selectSegmentText(container.querySelector("[data-segment-id]")!, 6, 10);
        fireEvent.click(await screen.findByRole("button", { name: "Save highlight" }));

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
