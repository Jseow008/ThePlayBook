import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReadingPage from "@/app/(public)/library/reading/page";
import CompletedPage from "@/app/(public)/library/completed/page";
import SavedPage from "@/app/(public)/library/my-list/page";

const mocks = vi.hoisted(() => ({ progress: vi.fn(), batch: vi.fn(), remove: vi.fn(), removeSaved: vi.fn() }));
vi.mock("@/hooks/useReadingProgress", () => ({ useReadingProgress: mocks.progress }));
vi.mock("@/hooks/use-content-queries", () => ({ useBatchContentItems: mocks.batch }));
vi.mock("@/hooks/useReflections", () => ({ useReflections: () => ({ data: [] }) }));
vi.mock("@/components/reader/ReflectionComposer", () => ({ ReflectionComposer: () => null }));
vi.mock("@/lib/analytics", () => ({ captureAnalyticsEvent: vi.fn() }));

const oldId = "11111111-1111-4111-8111-111111111111";

describe.each([["Continue Reading", ReadingPage], ["Completed", CompletedPage], ["Saved", SavedPage]] as const)("%s unavailable history", (_name, Page) => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.progress.mockReturnValue({
            inProgressIds: [oldId], completedIds: [oldId], myListIds: [oldId], isLoaded: true,
            getProgress: () => ({ completed: ["old-segment"], totalSegments: 4, isCompleted: false }),
            removeFromProgress: mocks.remove, removeFromMyList: mocks.removeSaved,
            archiveFromProgressList: vi.fn(), restoreProgressListArchive: vi.fn(), removeFromHistory: vi.fn(), user: null,
        });
        mocks.batch.mockReturnValue({ data: [], isSuccess: true, isError: false, isLoading: false, refetch: vi.fn() });
    });

    it("keeps successful omissions visible without enqueueing destructive mutations", () => {
        render(<Page />);
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.removeSaved).not.toHaveBeenCalled();
        expect(screen.getByRole("region", { name: "Unavailable saved summaries" })).toBeVisible();
        expect(screen.getByRole("link", { name: "View summary status" })).toHaveAttribute("href", `/read/${oldId}`);
        expect(screen.queryByText(/No reading in progress|No completed|No saved/)).not.toBeInTheDocument();
    });

    it("does not interpret loading or failed responses as a removed summary", () => {
        mocks.batch.mockReturnValue({ data: [], isSuccess: false, isError: true, isLoading: false, refetch: vi.fn() });
        render(<Page />);
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(mocks.removeSaved).not.toHaveBeenCalled();
        expect(screen.queryByRole("region", { name: "Unavailable saved summaries" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    });
});
