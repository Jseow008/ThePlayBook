import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeFeed } from "@/components/ui/HomeFeed";
import type { ContentItem, HomepageSection } from "@/types/database";

vi.mock("@/components/ui/HeroCarousel", () => ({
    HeroCarousel: () => <div data-testid="hero-carousel" />,
}));

vi.mock("@/components/ui/RecommendationsRow", () => ({
    RecommendationsRow: ({ showUserCompletionBadge }: { showUserCompletionBadge?: boolean }) => (
        <div
            data-testid="recommendations-row"
            data-user-completion-badge={String(showUserCompletionBadge)}
        />
    ),
}));

vi.mock("@/components/ui/Logo", () => ({
    Logo: () => <span>Netflux</span>,
}));

vi.mock("@/components/ui/ContentLane", () => ({
    ContentLane: ({
        title,
        enableCardUserState,
        viewAllHref,
        showCardDesktopQuickActions,
        showCardUserCompletionBadge,
    }: {
        title: React.ReactNode;
        enableCardUserState?: boolean;
        viewAllHref?: string;
        showCardDesktopQuickActions?: boolean;
        showCardUserCompletionBadge?: boolean;
    }) => (
        <div
            data-testid="content-lane"
            data-enable-card-user-state={String(enableCardUserState)}
            data-view-all-href={viewAllHref ?? ""}
            data-desktop-quick-actions={String(showCardDesktopQuickActions)}
            data-user-completion-badge={String(showCardUserCompletionBadge)}
        >
            {title}
        </div>
    ),
}));

describe("HomeFeed", () => {
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

    const section: HomepageSection = {
        id: "section-1",
        title: "Featured Section",
        filter_type: "category",
        filter_value: "Productivity",
        order_index: 1,
        is_active: true,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
    };

    const buildItems = (count: number) => Array.from({ length: count }, (_, index) => ({
        ...item,
        id: `${String(index + 1).padStart(8, "0")}-1111-1111-1111-111111111111`,
        title: `Item ${index + 1}`,
    }));

    it("leaves browse feed cards interactive so bookmark buttons can save to Library", () => {
        render(
            <HomeFeed
                items={[item]}
                featuredItems={[item]}
                sections={[section]}
                sectionItems={{ [section.id]: [item] }}
            />
        );

        const [newOnNetfluxLane] = screen.getAllByTestId("content-lane");

        expect(newOnNetfluxLane).toHaveTextContent("New on Netflux");
        expect(screen.getByText("Featured Section")).toBeInTheDocument();

        for (const lane of screen.getAllByTestId("content-lane")) {
            expect(lane).toHaveAttribute("data-enable-card-user-state", "undefined");
            expect(lane).toHaveAttribute("data-desktop-quick-actions", "true");
            expect(lane).toHaveAttribute("data-user-completion-badge", "true");
        }
        expect(screen.getByTestId("recommendations-row")).toHaveAttribute(
            "data-user-completion-badge",
            "true",
        );
    });

    it("does not show Explore All when the newest shelf contains every matching item", () => {
        render(
            <HomeFeed
                items={[item]}
                featuredItems={[item]}
                sections={[]}
                sectionItems={{}}
            />
        );

        const [newOnNetfluxLane] = screen.getAllByTestId("content-lane");

        expect(newOnNetfluxLane).toHaveTextContent("New on Netflux");
        expect(newOnNetfluxLane).toHaveAttribute("data-view-all-href", "");
    });

    it("links the newest shelf to the full catalog when an additional item exists", () => {
        render(
            <HomeFeed
                items={buildItems(11)}
                featuredItems={[item]}
                sections={[]}
                sectionItems={{}}
            />
        );

        const [newOnNetfluxLane] = screen.getAllByTestId("content-lane");

        expect(newOnNetfluxLane).toHaveAttribute("data-view-all-href", "/search");
    });

    it("links category shelves to their exact catalog when an additional item exists", () => {
        render(
            <HomeFeed
                items={[item]}
                featuredItems={[item]}
                sections={[section]}
                sectionItems={{ [section.id]: buildItems(11) }}
            />
        );

        const categoryLane = screen.getAllByTestId("content-lane")[1];

        expect(categoryLane).toHaveAttribute(
            "data-view-all-href",
            "/search?category=Productivity",
        );
    });

    it.each([
        ["author", "Steven Bartlett", "/search?q=Steven+Bartlett"],
        ["title", "Diary of a CEO", "/search?q=Diary+of+a+CEO"],
    ])("links %s shelves to keyword search results", (filterType, filterValue, expectedHref) => {
        const keywordSection = {
            ...section,
            filter_type: filterType,
            filter_value: filterValue,
        };

        render(
            <HomeFeed
                items={[item]}
                featuredItems={[item]}
                sections={[keywordSection]}
                sectionItems={{ [keywordSection.id]: buildItems(11) }}
            />
        );

        const keywordLane = screen.getAllByTestId("content-lane")[1];

        expect(keywordLane).toHaveAttribute("data-view-all-href", expectedHref);
    });

    it("does not link featured shelves without an equivalent Search filter", () => {
        const featuredSection = {
            ...section,
            filter_type: "featured",
            filter_value: "true",
        };

        render(
            <HomeFeed
                items={[item]}
                featuredItems={[item]}
                sections={[featuredSection]}
                sectionItems={{ [featuredSection.id]: buildItems(11) }}
            />
        );

        const featuredLane = screen.getAllByTestId("content-lane")[1];

        expect(featuredLane).toHaveAttribute("data-view-all-href", "");
    });

    it("offers desktop-only recovery actions after the final lane and before the footer", () => {
        render(
            <HomeFeed
                items={[item]}
                featuredItems={[item]}
                sections={[]}
                sectionItems={{}}
            />
        );

        const recoveryTitle = screen.getByRole("heading", {
            name: "Haven't found the right summary?",
        });
        const recoverySection = recoveryTitle.closest("section");
        const recommendations = screen.getByTestId("recommendations-row");
        const footer = screen.getByRole("contentinfo");

        expect(recoverySection).not.toBeNull();
        expect(recoverySection).toHaveClass("hidden", "md:block");
        const searchLink = screen.getByRole("link", { name: "Search all summaries" });
        const askLink = screen.getByRole("link", { name: "Ask Netflux" });

        expect(searchLink).toHaveAttribute("href", "/search");
        expect(searchLink).toHaveClass("min-h-10");
        expect(askLink).toHaveAttribute("href", "/ask");
        expect(askLink).toHaveClass("min-h-10");
        expect(recommendations.compareDocumentPosition(recoverySection!) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy();
        expect(recoverySection!.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy();
    });

    it("expands footer link touch targets without changing their labels", () => {
        render(
            <HomeFeed
                items={[item]}
                featuredItems={[item]}
                sections={[]}
                sectionItems={{}}
            />
        );

        for (const label of ["Browse", "About", "Contact", "Privacy", "Terms"]) {
            expect(screen.getByRole("link", { name: label })).toHaveClass("touch-target-44");
        }
    });
});
