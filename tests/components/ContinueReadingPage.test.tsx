import { render, screen } from "@testing-library/react";
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
            isLoading: false,
        });
    });

    it("renders in-progress cards with the current navigation behavior and compact title density", () => {
        render(<ContinueReadingPage />);

        expect(screen.getByText("preview:app-compact:Deep Work")).toBeInTheDocument();
        expect(mockContentCard).toHaveBeenCalledWith(
            expect.objectContaining({
                item,
                titleDensity: "app-compact",
            })
        );
    });
});
