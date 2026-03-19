import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentItem } from "@/types/database";
import { RecommendationsRow } from "@/components/ui/RecommendationsRow";

const useReadingProgressMock = vi.fn();
const useRecommendationsMock = vi.fn();
const useBatchContentItemsMock = vi.fn();

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => useReadingProgressMock(),
}));

vi.mock("@/hooks/use-content-queries", () => ({
    useRecommendations: (...args: unknown[]) => useRecommendationsMock(...args),
    useBatchContentItems: (...args: unknown[]) => useBatchContentItemsMock(...args),
}));

vi.mock("@/components/ui/ContentLane", () => ({
    ContentLane: ({
        title,
        items,
    }: {
        title: ReactNode;
        items: ContentItem[];
    }) => (
        <section>
            <h2>{title}</h2>
            <div>{items.map((item) => item.title).join(", ")}</div>
        </section>
    ),
}));

describe("RecommendationsRow", () => {
    const recommendation: ContentItem = {
        id: "11111111-1111-1111-1111-111111111111",
        title: "The Comfort Crisis",
        type: "book",
        status: "verified",
        quick_mode_json: null,
        duration_seconds: 240,
        author: "Michael Easter",
        cover_image_url: null,
        hero_image_url: null,
        category: "Lifestyle",
        is_featured: false,
        embedding: null,
        audio_url: null,
        source_url: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
        deleted_at: null,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("keeps rendering recommendation lanes when supporting title data is still loading", () => {
        useReadingProgressMock.mockReturnValue({
            completedIds: [recommendation.id],
            inProgressIds: [],
            myListIds: [
                recommendation.id,
                "22222222-2222-2222-2222-222222222222",
                "33333333-3333-3333-3333-333333333333",
                "44444444-4444-4444-4444-444444444444",
                "55555555-5555-5555-5555-555555555555",
            ],
            isLoaded: true,
        });

        useRecommendationsMock
            .mockReturnValueOnce({ data: [recommendation], isLoading: false })
            .mockReturnValueOnce({ data: [], isLoading: false });
        useBatchContentItemsMock.mockReturnValue({ data: [], isLoading: true });

        const { container } = render(<RecommendationsRow />);

        expect(screen.getByRole("heading", { name: "Because of your recent reading" })).toBeInTheDocument();
        expect(screen.getByText("The Comfort Crisis")).toBeInTheDocument();
        expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
    });

    it("shows the loading skeleton only when no recommendation items are available yet", () => {
        useReadingProgressMock.mockReturnValue({
            completedIds: [recommendation.id],
            inProgressIds: [],
            myListIds: [],
            isLoaded: true,
        });

        useRecommendationsMock.mockReturnValue({ data: [], isLoading: true });
        useBatchContentItemsMock.mockReturnValue({ data: [], isLoading: true });

        const { container } = render(<RecommendationsRow />);

        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
        expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    });
});
