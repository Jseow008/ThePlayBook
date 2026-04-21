import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContinueReadingPage from "@/app/(public)/library/reading/page";
import type { ContentItem } from "@/types/database";

const mockUseReadingProgress = vi.fn();
const mockUseBatchContentItems = vi.fn();
const mockContentCard = vi.fn(
    ({
        item,
        navigationMode,
        titleDensity,
    }: {
        item: ContentItem;
        navigationMode?: "preview" | "resume";
        titleDensity?: "default" | "app-compact";
    }) => (
        <div>{`${navigationMode ?? "preview"}:${titleDensity ?? "default"}:${item.title}`}</div>
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
    }) => mockContentCard(props),
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
        embedding: null,
        audio_url: null,
        source_url: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
        deleted_at: null,
    };

    beforeEach(() => {
        mockContentCard.mockClear();
        mockUseReadingProgress.mockReturnValue({
            inProgressIds: [item.id],
            isLoaded: true,
            refresh: vi.fn(),
            removeFromProgress: vi.fn(),
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

        expect(screen.getByText("resume:app-compact:Deep Work")).toBeInTheDocument();
        expect(mockContentCard).toHaveBeenCalledWith(
            expect.objectContaining({
                item,
                navigationMode: "resume",
                titleDensity: "app-compact",
            })
        );
    });

    it("removes invalid progress ids through the hook instead of manual localStorage cleanup", () => {
        const removeFromProgress = vi.fn();

        mockUseReadingProgress.mockReturnValue({
            inProgressIds: [item.id, "missing-item"],
            isLoaded: true,
            refresh: vi.fn(),
            removeFromProgress,
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
            inProgressIds: [item.id, "missing-item"],
            isLoaded: true,
            refresh: vi.fn(),
            removeFromProgress,
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
        expect(screen.getByText("resume:app-compact:Deep Work")).toBeInTheDocument();
    });

    it("shows a retry state when loading progress fails before any cards are available", () => {
        const refetch = vi.fn();

        mockUseReadingProgress.mockReturnValue({
            inProgressIds: [item.id],
            isLoaded: true,
            refresh: vi.fn(),
            removeFromProgress: vi.fn(),
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
});
