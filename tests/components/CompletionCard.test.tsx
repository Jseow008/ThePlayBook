import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionCard } from "@/components/reader/CompletionCard";

const useReadingProgressMock = vi.fn();
const useRecommendationsMock = vi.fn();

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        className,
    }: {
        children: ReactNode;
        href: string;
        className?: string;
    }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => useReadingProgressMock(),
}));

vi.mock("@/hooks/use-content-queries", () => ({
    useRecommendations: (...args: unknown[]) => useRecommendationsMock(...args),
}));

vi.mock("@/components/ui/ContentFeedback", () => ({
    ContentFeedback: () => <div data-testid="mock-content-feedback" />,
}));

vi.mock("@/components/reader/AuthorChat", () => ({
    AuthorChat: () => <div data-testid="mock-author-chat" />,
}));

vi.mock("@/components/ui/ResilientImage", () => ({
    ResilientImage: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

describe("CompletionCard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("keeps the loading state visible until reading progress hydration finishes", () => {
        useReadingProgressMock.mockReturnValue({
            completedIds: ["11111111-1111-1111-1111-111111111111"],
            inProgressIds: [],
            myListIds: [],
            isLoaded: false,
        });
        useRecommendationsMock.mockReturnValue({
            data: [],
            isLoading: false,
            isPlaceholderData: false,
        });

        render(
            <CompletionCard
                contentId="11111111-1111-1111-1111-111111111111"
                title="Deep Work"
                author="Cal Newport"
                segmentCount={12}
            />
        );

        expect(screen.getByText("Finding your next read...")).toBeInTheDocument();
        expect(screen.queryByText("Explore More")).not.toBeInTheDocument();
    });

    it("passes completed ids as exclusions when requesting the next recommendation", () => {
        useReadingProgressMock.mockReturnValue({
            completedIds: [
                "11111111-1111-1111-1111-111111111111",
                "22222222-2222-2222-2222-222222222222",
            ],
            inProgressIds: [],
            myListIds: [],
            isLoaded: true,
        });
        useRecommendationsMock.mockReturnValue({
            data: [],
            isLoading: false,
            isPlaceholderData: false,
        });

        render(
            <CompletionCard
                contentId="11111111-1111-1111-1111-111111111111"
                title="Deep Work"
                author="Cal Newport"
                segmentCount={12}
            />
        );

        expect(useRecommendationsMock).toHaveBeenCalledWith(
            ["11111111-1111-1111-1111-111111111111"],
            {
                enabled: true,
                excludeIds: [
                    "11111111-1111-1111-1111-111111111111",
                    "22222222-2222-2222-2222-222222222222",
                ],
                matchCount: 1,
            },
        );
    });
});
