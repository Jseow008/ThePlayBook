import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavedNoteCopyButton } from "@/components/notes/SavedNoteCopyButton";

const { success, error } = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success, error } }));

const saved = {
    highlighted_text: "Saved quotation", note_body: "Saved thought",
    content_item: { title: "Book", author: "Author" }, segment: { title: "Chapter" },
};
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const setClipboard = (value: unknown) => Object.defineProperty(navigator, "clipboard", { configurable: true, value });

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
});

describe("SavedNoteCopyButton", () => {
    it("copies saved fields and announces success only after the clipboard write resolves", async () => {
        let finish!: () => void;
        const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
        setClipboard({ writeText });
        render(<SavedNoteCopyButton item={saved} passageHref="/read/book?highlightId=h" />);
        fireEvent.click(screen.getByRole("button", { name: "Copy with source" }));
        expect(writeText).toHaveBeenCalledWith(`Passage:\nSaved quotation\n\nMy thought:\nSaved thought\n\nSource: Book\nAuthor: Author\nSection: Chapter\nSaved passage: ${window.location.origin}/read/book?highlightId=h`);
        expect(success).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Copy with source" })).toBeDisabled();
        await act(async () => finish());
        expect(success).toHaveBeenCalledExactlyOnceWith("Copied");
        expect(error).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Copy with source" })).toBeEnabled();
    });

    it("reports denied clipboard access without claiming success and allows retry", async () => {
        const writeText = vi.fn().mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError")).mockResolvedValueOnce(undefined);
        setClipboard({ writeText });
        render(<SavedNoteCopyButton item={saved} passageHref={null} />);
        fireEvent.click(screen.getByRole("button", { name: "Copy with source" }));
        await waitFor(() => expect(error).toHaveBeenCalledWith("Could not copy. Check clipboard access and try again."));
        expect(success).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Copy with source" }));
        await waitFor(() => expect(success).toHaveBeenCalledWith("Copied"));
    });

    it("reports an unavailable clipboard instead of announcing a false success", async () => {
        setClipboard(undefined);
        render(<SavedNoteCopyButton item={saved} passageHref={null} />);
        fireEvent.click(screen.getByRole("button", { name: "Copy with source" }));
        expect(error).toHaveBeenCalledWith("Clipboard access is unavailable in this browser.");
        expect(success).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Copy with source" })).toBeEnabled();
    });
});
