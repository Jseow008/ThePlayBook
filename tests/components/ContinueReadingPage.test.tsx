import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContinueReadingPage from "@/app/(public)/library/reading/page";
import type { ContentItem } from "@/types/database";

const mockUseReadingProgress = vi.fn();
const mockUseBatchContentItems = vi.fn();
const mockToastSuccess = vi.fn();
const mockContentCard = vi.fn(
    ({
        item,
        navigationMode,
        titleDensity,
        showDesktopQuickActions,
        removeLabel,
        onRemove,
    }: {
        item: ContentItem;
        navigationMode?: "preview" | "resume";
        titleDensity?: "default" | "app-compact";
        showDesktopQuickActions?: boolean;
        removeIcon?: "archive" | "trash";
        removeLabel?: string;
        onRemove?: (id: string) => void;
    }) => (
        <div>
            <span>{`${navigationMode ?? "preview"}:${titleDensity ?? "default"}:${showDesktopQuickActions ? "quick-actions" : "no-quick-actions"}:${item.title}`}</span>
            {onRemove ? (
                <button onClick={() => onRemove(item.id)}>
                    {removeLabel ?? "Remove"}
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
        navigationMode?: "preview" | "resume";
        titleDensity?: "default" | "app-compact";
        showDesktopQuickActions?: boolean;
        removeIcon?: "archive" | "trash";
        removeLabel?: string;
        onRemove?: (id: string) => void;
    }) => mockContentCard(props),
}));

vi.mock("sonner", () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
    },
}));

describe("ContinueReadingPage", () => {
    const item: ContentItem = {
        id: "11111111-1111-1111-1111-111111111111",
        title: "Deep Work",
        type: "book",
        status: "verified",
        quick_mode_json: null,
        duration_seconds: 1800,
        author: "Cal Newport",
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
        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            inProgressIds: [item.id],
            isLoaded: true,
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

    it("renders in-progress cards with resume navigation and compact title density", () => {
        render(<ContinueReadingPage />);

        expect(screen.getByText("resume:app-compact:quick-actions:Deep Work")).toBeInTheDocument();
        expect(screen.getByText("Item in Progress")).toBeInTheDocument();
        expect(mockContentCard).toHaveBeenCalledWith(
            expect.objectContaining({
                item,
                navigationMode: "resume",
                removeIcon: "archive",
                removeLabel: "Archive from List",
                showDesktopQuickActions: true,
                titleDensity: "app-compact",
            })
        );
    });

    it("archives cards from Continue Reading without deleting progress", () => {
        const archiveFromProgressList = vi.fn();
        const removeFromProgress = vi.fn();
        const restoreProgressListArchive = vi.fn();

        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList,
            inProgressIds: [item.id],
            isLoaded: true,
            refresh: vi.fn(),
            removeFromProgress,
            restoreProgressListArchive,
            storageScope: "guest",
        });

        render(<ContinueReadingPage />);

        fireEvent.click(screen.getByRole("button", { name: "Archive from List" }));

        expect(archiveFromProgressList).toHaveBeenCalledWith(item.id, "reading");
        expect(removeFromProgress).not.toHaveBeenCalled();
        expect(mockToastSuccess).toHaveBeenCalledWith("Archived from List", {
            action: {
                label: "Undo",
                onClick: expect.any(Function),
            },
        });

        const toastOptions = mockToastSuccess.mock.calls[0][1] as { action: { onClick: () => void } };
        toastOptions.action.onClick();

        expect(restoreProgressListArchive).toHaveBeenCalledWith(item.id, "reading");
    });

    it("removes invalid progress ids through the hook instead of manual localStorage cleanup", () => {
        const removeFromProgress = vi.fn();

        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            inProgressIds: [item.id, "missing-item"],
            isLoaded: true,
            refresh: vi.fn(),
            removeFromProgress,
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

        render(<ContinueReadingPage />);

        expect(removeFromProgress).toHaveBeenCalledWith("missing-item");
    });

    it("does not remove progress ids when the batch request is in an error state", () => {
        const removeFromProgress = vi.fn();

        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            inProgressIds: [item.id, "missing-item"],
            isLoaded: true,
            refresh: vi.fn(),
            removeFromProgress,
            restoreProgressListArchive: vi.fn(),
            storageScope: "guest",
        });
        mockUseBatchContentItems.mockReturnValue({
            data: [item],
            isError: true,
            isLoading: false,
            isSuccess: false,
            refetch: vi.fn(),
        });

        render(<ContinueReadingPage />);

        expect(removeFromProgress).not.toHaveBeenCalled();
        expect(screen.getByText("resume:app-compact:quick-actions:Deep Work")).toBeInTheDocument();
    });

    it("shows a retry state when loading progress fails before any cards are available", () => {
        const refetch = vi.fn();

        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            inProgressIds: [item.id],
            isLoaded: true,
            refresh: vi.fn(),
            removeFromProgress: vi.fn(),
            restoreProgressListArchive: vi.fn(),
            storageScope: "guest",
        });
        mockUseBatchContentItems.mockReturnValue({
            data: [],
            isError: true,
            isLoading: false,
            isSuccess: false,
            refetch,
        });

        render(<ContinueReadingPage />);

        expect(screen.getByText("We couldn't load your progress")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(refetch).toHaveBeenCalled();
    });

    it("keeps loading chrome stable before progress hydrates", () => {
        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            inProgressIds: [],
            isLoaded: false,
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

        const { container } = render(<ContinueReadingPage />);

        expect(screen.queryByText("No reading in progress")).not.toBeInTheDocument();
        expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
});
