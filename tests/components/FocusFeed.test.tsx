import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusFeed } from "@/components/focus/FocusFeed";

const { readingProgressState, mediaQueryState } = vi.hoisted(() => ({
    readingProgressState: {
        value: {
            completedIds: ["123e4567-e89b-12d3-a456-426614174111"],
            isLoaded: true,
        },
    },
    mediaQueryState: {
        value: false,
    },
}));

const scrollIntoViewMock = vi.fn();
const observerInstances: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {
        observerInstances.push(this);
    }

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = "";
    thresholds = [];

    trigger(target: Element, intersectionRatio = 0.85) {
        this.callback(
            [
                {
                    isIntersecting: true,
                    intersectionRatio,
                    target,
                } as IntersectionObserverEntry,
            ],
            this as unknown as IntersectionObserver
        );
    }
}

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: React.ReactNode;
        href: string;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("next/image", () => ({
    default: (
        props: ImgHTMLAttributes<HTMLImageElement> & {
            fill?: boolean;
            priority?: boolean;
            unoptimized?: boolean;
        }
    ) => {
        const { alt, src, fill, priority, unoptimized, ...safeProps } = props;
        void fill;
        void priority;
        void unoptimized;
        return <img alt={alt} src={src} {...safeProps} />;
    },
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => readingProgressState.value,
}));

vi.mock("@/hooks/useMediaQuery", () => ({
    useMediaQuery: () => mediaQueryState.value,
}));

describe("FocusFeed", () => {
    const fetchMock = vi.fn();

    beforeAll(() => {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
            configurable: true,
            value: scrollIntoViewMock,
        });

        vi.stubGlobal(
            "IntersectionObserver",
            MockIntersectionObserver as unknown as typeof IntersectionObserver
        );
    });

    beforeEach(() => {
        vi.clearAllMocks();
        observerInstances.length = 0;
        readingProgressState.value = {
            completedIds: ["123e4567-e89b-12d3-a456-426614174111"],
            isLoaded: true,
        };
        mediaQueryState.value = false;
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => [
                {
                    id: "123e4567-e89b-12d3-a456-426614174222",
                    title: "Essentialism",
                    type: "book",
                    author: "Greg McKeown",
                    category: "Productivity",
                    cover_image_url: "https://example.com/essentialism.jpg",
                    duration_seconds: 900,
                    quick_mode_json: {
                        hook: "Do less, but better.",
                        big_idea: "Eliminate the trivial to make room for the essential.",
                        key_takeaways: [
                            "Say no more often",
                            "Protect white space",
                            "Trade busyness for clarity",
                            "Audit every commitment",
                            "Cut projects that dilute the essential",
                            "Make decisions by elimination first",
                            "Protect your calendar from reactive work",
                            "Treat rest as strategic capacity",
                        ],
                    },
                },
                {
                    id: "123e4567-e89b-12d3-a456-426614174333",
                    title: "Deep Work",
                    type: "book",
                    author: "Cal Newport",
                    category: "Productivity",
                    cover_image_url: "https://example.com/deep-work.jpg",
                    duration_seconds: 840,
                    quick_mode_json: {
                        hook: "Depth beats distraction.",
                        big_idea: "Protect long stretches of concentration to produce better work.",
                        key_takeaways: [
                            "Train your brain to resist context switching",
                            "Schedule uninterrupted work sessions",
                            "Reduce shallow obligations",
                        ],
                    },
                },
                {
                    id: "123e4567-e89b-12d3-a456-426614174444",
                    title: "Atomic Habits",
                    type: "book",
                    author: "James Clear",
                    category: "Self Improvement",
                    cover_image_url: "https://example.com/atomic-habits.jpg",
                    duration_seconds: 780,
                    quick_mode_json: {
                        hook: "Tiny systems drive outsized change.",
                        big_idea: "Small repeated behaviors compound into identity-level results.",
                        key_takeaways: [
                            "Make habits obvious and easy",
                            "Track consistency instead of intensity",
                            "Design your environment to support repetition",
                        ],
                    },
                },
            ],
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    it("loads focus items with completed IDs excluded from the API query and shows full hook plus two takeaways on mobile", async () => {
        render(<FocusFeed />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining(
                    "excludeIds=123e4567-e89b-12d3-a456-426614174111"
                )
            );
        });

        expect(await screen.findByText("Focus Mode")).toBeInTheDocument();
        expect(screen.getByText("Focus Mode").closest("section")).toHaveClass("pt-15");
        expect(screen.queryByRole("heading", { name: "One idea per post" })).not.toBeInTheDocument();
        const cards = await screen.findAllByTestId("focus-feed-card");
        const firstCard = cards[0]!;
        const secondCard = cards[1]!;

        expect(await screen.findByText("Essentialism")).toBeInTheDocument();
        expect(within(firstCard).queryByText("Hook")).not.toBeInTheDocument();
        expect(within(firstCard).getByText("Key Takeaways (2 of 8)")).toBeInTheDocument();
        expect(within(secondCard).getByText("Key Takeaways (2 of 3)")).toBeInTheDocument();
        expect(screen.queryByText("What stands out")).not.toBeInTheDocument();
        expect(screen.getByText("Do less, but better.")).toBeInTheDocument();
        expect(screen.queryByText("Eliminate the trivial to make room for the essential.")).not.toBeInTheDocument();
        expect(screen.getByText("Protect white space")).toBeInTheDocument();
        expect(screen.queryByText("Trade busyness for clarity")).not.toBeInTheDocument();
        expect(screen.queryByText("Audit every commitment")).not.toBeInTheDocument();
        expect(screen.queryByText("Cut projects that dilute the essential")).not.toBeInTheDocument();
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("overflow-y-auto");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("scrollbar-hide");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("snap-mandatory");
        expect(screen.getByRole("link", { name: "Read Essentialism" })).toHaveAttribute(
            "href",
            "/read/123e4567-e89b-12d3-a456-426614174222"
        );
        expect(screen.getByRole("link", { name: "Preview Essentialism" })).toHaveAttribute(
            "href",
            "/preview/123e4567-e89b-12d3-a456-426614174222"
        );
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("text-[1.2rem]");
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("sm:text-[1.5rem]");
        expect(screen.getByText("Greg McKeown")).toHaveClass("text-xs");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("book");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("Productivity");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("15 min");
        expect(screen.getByText("Do less, but better.")).toHaveClass("text-[0.95rem]");
        expect(screen.getByText("Do less, but better.")).toHaveClass("line-clamp-8");
        expect(screen.getByText("Say no more often")).toHaveClass("line-clamp-4");
        expect(firstCard).toHaveClass("py-4");
    });

    it("ignores trailing desktop wheel momentum until the quiet period ends", async () => {
        render(<FocusFeed />);

        await screen.findByText("Deep Work");

        vi.useFakeTimers();

        try {
            const list = screen.getByTestId("focus-feed-list");
            const cards = screen.getAllByTestId("focus-feed-card");
            const observer = observerInstances[0]!;

            fireEvent.wheel(list, { deltaY: 120, deltaX: 0 });
            fireEvent.wheel(list, { deltaY: 120, deltaX: 0 });

            expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
            expect(scrollIntoViewMock).toHaveBeenCalledWith({
                behavior: "smooth",
                block: "start",
            });

            await act(async () => {
                observer.trigger(cards[1]!);
            });

            fireEvent.wheel(list, { deltaY: 120, deltaX: 0 });
            fireEvent.wheel(list, { deltaY: 120, deltaX: 0 });

            expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(181);
            });

            fireEvent.wheel(list, { deltaY: 120, deltaX: 0 });

            expect(scrollIntoViewMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("limits touch swipes to one card", async () => {
        render(<FocusFeed />);

        await screen.findByText("Deep Work");

        const list = screen.getByTestId("focus-feed-list");

        fireEvent.touchStart(list, {
            touches: [{ clientX: 32, clientY: 260 }],
        });
        fireEvent.touchMove(list, {
            touches: [{ clientX: 36, clientY: 180 }],
        });

        expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
            behavior: "smooth",
            block: "start",
        });
    });

    it("shows up to seven takeaways on desktop", async () => {
        mediaQueryState.value = true;

        render(<FocusFeed />);

        const firstCard = (await screen.findAllByTestId("focus-feed-card"))[0]!;

        expect(within(firstCard).getByText("Key Takeaways")).toBeInTheDocument();
        expect(within(firstCard).queryByText("Key Takeaways (2 of 8)")).not.toBeInTheDocument();
        expect(within(firstCard).getAllByText(/^0[1-7]$/)).toHaveLength(7);
        expect(within(firstCard).queryByText("08")).not.toBeInTheDocument();
    });

    it("renders read and preview links on the focus card", async () => {
        render(<FocusFeed />);

        expect(await screen.findByRole("link", {
            name: "Read Essentialism",
        })).toHaveAttribute(
            "href",
            "/read/123e4567-e89b-12d3-a456-426614174222"
        );
        expect(screen.getByRole("link", {
            name: "Preview Essentialism",
        })).toHaveAttribute(
            "href",
            "/preview/123e4567-e89b-12d3-a456-426614174222"
        );
    });
});
