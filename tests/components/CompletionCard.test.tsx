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

vi.mock("@/components/ui/SignInLink", () => ({
    SignInLink: ({
        children,
        className,
    }: {
        children: ReactNode;
        className?: string;
    }) => (
        <a href="/login?next=%2Fread%2Ftest-item" className={className}>
            {children}
        </a>
    ),
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
            user: null,
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
        expect(screen.queryByText("Sign up to save your progress.")).not.toBeInTheDocument();
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
            user: { id: "user-1" },
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

    it("shows the sign-up prompt for hydrated guests", () => {
        useReadingProgressMock.mockReturnValue({
            completedIds: [],
            inProgressIds: [],
            myListIds: [],
            isLoaded: true,
            user: null,
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

        expect(screen.getByRole("link", { name: "Sign up to save your progress." })).toHaveAttribute(
            "href",
            "/login?next=%2Fread%2Ftest-item"
        );
    });

    it("does not show the sign-up prompt for authenticated readers", () => {
        useReadingProgressMock.mockReturnValue({
            completedIds: [],
            inProgressIds: [],
            myListIds: [],
            isLoaded: true,
            user: { id: "user-1" },
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

        expect(screen.queryByText("Sign up to save your progress.")).not.toBeInTheDocument();
    });
});
