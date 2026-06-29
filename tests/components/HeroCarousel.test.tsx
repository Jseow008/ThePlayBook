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

function mockMatchMedia(prefersReducedMotion = false) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: query === "(prefers-reduced-motion: reduce)" ? prefersReducedMotion : false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
}

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
            created_at: "2026-03-03T00:00:00Z",
            updated_at: "2026-03-03T00:00:00Z",
            deleted_at: null,
        },
    ];

    beforeEach(() => {
        vi.useFakeTimers();
        mockMatchMedia(false);
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

    it("continues autoplay while the pointer is hovering over the hero", () => {
        render(<HeroCarousel items={items} />);

        fireEvent.mouseEnter(screen.getByTestId("hero-carousel-content"));

        act(() => {
            vi.advanceTimersByTime(5900);
        });

        expect(screen.getByRole("heading", { name: "Second Feature" })).toBeInTheDocument();
    });

    it("pauses autoplay while keyboard focus is inside the hero", () => {
        render(<HeroCarousel items={items} />);

        const readLink = screen.getByRole("link", { name: "Read Summary" });

        act(() => {
            fireEvent.focusIn(readLink);
        });

        act(() => {
            vi.advanceTimersByTime(7000);
        });

        expect(screen.getByRole("heading", { name: "First Feature" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Go to item 1" })).toHaveAttribute("aria-current", "true");
    });

    it("does not autoplay when reduced motion is requested", () => {
        mockMatchMedia(true);

        render(<HeroCarousel items={items} />);

        act(() => {
            vi.advanceTimersByTime(7000);
        });

        expect(screen.getByRole("heading", { name: "First Feature" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Go to item 1" })).toHaveAttribute("aria-current", "true");
    });

    it("exposes focused and current states on manual indicators", () => {
        render(<HeroCarousel items={items} />);

        const firstIndicator = screen.getByRole("button", { name: "Go to item 1" });
        const secondIndicator = screen.getByRole("button", { name: "Go to item 2" });

        expect(firstIndicator).toHaveAttribute("aria-current", "true");
        expect(firstIndicator).toHaveClass("focus-visible:ring-2", "focus-visible:ring-white");
        expect(secondIndicator).not.toHaveAttribute("aria-current");
    });

    it("lets pointer users open the current preview from the active artwork", () => {
        render(<HeroCarousel items={items} />);

        const artworkPreviewLink = screen.getByRole("link", { name: "Preview First Feature" });

        expect(artworkPreviewLink).toHaveAttribute("href", "/preview/11111111-1111-1111-1111-111111111111");
        expect(artworkPreviewLink).toHaveAttribute("tabindex", "-1");
    });

    it("keeps the hero content visible if the artwork fails twice", () => {
        render(<HeroCarousel items={items} />);

        fireEvent.error(screen.getByAltText("First Feature"));
        fireEvent.error(screen.getByAltText("First Feature"));

        expect(screen.queryByAltText("First Feature")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "First Feature" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Read Summary" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Preview Takeaways" })).toHaveAttribute(
            "href",
            "/preview/11111111-1111-1111-1111-111111111111"
        );
    });

    it("shows the mobile description without hiding it on smaller screens", () => {
        render(<HeroCarousel items={items} />);

        const description = screen.getByText("Experience this Netflux content today.");

        expect(description).toBeInTheDocument();
        expect(description).toHaveClass("text-sm", "md:text-lg", "lg:text-xl");
        expect(description).not.toHaveClass("hidden");
    });

    it("lifts the mobile hero content stack while preserving desktop alignment classes", () => {
        render(<HeroCarousel items={items} />);

        expect(screen.getByTestId("hero-carousel-content")).toHaveClass("pb-12", "md:pb-0");
    });

    it("falls back to the default description when no hook or big idea exists", () => {
        render(<HeroCarousel items={items} />);

        expect(screen.getByText("Experience this Netflux content today.")).toBeInTheDocument();
    });
});
