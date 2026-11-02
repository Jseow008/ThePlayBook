import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionCard } from "@/components/reader/CompletionCard";

const useReadingProgressMock = vi.fn();
const useRecommendationsMock = vi.fn();
const useReflectionsMock = vi.fn();

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

vi.mock("@/hooks/useReflections", () => ({
    useReflections: () => useReflectionsMock(),
    useSaveReflection: () => ({
        isPending: false,
        mutateAsync: vi.fn(),
    }),
    useDeleteReflection: () => ({
        isPending: false,
        mutateAsync: vi.fn(),
    }),
}));

vi.mock("@/components/ui/ContentFeedback", () => ({
    ContentFeedback: () => <div data-testid="mock-content-feedback" />,
}));

vi.mock("@/components/reader/AuthorChat", () => ({
    AuthorChat: ({ onClose }: { onClose: () => void }) => <div data-testid="mock-author-chat"><button onClick={onClose}>Close test chat</button></div>,
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

vi.mock("@/lib/analytics", () => ({
    captureAnalyticsEvent: vi.fn(),
}));

describe("CompletionCard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useReflectionsMock.mockReturnValue({ data: [] });
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
        expect(screen.queryByText("Sign in to save your progress")).not.toBeInTheDocument();
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

    it("shows the sign-in prompt for hydrated guests", () => {
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

        expect(screen.getByRole("link", { name: "Sign in to save your progress" })).toHaveAttribute(
            "href",
            "/login?next=%2Fread%2Ftest-item"
        );
    });

    it("does not show the sign-in prompt for authenticated readers", () => {
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

        expect(screen.queryByText("Sign in to save your progress")).not.toBeInTheDocument();
    });

    it("sends readers directly to Browse when no recommendation is available", () => {
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

        expect(screen.getByRole("link", { name: /explore more/i })).toHaveAttribute("href", "/browse");
    });

    it("opens the reflection composer when the compact capture action is selected", () => {
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

        fireEvent.click(screen.getByRole("button", { name: /capture a reflection/i }));

        const dialog = screen.getByRole("dialog", { name: "Take a moment to reflect" });
        expect(dialog).toBeInTheDocument();
        expect(dialog.parentElement).toBe(document.body);
        expect(dialog).toHaveClass("fixed", "bottom-0", "max-h-[100dvh]");
        expect(dialog.firstElementChild).toHaveClass("reader-dark", "max-h-[88dvh]");
        expect(screen.getByPlaceholderText("A few sentences is enough.")).toBeInTheDocument();
    });

    it("keeps the reflection composer aligned with the selected reader theme", () => {
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
                readerTheme="sepia"
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /capture a reflection/i }));

        expect(screen.getByRole("dialog").firstElementChild).toHaveClass("reader-sepia");
    });

    it("keeps the recommendation destination and feedback available", () => {
        useReadingProgressMock.mockReturnValue({ completedIds: [], inProgressIds: [], myListIds: [], isLoaded: true, user: null });
        useRecommendationsMock.mockReturnValue({ data: [{ id: "next-book", title: "A Next Book", author: "Test Author", cover_image_url: null }], isLoading: false });
        render(<CompletionCard contentId="test-book" title="Deep Work" author="Cal Newport" segmentCount={12} />);
        expect(screen.getByRole("link", { name: /A Next Book.*Read summary/ })).toHaveAttribute("href", "/read/next-book/a-next-book");
        expect(screen.getByTestId("mock-content-feedback")).toBeInTheDocument();
    });

    it("opens and closes the existing author chat from the compact action", async () => {
        useReadingProgressMock.mockReturnValue({ completedIds: [], inProgressIds: [], myListIds: [], isLoaded: true, user: null });
        useRecommendationsMock.mockReturnValue({ data: [], isLoading: false });
        render(<CompletionCard contentId="test-book" title="Deep Work" author="Cal Newport" segmentCount={12} />);
        fireEvent.click(screen.getByRole("button", { name: /Ask about this with Cal Newport/ }));
        expect(await screen.findByTestId("mock-author-chat")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Close test chat" }));
        expect(screen.queryByTestId("mock-author-chat")).not.toBeInTheDocument();
    });

    it("reopens the saved reflection for editing without replacing its text", () => {
        useReadingProgressMock.mockReturnValue({ completedIds: [], inProgressIds: [], myListIds: [], isLoaded: true, user: { id: "test-user" } });
        useRecommendationsMock.mockReturnValue({ data: [], isLoading: false });
        useReflectionsMock.mockReturnValue({ data: [{ id: "test-reflection", reflection_text: "Synthetic saved reflection\nSecond line", updated_at: "2026-11-02T00:00:00Z" }] });
        render(<CompletionCard contentId="test-saved-book" title="Deep Work" author="Cal Newport" segmentCount={12} />);
        fireEvent.click(screen.getByRole("button", { name: "Edit reflection" }));
        expect(screen.getByPlaceholderText("A few sentences is enough.")).toHaveValue("Synthetic saved reflection\nSecond line");
        fireEvent.click(screen.getAllByRole("button", { name: "Close reflection" })[1]);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
