import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeFeed } from "@/components/ui/HomeFeed";
import type { ContentItem, HomepageSection } from "@/types/database";

vi.mock("@/components/ui/HeroCarousel", () => ({
    HeroCarousel: () => <div data-testid="hero-carousel" />,
}));

vi.mock("@/components/ui/RecommendationsRow", () => ({
    RecommendationsRow: () => <div data-testid="recommendations-row" />,
}));

vi.mock("@/components/ui/Logo", () => ({
    Logo: () => <span>Netflux</span>,
}));

vi.mock("@/components/ui/ContentLane", () => ({
    ContentLane: ({
        title,
        enableCardUserState,
        viewAllHref,
    }: {
        title: React.ReactNode;
        enableCardUserState?: boolean;
        viewAllHref?: string;
    }) => (
        <div
            data-testid="content-lane"
            data-enable-card-user-state={String(enableCardUserState)}
            data-view-all-href={viewAllHref ?? ""}
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

    it("leaves browse feed cards interactive so bookmark buttons can save to My List", () => {
        render(
            <HomeFeed
                items={[item]}
                featuredItems={[item]}
                sections={[section]}
                sectionItems={{ [section.id]: [item] }}
            />
        );

        expect(screen.getByText("New on")).toBeInTheDocument();
        expect(screen.getByText("Netflux")).toBeInTheDocument();
        expect(screen.getByText("Featured Section")).toBeInTheDocument();

        for (const lane of screen.getAllByTestId("content-lane")) {
            expect(lane).toHaveAttribute("data-enable-card-user-state", "undefined");
        }
    });

    it("does not show a generic view-all link for the new-on-netflux lane", () => {
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
});
