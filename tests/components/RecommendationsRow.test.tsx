import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentItem } from "@/types/database";
import { RecommendationsRow } from "@/components/ui/RecommendationsRow";

const useReadingProgressMock = vi.fn();
const useRecommendationsMock = vi.fn();

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => useReadingProgressMock(),
}));

vi.mock("@/hooks/use-content-queries", () => ({
    useRecommendations: (...args: unknown[]) => useRecommendationsMock(...args),
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

        const { container } = render(<RecommendationsRow />);

        expect(screen.getByRole("heading", { name: "Because of your recent reading" })).toBeInTheDocument();
        expect(screen.getByText("The Comfort Crisis")).toBeInTheDocument();
        expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
    });

    it("passes known user items as exclusions to both recommendation queries", () => {
        useReadingProgressMock.mockReturnValue({
            completedIds: [recommendation.id],
            inProgressIds: ["66666666-6666-6666-6666-666666666666"],
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

        render(<RecommendationsRow />);

        expect(useRecommendationsMock).toHaveBeenNthCalledWith(
            1,
            [recommendation.id],
            expect.objectContaining({
                excludeIds: [
                    recommendation.id,
                    "66666666-6666-6666-6666-666666666666",
                    "22222222-2222-2222-2222-222222222222",
                    "33333333-3333-3333-3333-333333333333",
                    "44444444-4444-4444-4444-444444444444",
                    "55555555-5555-5555-5555-555555555555",
                ],
            }),
        );
        expect(useRecommendationsMock).toHaveBeenNthCalledWith(
            2,
            [
                recommendation.id,
                "22222222-2222-2222-2222-222222222222",
                "33333333-3333-3333-3333-333333333333",
                "44444444-4444-4444-4444-444444444444",
                "55555555-5555-5555-5555-555555555555",
            ],
            expect.objectContaining({
                excludeIds: [
                    recommendation.id,
                    "66666666-6666-6666-6666-666666666666",
                    "22222222-2222-2222-2222-222222222222",
                    "33333333-3333-3333-3333-333333333333",
                    "44444444-4444-4444-4444-444444444444",
                    "55555555-5555-5555-5555-555555555555",
                ],
            }),
        );
    });

    it("filters duplicate titles from the general lane when the recent lane already shows them", () => {
        const additionalRecommendation: ContentItem = {
            ...recommendation,
            id: "22222222-2222-2222-2222-222222222222",
            title: "Atomic Habits",
            author: "James Clear",
        };

        useReadingProgressMock.mockReturnValue({
            completedIds: [recommendation.id],
            inProgressIds: [],
            myListIds: [
                recommendation.id,
                additionalRecommendation.id,
                "33333333-3333-3333-3333-333333333333",
                "44444444-4444-4444-4444-444444444444",
                "55555555-5555-5555-5555-555555555555",
            ],
            isLoaded: true,
        });

        useRecommendationsMock
            .mockReturnValueOnce({ data: [recommendation], isLoading: false })
            .mockReturnValueOnce({ data: [recommendation, additionalRecommendation], isLoading: false });

        render(<RecommendationsRow />);

        const generalLane = screen.getByRole("heading", { name: "Recommended for You" }).closest("section");
        expect(generalLane).not.toBeNull();
        expect(within(generalLane!).getByText("Atomic Habits")).toBeInTheDocument();
        expect(within(generalLane!).queryByText(/The Comfort Crisis/)).not.toBeInTheDocument();
    });

    it("shows the loading skeleton only when no recommendation items are available yet", () => {
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
            .mockReturnValueOnce({ data: [], isLoading: true })
            .mockReturnValueOnce({ data: [], isLoading: false });

        const { container } = render(<RecommendationsRow />);

        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
        expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    });

    it("waits for the recent lane to settle before enabling the general lane", () => {
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
            .mockReturnValueOnce({ data: [], isLoading: true })
            .mockReturnValueOnce({ data: [], isLoading: false });

        render(<RecommendationsRow />);

        expect(useRecommendationsMock).toHaveBeenNthCalledWith(
            2,
            expect.any(Array),
            expect.objectContaining({
                enabled: false,
            }),
        );
    });
});
