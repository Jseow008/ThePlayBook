import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentCard } from "@/components/ui/ContentCard";
import type { ContentItem } from "@/types/database";
import type { ReadingProgressData } from "@/hooks/useReadingProgress";

const mockToggleMyList = vi.fn();
const mockIsInMyList = vi.fn(() => false);
const mockGetProgress = vi.fn<(_: string) => ReadingProgressData | null>();
const mockToastSuccess = vi.fn();

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("next/image", () => ({
    default: ({
        alt,
        fill,
        priority,
        unoptimized,
        ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & {
        fill?: boolean;
        priority?: boolean;
        unoptimized?: boolean;
    }) => {
        void fill;
        void priority;
        void unoptimized;
        return <img alt={alt} {...props} />;
    },
}));

vi.mock("sonner", () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
    },
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => ({
        isInMyList: mockIsInMyList,
        toggleMyList: mockToggleMyList,
        getProgress: mockGetProgress,
    }),
}));

describe("ContentCard", () => {
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
        mockToggleMyList.mockReset();
        mockIsInMyList.mockReset();
        mockGetProgress.mockReset();
        mockToastSuccess.mockReset();
        mockIsInMyList.mockReturnValue(false);
        mockGetProgress.mockReturnValue(null);
    });

    it("defaults to the preview page", () => {
        render(<ContentCard item={item} />);

        expect(screen.getByRole("link", { name: "Preview Deep Work" })).toHaveAttribute(
            "href",
            "/preview/11111111-1111-1111-1111-111111111111"
        );
    });

    it("opens the reader when resume mode has usable progress", () => {
        mockGetProgress.mockReturnValue({
            itemId: item.id,
            completed: ["segment-1"],
            lastSegmentIndex: 0,
            maxSegmentIndex: 0,
            lastReadAt: "2026-03-10T00:00:00Z",
            isCompleted: false,
            totalSegments: 5,
        });

        render(<ContentCard item={item} navigationMode="resume" />);

        expect(screen.getByRole("link", { name: "Read Deep Work" })).toHaveAttribute(
            "href",
            "/read/11111111-1111-1111-1111-111111111111"
        );
    });

    it("falls back to the preview page in resume mode when progress is missing", () => {
        render(<ContentCard item={item} navigationMode="resume" />);

        expect(screen.getByRole("link", { name: "Preview Deep Work" })).toHaveAttribute(
            "href",
            "/preview/11111111-1111-1111-1111-111111111111"
        );
    });

    it("keeps the remove action working on the card", () => {
        const onRemove = vi.fn();

        render(<ContentCard item={item} onRemove={onRemove} navigationMode="resume" />);

        fireEvent.click(screen.getByRole("button", { name: "Remove from progress" }));

        expect(onRemove).toHaveBeenCalledWith(item.id);
    });

    it("uses the compact title typography only when requested", () => {
        const { rerender } = render(<ContentCard item={item} titleDensity="app-compact" />);

        expect(screen.getByRole("heading", { name: "Deep Work" }).className).toContain("text-[0.88rem]");
        expect(screen.getByRole("heading", { name: "Deep Work" }).className).toContain("leading-[1.13]");

        rerender(<ContentCard item={item} />);

        expect(screen.getByRole("heading", { name: "Deep Work" }).className).toContain("text-[0.95rem]");
        expect(screen.getByRole("heading", { name: "Deep Work" }).className).toContain("leading-[1.18]");
    });

    it("falls back to the non-image artwork treatment after the direct retry fails", () => {
        const itemWithCover = {
            ...item,
            cover_image_url: "https://example.com/deep-work.jpg",
        };

        render(<ContentCard item={itemWithCover} />);

        fireEvent.error(screen.getByAltText("Deep Work"));
        fireEvent.error(screen.getByAltText("Deep Work"));

        expect(screen.queryByAltText("Deep Work")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Preview Deep Work" })).toBeInTheDocument();
    });
});
