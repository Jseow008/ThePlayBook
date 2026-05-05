import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompletedPage from "@/app/(public)/library/completed/page";
import type { ContentItem } from "@/types/database";

const mockUseReadingProgress = vi.fn();
const mockUseBatchContentItems = vi.fn();
const mockToastSuccess = vi.fn();
const mockContentCard = vi.fn(
    ({
        item,
        removeLabel,
        onRemove,
        showCompletedBadge,
        titleDensity,
    }: {
        item: ContentItem;
        removeIcon?: "archive" | "trash";
        removeLabel?: string;
        onRemove?: (id: string) => void;
        showCompletedBadge?: boolean;
        titleDensity?: "default" | "app-compact";
    }) => (
        <div>
            <span>{`${showCompletedBadge ? "completed" : "plain"}:${titleDensity ?? "default"}:${item.title}`}</span>
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
        removeIcon?: "archive" | "trash";
        removeLabel?: string;
        onRemove?: (id: string) => void;
        showCompletedBadge?: boolean;
        titleDensity?: "default" | "app-compact";
    }) => mockContentCard(props),
}));

vi.mock("sonner", () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
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
        embedding: null,
        audio_url: null,
        source_url: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
        deleted_at: null,
    };

    beforeEach(() => {
        mockContentCard.mockClear();
        mockToastSuccess.mockClear();
        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            completedIds: [item.id],
            getProgress: vi.fn(() => null),
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

    it("renders completed cards with the archive action label", () => {
        render(<CompletedPage />);

        expect(screen.getByText("completed:app-compact:Atomic Habits")).toBeInTheDocument();
        expect(mockContentCard).toHaveBeenCalledWith(
            expect.objectContaining({
                item,
                removeIcon: "archive",
                removeLabel: "Archive from List",
                showCompletedBadge: true,
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
            refresh: vi.fn(),
            removeFromProgress,
            restoreProgressListArchive,
            storageScope: "guest",
        });

        render(<CompletedPage />);

        fireEvent.click(screen.getByRole("button", { name: "Archive from List" }));

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

    it("keeps loading chrome stable before completed items hydrate", () => {
        mockUseReadingProgress.mockReturnValue({
            archiveFromProgressList: vi.fn(),
            completedIds: [],
            getProgress: vi.fn(() => null),
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

        const { container } = render(<CompletedPage />);

        expect(screen.queryByText("No completed content yet")).not.toBeInTheDocument();
        expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
});
