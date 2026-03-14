import { render, screen, fireEvent, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroCarousel } from "@/components/ui/HeroCarousel";
import type { ContentItem } from "@/types/database";

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("next/image", () => ({
    default: ({ alt, fill, priority, unoptimized, ...props }: any) => {
        void fill;
        void priority;
        void unoptimized;
        return <img alt={alt || ""} {...props} />;
    },
}));

describe("HeroCarousel", () => {
    const items: ContentItem[] = [
        {
            id: "11111111-1111-1111-1111-111111111111",
            title: "First Feature",
            type: "article",
            status: "verified",
            quick_mode_json: null,
            duration_seconds: 600,
            author: "Author One",
            cover_image_url: "https://example.com/one.jpg",
            hero_image_url: "https://example.com/one-hero.jpg",
            category: "Category",
            is_featured: true,
            embedding: null,
            audio_url: null,
            source_url: null,
            created_at: "2026-03-01T00:00:00Z",
            updated_at: "2026-03-01T00:00:00Z",
            deleted_at: null,
        },
        {
            id: "22222222-2222-2222-2222-222222222222",
            title: "Second Feature",
            type: "book",
            status: "verified",
            quick_mode_json: null,
            duration_seconds: 900,
            author: "Author Two",
            cover_image_url: "https://example.com/two.jpg",
            hero_image_url: "https://example.com/two-hero.jpg",
            category: "Category",
            is_featured: true,
            embedding: null,
            audio_url: null,
            source_url: null,
            created_at: "2026-03-02T00:00:00Z",
            updated_at: "2026-03-02T00:00:00Z",
            deleted_at: null,
        },
        {
            id: "33333333-3333-3333-3333-333333333333",
            title: "Third Feature",
            type: "podcast",
            status: "verified",
            quick_mode_json: null,
            duration_seconds: 1200,
            author: "Author Three",
            cover_image_url: "https://example.com/three.jpg",
            hero_image_url: "https://example.com/three-hero.jpg",
            category: "Category",
            is_featured: true,
            embedding: null,
            audio_url: null,
            source_url: null,
            created_at: "2026-03-03T00:00:00Z",
            updated_at: "2026-03-03T00:00:00Z",
            deleted_at: null,
        },
    ];

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        act(() => {
            vi.runOnlyPendingTimers();
        });
        vi.useRealTimers();
    });

    it("keeps a manual selection if clicked right before autoplay triggers", () => {
        render(<HeroCarousel items={items} />);

        expect(screen.getByRole("heading", { name: "First Feature" })).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(4900);
        });

        act(() => {
            fireEvent.click(screen.getByRole("button", { name: "Go to item 3" }));
        });

        act(() => {
            vi.advanceTimersByTime(1000);
        });

        expect(screen.getByRole("heading", { name: "Third Feature" })).toBeInTheDocument();
    });

    it("keeps the hero content visible if the artwork fails twice", () => {
        render(<HeroCarousel items={items} />);

        fireEvent.error(screen.getByAltText("First Feature"));
        fireEvent.error(screen.getByAltText("First Feature"));

        expect(screen.queryByAltText("First Feature")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "First Feature" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Read" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute(
            "href",
            "/preview/11111111-1111-1111-1111-111111111111"
        );
    });

    it("shows the mobile description without hiding it on smaller screens", () => {
        render(<HeroCarousel items={items} />);

        const description = screen.getByText("Experience this Flux content today.");

        expect(description).toBeInTheDocument();
        expect(description).toHaveClass("text-sm", "md:text-xl");
        expect(description).not.toHaveClass("hidden");
    });

    it("lifts the mobile hero content stack while preserving desktop alignment classes", () => {
        render(<HeroCarousel items={items} />);

        expect(screen.getByTestId("hero-carousel-content")).toHaveClass("pb-12", "md:pb-0");
    });

    it("falls back to the default description when no hook or big idea exists", () => {
        render(<HeroCarousel items={items} />);

        expect(screen.getByText("Experience this Flux content today.")).toBeInTheDocument();
    });
});
