import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentItem } from "@/types/database";
import { RecommendationsRow } from "@/components/ui/RecommendationsRow";

const useReadingProgressMock = vi.fn();
const useBrowseRecommendationsMock = vi.fn();

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => useReadingProgressMock(),
}));

vi.mock("@/hooks/use-content-queries", () => ({
    useBrowseRecommendations: (...args: unknown[]) => useBrowseRecommendationsMock(...args),
}));

vi.mock("@/components/ui/ContentLane", () => ({
    ContentLane: ({
        title,
        items,
        showCardUserCompletionBadge,
    }: {
        title: ReactNode;
        items: ContentItem[];
        showCardUserCompletionBadge?: boolean;
    }) => (
        <section data-user-completion-badge={String(showCardUserCompletionBadge)}>
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

    beforeEach(() => {
        vi.clearAllMocks();
        useBrowseRecommendationsMock.mockReturnValue({ data: undefined, isLoading: false });
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

        useBrowseRecommendationsMock.mockReturnValueOnce({
            data: { recentItems: [recommendation], libraryItems: [] },
            isLoading: false,
        });

        const { container } = render(<RecommendationsRow />);

        expect(screen.getByRole("heading", { name: "Based on your recent reading" })).toBeInTheDocument();
        expect(screen.getByText("The Comfort Crisis")).toBeInTheDocument();
        expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
    });

    it("passes known user items to the browse recommendations query", () => {
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

        useBrowseRecommendationsMock.mockReturnValueOnce({
            data: { recentItems: [recommendation], libraryItems: [] },
            isLoading: false,
        });

        render(<RecommendationsRow />);

        expect(useBrowseRecommendationsMock).toHaveBeenCalledTimes(1);
        expect(useBrowseRecommendationsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                recentSeedId: recommendation.id,
                librarySeedIds: [
                    recommendation.id,
                    "22222222-2222-2222-2222-222222222222",
                    "33333333-3333-3333-3333-333333333333",
                    "44444444-4444-4444-4444-444444444444",
                    "55555555-5555-5555-5555-555555555555",
                ],
                excludeIds: [
                    recommendation.id,
                    "66666666-6666-6666-6666-666666666666",
                    "22222222-2222-2222-2222-222222222222",
                    "33333333-3333-3333-3333-333333333333",
                    "44444444-4444-4444-4444-444444444444",
                    "55555555-5555-5555-5555-555555555555",
                ],
                enabled: true,
                targetCount: 10,
            }),
        );
    });

    it("passes the Browse completion status option to recommendation lanes", () => {
        useReadingProgressMock.mockReturnValue({
            completedIds: [recommendation.id],
            inProgressIds: [],
            myListIds: [],
            isLoaded: true,
        });
        useBrowseRecommendationsMock.mockReturnValueOnce({
            data: { recentItems: [recommendation], libraryItems: [] },
            isLoading: false,
        });

        render(<RecommendationsRow showUserCompletionBadge />);

        expect(screen.getByRole("heading", { name: "Based on your recent reading" }).closest("section"))
            .toHaveAttribute("data-user-completion-badge", "true");
    });

    it("renders the server-deduped library lane", () => {
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

        useBrowseRecommendationsMock.mockReturnValueOnce({
            data: {
                recentItems: [recommendation],
                libraryItems: [additionalRecommendation],
            },
            isLoading: false,
        });

        render(<RecommendationsRow />);

        const generalLane = screen.getByRole("heading", { name: "Based on your library" }).closest("section");
        expect(generalLane).not.toBeNull();
        expect(within(generalLane!).getByText("Atomic Habits")).toBeInTheDocument();
        expect(within(generalLane!).queryByText(/The Comfort Crisis/)).not.toBeInTheDocument();
    });

    it("stays collapsed while recommendations are loading without available items", () => {
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

        useBrowseRecommendationsMock.mockReturnValueOnce({ data: undefined, isLoading: true });

        const { container } = render(<RecommendationsRow />);

        expect(screen.queryByRole("heading")).not.toBeInTheDocument();
        expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
        expect(container).toBeEmptyDOMElement();
    });

    it("uses one stable browse recommendations query", () => {
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

        useBrowseRecommendationsMock.mockReturnValueOnce({ data: undefined, isLoading: true });

        render(<RecommendationsRow />);

        expect(useBrowseRecommendationsMock).toHaveBeenCalledTimes(1);
        expect(useBrowseRecommendationsMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    });

    it("caps library recommendation seeds while preserving full exclusions", () => {
        const completedIds = [recommendation.id];
        const myListIds = Array.from({ length: 25 }, (_, index) =>
            `77777777-7777-7777-7777-${String(index).padStart(12, "0")}`
        );

        useReadingProgressMock.mockReturnValue({
            completedIds,
            inProgressIds: [],
            myListIds,
            isLoaded: true,
        });

        useBrowseRecommendationsMock.mockReturnValueOnce({
            data: { recentItems: [recommendation], libraryItems: [] },
            isLoading: false,
        });

        render(<RecommendationsRow />);

        expect(useBrowseRecommendationsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                librarySeedIds: [recommendation.id, ...myListIds].slice(0, 20),
                excludeIds: [recommendation.id, ...myListIds],
            }),
        );
    });
});
