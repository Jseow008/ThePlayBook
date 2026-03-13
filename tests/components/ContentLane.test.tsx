import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContentLane } from "@/components/ui/ContentLane";
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
    }: {
        item: ContentItem;
        navigationMode?: "preview" | "resume";
        titleDensity?: "default" | "browse-compact";
    }) => (
        <div>{`${navigationMode ?? "preview"}:${titleDensity ?? "default"}:${item.title}`}</div>
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
            embedding: null,
            audio_url: null,
            source_url: null,
            created_at: "2026-03-01T00:00:00Z",
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
            embedding: null,
            audio_url: null,
            source_url: null,
            created_at: "2026-03-02T00:00:00Z",
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
    });

    it("passes through the requested card navigation mode", () => {
        render(<ContentLane title="Resume Lane" items={items} cardNavigationMode="resume" />);

        expect(screen.getByText("resume:default:One")).toBeInTheDocument();
        expect(screen.getByText("resume:default:Two")).toBeInTheDocument();
    });

    it("passes through the requested card title density", () => {
        render(<ContentLane title="Compact Lane" items={items} cardTitleDensity="browse-compact" />);

        expect(screen.getByText("preview:browse-compact:One")).toBeInTheDocument();
        expect(screen.getByText("preview:browse-compact:Two")).toBeInTheDocument();
    });
});
