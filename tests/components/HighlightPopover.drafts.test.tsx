import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HighlightPopover } from "@/components/reader/HighlightPopover";
import { clearNoteDrafts } from "@/lib/note-draft";
const mocks = vi.hoisted(() => ({ save: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useAuthUser", () => ({ useAuthSessionIdentity: () => ({ user: { id: "account-a" }, sessionEpoch: 0 }) }));
vi.mock("@/hooks/useHighlights", () => ({ useUpdateHighlight: () => ({ mutateAsync: mocks.save, isPending: false }), useDeleteHighlight: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));
const baseline = { id: "highlight-a", user_id: "account-a", note_body: "Saved thought", color: "blue", updated_at: "version-1" };
const props = { highlightId: baseline.id, noteBody: baseline.note_body, currentColor: baseline.color, highlightedText: "Original passage", portalContainer: document.body, position: { top: 200, left: 200, width: 80, height: 20 }, onClose: vi.fn() };
async function edit() {
    fireEvent.click(screen.getByTitle("Edit Color or Note"));
    await waitFor(() => expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("Saved thought"));
}
beforeEach(() => {
    clearNoteDrafts(); mocks.save.mockReset(); mocks.error.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: baseline }) })));
});
describe("desktop reader floating editor regression", () => {
    it("recovers the correct draft after the floating editor is removed during navigation or scrolling", async () => {
        const first = render(<HighlightPopover {...props} />); await edit();
        fireEvent.change(screen.getByPlaceholderText("Add a note..."), { target: { value: "Unfinished floating note" } });
        first.unmount(); render(<HighlightPopover {...props} />);
        fireEvent.click(screen.getByTitle("Edit Color or Note"));
        await waitFor(() => expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("Unfinished floating note"));
        expect(mocks.save).not.toHaveBeenCalled();
    });
    it("retains a rejected draft and sends the baseline with an explicit Save", async () => {
        mocks.save.mockRejectedValue(new Error("Save rejected"));
        render(<HighlightPopover {...props} />); await edit();
        fireEvent.change(screen.getByPlaceholderText("Add a note..."), { target: { value: "Keep this draft" } });
        fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Save rejected"));
        await waitFor(() => expect(screen.getByPlaceholderText("Add a note...")).toHaveValue("Keep this draft"));
        expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: baseline.id, expected_user_id: "account-a", expected: expect.objectContaining({ updated_at: "version-1" }) }));
    });
    it("explicit Cancel removes the unfinished draft", async () => {
        const first = render(<HighlightPopover {...props} />); await edit();
        fireEvent.change(screen.getByPlaceholderText("Add a note..."), { target: { value: "Discard this" } });
        fireEvent.click(screen.getByRole("button", { name: "Cancel note edits" })); first.unmount();
        render(<HighlightPopover {...props} />); await edit();
    });
});
