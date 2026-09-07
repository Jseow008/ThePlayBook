import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompletedPage from "@/app/(public)/library/completed/page";
import type { ContentItem } from "@/types/database";

const mockUseReadingProgress = vi.fn();
const mockUseBatchContentItems = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
const mockContentCard = vi.fn(
    ({
        item,
        removeLabel,
        onRemove,
        secondaryRemoveLabel,
        onSecondaryRemove,
        showCompletedBadge,
        showDesktopQuickActions,
        titleDensity,
    }: {
        item: ContentItem;
        removeIcon?: "archive" | "trash";
        removeLabel?: string;
        onRemove?: (id: string) => void;
        secondaryRemoveLabel?: string;
        onSecondaryRemove?: (id: string) => void;
        showCompletedBadge?: boolean;
        showDesktopQuickActions?: boolean;
        titleDensity?: "default" | "app-compact";
    }) => (
        <div>
            <span>{`${showCompletedBadge ? "completed" : "plain"}:${titleDensity ?? "default"}:${showDesktopQuickActions ? "quick-actions" : "no-quick-actions"}:${item.title}`}</span>
            {onRemove ? (
                <button onClick={() => onRemove(item.id)}>
                    {removeLabel ?? "Remove"}
                </button>
            ) : null}
            {onSecondaryRemove ? (
                <button onClick={() => onSecondaryRemove(item.id)}>
                    {secondaryRemoveLabel ?? "Secondary remove"}
                </button>
            ) : null}
        </div>
    )
);

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => mockUseReadingProgress(),
}));

vi.mock("@/hooks/use-content-queries", () => ({
    useBatchContentItems: (...args: unknown[]) => mockUseBatchContentItems(...args),
}));

vi.mock("@/components/ui/ContentCard", () => ({
    ContentCard: (props: {
        item: ContentItem;
        removeIcon?: "archive" | "trash";
        removeLabel?: string;
        onRemove?: (id: string) => void;
        secondaryRemoveLabel?: string;
        onSecondaryRemove?: (id: string) => void;
        showCompletedBadge?: boolean;
        showDesktopQuickActions?: boolean;
        titleDensity?: "default" | "app-compact";
    }) => mockContentCard(props),
}));

vi.mock("sonner", () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
        error: (...args: unknown[]) => mockToastError(...args),
    },
}));

describe("CompletedPage", () => {
    const item: ContentItem = {
        id: "22222222-2222-2222-2222-222222222222",
        title: "Atomic Habits",
        type: "book",
        status: "verified",
        quick_mode_json: null,
        duration_seconds: 1800,
        author: "James Clear",
        cover_image_url: null,
        hero_image_url: null,
        category: "Productivity",
        is_featured: false,
        narration_completed_at: null,
        narration_error: null,
        narration_requested_at: null,
        narration_started_at: null,
        narration_status: "completed",
        series_id: null,
        series_order: null,
        embedding: null,
        audio_url: null,
        source_url: null,
        created_at: "2026-03-01T00:00:00Z",
        published_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
        deleted_at: null,
    };

    beforeEach(() => {
        mockContentCard.mockClear();
        mockToastSuccess.mockClear();
        mockToastError.mockClear();
        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            completedIds: [item.id],
            getProgress: vi.fn(() => null),
            isLoaded: true,
            removeFromHistory: vi.fn(() => Promise.resolve(true)),
            refresh: vi.fn(),
            removeFromProgress: vi.fn(),
            restoreProgressListArchive: vi.fn(),
            storageScope: "guest",
        });
        mockUseBatchContentItems.mockReturnValue({
            data: [item],
            isError: false,
            isLoading: false,
            isSuccess: true,
            refetch: vi.fn(),
        });
    });

    it("renders completed cards with the archive action label", () => {
        render(<CompletedPage />);

        expect(screen.getByText("completed:app-compact:quick-actions:Atomic Habits")).toBeInTheDocument();
        expect(screen.getByText("Completed Item")).toBeInTheDocument();
        expect(mockContentCard).toHaveBeenCalledWith(
            expect.objectContaining({
                item,
                removeIcon: "archive",
                removeLabel: "Hide from Completed",
                secondaryRemoveLabel: "Remove from reading history",
                showCompletedBadge: true,
                showDesktopQuickActions: true,
                titleDensity: "app-compact",
            })
        );
    });

    it("archives cards from Completed without deleting progress", () => {
        const archiveFromProgressList = vi.fn();
        const removeFromProgress = vi.fn();
        const restoreProgressListArchive = vi.fn();

        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList,
            completedIds: [item.id],
            getProgress: vi.fn(() => null),
            isLoaded: true,
            removeFromHistory: vi.fn(() => Promise.resolve(true)),
            refresh: vi.fn(),
            removeFromProgress,
            restoreProgressListArchive,
            storageScope: "guest",
        });

        render(<CompletedPage />);

        fireEvent.click(screen.getByRole("button", { name: "Hide from Completed" }));

        expect(archiveFromProgressList).toHaveBeenCalledWith(item.id, "completed");
        expect(removeFromProgress).not.toHaveBeenCalled();
        expect(mockToastSuccess).toHaveBeenCalledWith("Archived from List", {
            action: {
                label: "Undo",
                onClick: expect.any(Function),
            },
        });

        const toastOptions = mockToastSuccess.mock.calls[0][1] as { action: { onClick: () => void } };
        toastOptions.action.onClick();

        expect(restoreProgressListArchive).toHaveBeenCalledWith(item.id, "completed");
    });

    it("removes completed cards from history after confirmation", async () => {
        const archiveFromProgressList = vi.fn();
        const removeFromHistory = vi.fn(() => Promise.resolve(true));

        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList,
            completedIds: [item.id],
            getProgress: vi.fn(() => null),
            isLoaded: true,
            removeFromHistory,
            refresh: vi.fn(),
            removeFromProgress: vi.fn(),
            restoreProgressListArchive: vi.fn(),
            storageScope: "guest",
        });

        render(<CompletedPage />);

        fireEvent.click(screen.getByRole("button", { name: "Remove from reading history" }));
        const dialog = screen.getByRole("dialog", { name: "Remove from history?" });
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveClass("touch-target-44");
        expect(within(dialog).getByRole("button", { name: "Remove from history" })).toHaveClass("touch-target-44");

        fireEvent.click(within(dialog).getByRole("button", { name: "Remove from history" }));

        await waitFor(() => {
            expect(removeFromHistory).toHaveBeenCalledWith(item.id, {
                deleteNotesAndHighlights: false,
            });
        });
        expect(archiveFromProgressList).not.toHaveBeenCalled();
    });

    it("can remove notes and highlights with history", async () => {
        const removeFromHistory = vi.fn(() => Promise.resolve(true));

        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            completedIds: [item.id],
            getProgress: vi.fn(() => null),
            isLoaded: true,
            removeFromHistory,
            refresh: vi.fn(),
            removeFromProgress: vi.fn(),
            restoreProgressListArchive: vi.fn(),
            storageScope: "guest",
        });

        render(<CompletedPage />);

        fireEvent.click(screen.getByRole("button", { name: "Remove from reading history" }));
        const dialog = screen.getByRole("dialog", { name: "Remove from history?" });
        fireEvent.click(within(dialog).getByRole("checkbox", { name: /Also delete notes and highlights/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Remove from history" }));

        await waitFor(() => {
            expect(removeFromHistory).toHaveBeenCalledWith(item.id, {
                deleteNotesAndHighlights: true,
            });
        });
    });

    it("keeps loading chrome stable before completed items hydrate", () => {
        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            completedIds: [],
            getProgress: vi.fn(() => null),
            isLoaded: false,
            removeFromHistory: vi.fn(() => Promise.resolve(true)),
            refresh: vi.fn(),
            removeFromProgress: vi.fn(),
            restoreProgressListArchive: vi.fn(),
            storageScope: "guest",
        });
        mockUseBatchContentItems.mockReturnValue({
            data: [],
            isError: false,
            isLoading: false,
            isSuccess: false,
            refetch: vi.fn(),
        });

        const { container } = render(<CompletedPage />);

        expect(screen.queryByText("No completed content yet")).not.toBeInTheDocument();
        expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });

    it("uses content-type-neutral copy when Completed is empty", () => {
        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            completedIds: [],
            getProgress: vi.fn(() => null),
            isLoaded: true,
            removeFromHistory: vi.fn(() => Promise.resolve(true)),
            refresh: vi.fn(),
            removeFromProgress: vi.fn(),
            restoreProgressListArchive: vi.fn(),
            storageScope: "guest",
        });
        mockUseBatchContentItems.mockReturnValue({
            data: [],
            isError: false,
            isLoading: false,
            isSuccess: true,
            refetch: vi.fn(),
        });

        render(<CompletedPage />);

        expect(screen.getByText("Finish your first summary to see it appear here.")).toBeInTheDocument();
        expect(screen.queryByText(/book summary or podcast/i)).not.toBeInTheDocument();
    });
});
