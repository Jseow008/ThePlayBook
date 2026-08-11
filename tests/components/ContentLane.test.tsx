import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

    it("keeps Explore All beside the header and desktop-only", () => {
        render(<ContentLane title="Topic Lane" items={items} viewAllHref="/search?category=Productivity" />);

        const link = screen.getByRole("link", { name: "Explore All" });

        expect(link).toHaveAttribute("href", "/search?category=Productivity");
        expect(link).toHaveClass("hidden", "md:inline-flex", "md:group-hover/lane:opacity-100");
    });
});
