import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LibraryRecovery } from "@/components/settings/LibraryRecovery";
const { state } = vi.hoisted(() => ({ state: {
    user: { id: "a" }, recovery: { pending: 1, attention: [] as Array<{ id: string; itemId: string; guest: boolean; skipped: boolean; canReapply: boolean; isBookmarked: boolean }>, guestCount: 0, importableGuestCount: 0, storageError: false }, hydrationStatus: "ready",
    retryPending: vi.fn(), retryHydration: vi.fn(), discardIntent: vi.fn(), reapplyIntent: vi.fn(), importGuestLibrary: vi.fn(), retryJournalStorage: vi.fn(), discardUnreadableIntents: vi.fn(),
} }));
vi.mock("@/hooks/useReadingProgress", () => ({ useReadingProgress: () => state }));
beforeEach(() => { vi.clearAllMocks(); state.recovery.attention = []; state.recovery.pending = 1; });
it("shows pending instead of synced and offers explicit retry", async () => {
    render(<LibraryRecovery />);
    expect(screen.getByRole("status")).toHaveTextContent("pending");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry pending changes" })));
    expect(state.retryPending).toHaveBeenCalledOnce();
});
it("never offers to overwrite a skipped guest import and requires discard confirmation", () => {
    state.recovery.pending = 0;
    state.recovery.attention = [{ id: "intent", itemId: "item", guest: true, skipped: true, canReapply: false, isBookmarked: true }];
    render(<LibraryRecovery />);
    expect(screen.queryByRole("button", { name: "Apply as a new change" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Discard local change" }));
    expect(state.discardIntent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
    expect(state.discardIntent).toHaveBeenCalledWith("intent");
});
