import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentLane } from "@/components/ui/ContentLane";
import { COMPACT_SHELF_CARD_CLASS } from "@/components/ui/content-card-standards";
import type { ContentItem } from "@/types/database";

vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("@/components/ui/ContentCard", () => ({
    ContentCard: ({
        item,
        navigationMode,
        titleDensity,
        showDesktopQuickActions,
        showUserCompletionBadge,
    }: {
        item: ContentItem;
        navigationMode?: "preview" | "resume";
        titleDensity?: "default" | "app-compact";
        showDesktopQuickActions?: boolean;
        showUserCompletionBadge?: boolean;
    }) => (
        <div>{`${navigationMode ?? "preview"}:${titleDensity ?? "default"}:${String(showDesktopQuickActions)}:${String(showUserCompletionBadge)}:${item.title}`}</div>
    ),
}));

describe("ContentLane", () => {
    let desktop: MediaQueryList;
    let change: (() => void) | undefined;
    beforeEach(() => {
        desktop = {
            matches: true,
            addEventListener: vi.fn((_type, listener) => { change = listener; }),
            removeEventListener: vi.fn(),
        } as unknown as MediaQueryList;
        vi.spyOn(window, "matchMedia").mockReturnValue(desktop);
    });
    afterEach(() => vi.restoreAllMocks());

    const items: ContentItem[] = [
        {
            id: "11111111-1111-1111-1111-111111111111",
            title: "One",
            type: "article",
            status: "verified",
            quick_mode_json: null,
            duration_seconds: null,
            author: null,
            cover_image_url: null,
            hero_image_url: null,
            category: null,
            is_featured: false,
        narration_completed_at: null,
        narration_error: null,
        narration_progress_at: null,
        narration_segments_completed: 0,
        narration_segments_total: null,
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
        isbn: null,
        },
        {
            id: "22222222-2222-2222-2222-222222222222",
            title: "Two",
            type: "article",
            status: "verified",
            quick_mode_json: null,
            duration_seconds: null,
            author: null,
            cover_image_url: null,
            hero_image_url: null,
            category: null,
            is_featured: false,
        narration_completed_at: null,
        narration_error: null,
        narration_progress_at: null,
        narration_segments_completed: 0,
        narration_segments_total: null,
        narration_requested_at: null,
        narration_started_at: null,
        narration_status: "completed",
        series_id: null,
        series_order: null,
            embedding: null,
            audio_url: null,
            source_url: null,
            created_at: "2026-03-02T00:00:00Z",
            published_at: "2026-03-02T00:00:00Z",
            updated_at: "2026-03-02T00:00:00Z",
            deleted_at: null,
        isbn: null,
        },
    ];

    it("recalculates arrow visibility based on actual overflow", () => {
        const { container } = render(<ContentLane title="Test Lane" items={items} />);
        const scroller = container.querySelector(".overflow-x-auto") as HTMLDivElement;
        const rightArrow = screen.getByRole("button", { name: "Scroll right" });

        Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 800 });
        Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 800 });
        Object.defineProperty(scroller, "scrollLeft", { configurable: true, value: 0 });

        act(() => {
            window.dispatchEvent(new Event("resize"));
        });

        expect(rightArrow.className).toContain("pointer-events-none");

        Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 1200 });

        act(() => {
            window.dispatchEvent(new Event("resize"));
        });

        expect(rightArrow.className).not.toContain("pointer-events-none");
        expect(rightArrow.className).not.toContain("lg:-right-4");
        expect(rightArrow).toHaveClass("hidden", "md:flex");
    });

    it("starts and stops arrow measurements when crossing the desktop breakpoint", () => {
        Object.defineProperty(desktop, "matches", { configurable: true, value: false });
        const observe = vi.spyOn(ResizeObserver.prototype, "observe");
        const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
        const { container, unmount } = render(<ContentLane title="Responsive Lane" items={items} />);
        const scroller = container.querySelector(".overflow-x-auto") as HTMLDivElement;
        const width = vi.fn(() => 1200);
        Object.defineProperty(scroller, "scrollWidth", { configurable: true, get: width });
        Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 800 });
        expect(observe).not.toHaveBeenCalled();
        act(() => scroller.dispatchEvent(new Event("scroll")));
        expect(width).not.toHaveBeenCalled();

        Object.defineProperty(desktop, "matches", { value: true });
        act(() => change?.());
        expect(observe).toHaveBeenCalledTimes(3); // Container plus two cards.
        expect(screen.getByRole("button", { name: "Scroll right" }).className).not.toContain("pointer-events-none");

        Object.defineProperty(desktop, "matches", { value: false });
        act(() => change?.());
        expect(disconnect).toHaveBeenCalledOnce();
        width.mockClear();
        act(() => {
            scroller.dispatchEvent(new Event("scroll"));
            window.dispatchEvent(new Event("resize"));
        });
        expect(width).not.toHaveBeenCalled();
        unmount();
        expect(desktop.removeEventListener).toHaveBeenCalledWith("change", change);
    });

    it("passes through the requested card navigation mode", () => {
        render(<ContentLane title="Resume Lane" items={items} cardNavigationMode="resume" />);

        expect(screen.getByText("resume:default:false:false:One")).toBeInTheDocument();
        expect(screen.getByText("resume:default:false:false:Two")).toBeInTheDocument();
    });

    it("renders lane cards with the compact shelf sizing standard", () => {
        const { container } = render(<ContentLane title="Standard Lane" items={items} />);

        const laneCard = container.querySelector("[data-content-lane-card]");
        expect(laneCard).toHaveClass(...COMPACT_SHELF_CARD_CLASS.split(" "));
    });

    it("passes through the requested card title density", () => {
        render(<ContentLane title="Compact Lane" items={items} cardTitleDensity="app-compact" />);

        expect(screen.getByText("preview:app-compact:false:false:One")).toBeInTheDocument();
        expect(screen.getByText("preview:app-compact:false:false:Two")).toBeInTheDocument();
    });

    it("passes through desktop quick actions when requested", () => {
        render(<ContentLane title="Action Lane" items={items} showCardDesktopQuickActions />);

        expect(screen.getByText("preview:default:true:false:One")).toBeInTheDocument();
        expect(screen.getByText("preview:default:true:false:Two")).toBeInTheDocument();
    });

    it("passes through user completion badges when requested", () => {
        render(<ContentLane title="Completed Lane" items={items} showCardUserCompletionBadge />);

        expect(screen.getByText("preview:default:false:true:One")).toBeInTheDocument();
        expect(screen.getByText("preview:default:false:true:Two")).toBeInTheDocument();
    });

    it("shows responsive lane links only when a complete collection exists", () => {
        render(<ContentLane title="Topic Lane" items={items} viewAllHref="/search?category=Productivity" />);

        const desktopLink = screen.getByRole("link", { name: "Explore All" });
        const mobileLink = screen.getByRole("link", { name: "See all" });

        expect(desktopLink).toHaveAttribute("href", "/search?category=Productivity");
        expect(desktopLink).toHaveClass("hidden", "md:inline-flex", "md:group-hover/lane:opacity-100");
        expect(mobileLink).toHaveAttribute("href", "/search?category=Productivity");
        expect(mobileLink).toHaveClass("inline-flex", "md:hidden", "touch-target-44");
    });

    it("omits responsive lane links when every matching item is already shown", () => {
        render(<ContentLane title="Complete Lane" items={items} />);

        expect(screen.queryByRole("link", { name: "Explore All" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "See all" })).not.toBeInTheDocument();
    });
});
