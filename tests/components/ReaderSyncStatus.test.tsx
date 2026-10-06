import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReaderSyncStatus } from "@/components/reader/ReaderSyncStatus";

const { state } = vi.hoisted(() => ({ state: {
    status: "unavailable",
    recovery: { attention: [] as Array<{
        id: string; itemId: string; localCompleted: number; serverCompleted: number;
        localIsCompleted: boolean; serverIsCompleted: boolean; canReapply: boolean;
    }> },
    retryHydration: vi.fn(),
    reapplyIntent: vi.fn(async () => {}),
    getItemSyncStatus: vi.fn(() => state.status),
} }));

vi.mock("@/hooks/useReadingProgress", () => ({ useReadingProgress: () => state }));

beforeEach(() => {
    vi.clearAllMocks();
    state.status = "unavailable";
    state.recovery.attention = [];
});

it("keeps failed refresh visibly actionable", () => {
    const view = render(<ReaderSyncStatus itemId="article" hasProgress saveQueued={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Sync unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Refresh library" }));
    expect(state.retryHydration).toHaveBeenCalledOnce();
    view.rerender(<ReaderSyncStatus itemId="article" hasProgress saveQueued={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Sync unavailable");
});

it("shows both versions before offering an explicit reapply", () => {
    state.status = "needs_review";
    state.recovery.attention = [{
        id: "intent", itemId: "article", localCompleted: 12, serverCompleted: 0,
        localIsCompleted: true, serverIsCompleted: false, canReapply: true,
    }];
    render(<ReaderSyncStatus itemId="article" hasProgress={false} saveQueued={false} />);
    expect(screen.queryByRole("button", { name: "Apply device progress" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review change" }));
    expect(screen.getByRole("status")).toHaveTextContent("Your device: 12 sections complete");
    expect(screen.getByRole("status")).toHaveTextContent("Library: 0 sections complete");
    fireEvent.click(screen.getByRole("button", { name: "Apply device progress" }));
    expect(state.reapplyIntent).toHaveBeenCalledWith("intent");
});
