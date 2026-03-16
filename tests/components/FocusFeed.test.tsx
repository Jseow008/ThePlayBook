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
        value: {
            isDesktop: false,
            prefersReducedMotion: false,
        },
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
    useMediaQuery: (query: string) =>
        query === "(min-width: 768px)"
            ? mediaQueryState.value.isDesktop
            : query === "(prefers-reduced-motion: reduce)"
                ? mediaQueryState.value.prefersReducedMotion
                : false,
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
        mediaQueryState.value = {
            isDesktop: false,
            prefersReducedMotion: false,
        };
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

    it("loads focus items with completed IDs excluded from the API query and shows a heuristic mobile takeaway count", async () => {
        render(<FocusFeed />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringContaining(
                    "excludeIds=123e4567-e89b-12d3-a456-426614174111"
                )
            );
        });

        expect(await screen.findByText("Focus Mode")).toBeInTheDocument();
        expect(screen.getByText("Focus Mode").closest("section")).toHaveClass("pt-11");
        expect(screen.queryByRole("heading", { name: "One idea per post" })).not.toBeInTheDocument();
        const cards = await screen.findAllByTestId("focus-feed-card");
        const firstCard = cards[0]!;
        const secondCard = cards[1]!;

        expect(await screen.findByText("Essentialism")).toBeInTheDocument();
        expect(within(firstCard).queryByText("Hook")).not.toBeInTheDocument();
        expect(within(firstCard).getByText("Key Takeaways (4 of 8)")).toBeInTheDocument();
        expect(within(secondCard).getByText("Key Takeaways (3)")).toBeInTheDocument();
        expect(screen.queryByText("What stands out")).not.toBeInTheDocument();
        expect(screen.getByText("Do less, but better.")).toBeInTheDocument();
        expect(screen.queryByText("Eliminate the trivial to make room for the essential.")).not.toBeInTheDocument();
        expect(screen.getByText("Protect white space")).toBeInTheDocument();
        expect(screen.getByText("Trade busyness for clarity")).toBeInTheDocument();
        expect(screen.getByText("Audit every commitment")).toBeInTheDocument();
        expect(screen.queryByText("Cut projects that dilute the essential")).not.toBeInTheDocument();
        expect(screen.getByText("Reduce shallow obligations")).toBeInTheDocument();
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("overflow-y-auto");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("scrollbar-hide");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("snap-mandatory");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("h-[calc(100svh-10rem)]");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("md:h-[calc(100svh-7.5rem)]");
        expect(screen.getByTestId("focus-feed-list").firstElementChild).toHaveClass("pb-4");
        expect(screen.getByTestId("focus-feed-list").firstElementChild).toHaveClass("md:pb-2");
        expect(screen.getByRole("button", { name: "Show full takeaways for Essentialism" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("text-[1.2rem]");
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("sm:text-[1.5rem]");
        expect(screen.getByText("Greg McKeown")).toHaveClass("text-xs");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("book");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("Productivity");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("15 min");
        expect(screen.getByText("Do less, but better.")).toHaveClass("text-[0.9rem]");
        expect(screen.getByText("Do less, but better.")).toHaveClass("line-clamp-8");
        expect(screen.getByText("Say no more often")).toHaveClass("line-clamp-4");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).not.toHaveClass("border");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).not.toHaveClass("bg-background/45");
        expect(within(firstCard).getByText("Key Takeaways (4 of 8)").closest("section")).not.toHaveClass("border");
        expect(within(firstCard).getByText("Key Takeaways (4 of 8)").closest("section")).not.toHaveClass("bg-background/45");
        expect(firstCard).toHaveClass("min-h-[calc(100svh-10.75rem)]");
        expect(firstCard).toHaveClass("md:min-h-[calc(100svh-7.5rem)]");
        expect(firstCard).toHaveClass("py-4");
    });

    it("opens a simplified mobile takeaways sheet with the full takeaway list and closes back to the same feed", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        fireEvent.click(
            screen.getByRole("button", { name: "Show full takeaways for Essentialism" })
        );

        const sheetFrame = await screen.findByTestId("focus-takeaways-sheet-frame");
        const sheet = await screen.findByTestId("focus-takeaways-sheet");
        expect(sheetFrame).toHaveClass("px-5");
        expect(sheet).toHaveAttribute("aria-label", "Full takeaways for Essentialism");
        expect(sheet).toHaveClass("transition-transform");
        expect(sheet).toHaveClass("transition-opacity");
        expect(screen.getByTestId("focus-takeaways-sheet-backdrop")).toHaveClass("transition-opacity");
        expect(within(sheet).queryByText("Key Takeaways")).not.toBeInTheDocument();
        expect(within(sheet).queryByText("Essentialism")).not.toBeInTheDocument();
        expect(within(sheet).queryByText("Greg McKeown")).not.toBeInTheDocument();
        expect(sheet.firstElementChild).not.toHaveClass("border-b");
        expect(within(sheet).getByText("Audit every commitment")).toBeInTheDocument();
        expect(within(sheet).getByText("Treat rest as strategic capacity")).toBeInTheDocument();
        const readLink = within(sheet).getByRole("link", { name: "Read Essentialism" });
        expect(readLink).toHaveAttribute("href", "/read/123e4567-e89b-12d3-a456-426614174222");
        expect(readLink).toBeInTheDocument();

        fireEvent.wheel(screen.getByTestId("focus-takeaways-sheet-backdrop"), {
            deltaY: 120,
            deltaX: 0,
        });
        expect(scrollIntoViewMock).not.toHaveBeenCalled();

        fireEvent.click(screen.getByTestId("focus-takeaways-sheet-close"));
        await waitFor(() => {
            expect(screen.queryByTestId("focus-takeaways-sheet")).not.toBeInTheDocument();
        });
        expect(screen.getByText("Essentialism")).toBeInTheDocument();
    });

    it("keeps the sheet mounted for the exit animation before unmounting", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        fireEvent.click(
            screen.getByRole("button", { name: "Show full takeaways for Essentialism" })
        );

        await screen.findByTestId("focus-takeaways-sheet");

        vi.useFakeTimers();
        try {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(16);
            });

            fireEvent.click(screen.getByTestId("focus-takeaways-sheet-close"));

            expect(screen.getByTestId("focus-takeaways-sheet")).toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(179);
            });

            expect(screen.getByTestId("focus-takeaways-sheet")).toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(1);
            });

            expect(screen.queryByTestId("focus-takeaways-sheet")).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it("skips slide motion when reduced motion is preferred", async () => {
        mediaQueryState.value = {
            isDesktop: false,
            prefersReducedMotion: true,
        };

        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        fireEvent.click(
            screen.getByRole("button", { name: "Show full takeaways for Essentialism" })
        );

        const sheet = await screen.findByTestId("focus-takeaways-sheet");
        expect(sheet).not.toHaveClass("transition-transform");
        expect(sheet).not.toHaveClass("transition-opacity");
        expect(screen.getByTestId("focus-takeaways-sheet-backdrop")).not.toHaveClass("transition-opacity");
    });

    it("ignores trailing desktop wheel momentum until the quiet period ends", async () => {
        mediaQueryState.value = {
            isDesktop: true,
            prefersReducedMotion: false,
        };

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
        mediaQueryState.value = {
            isDesktop: true,
            prefersReducedMotion: false,
        };

        render(<FocusFeed />);

        const firstCard = (await screen.findAllByTestId("focus-feed-card"))[0]!;

        expect(within(firstCard).getByText("Key Takeaways")).toBeInTheDocument();
        expect(within(firstCard).queryByText("Key Takeaways (2 of 8)")).not.toBeInTheDocument();
        expect(within(firstCard).queryByText("Key Takeaways (4 of 8)")).not.toBeInTheDocument();
        expect(within(firstCard).getAllByText(/^0[1-7]$/)).toHaveLength(7);
        expect(within(firstCard).queryByText("08")).not.toBeInTheDocument();
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("border");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("border-border/35");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("bg-background/30");
        expect(within(firstCard).getByText("Key Takeaways").closest("section")).toHaveClass("border");
        expect(within(firstCard).getByText("Key Takeaways").closest("section")).toHaveClass("border-border/35");
        expect(within(firstCard).getByText("Key Takeaways").closest("section")).toHaveClass("bg-background/30");
        expect(within(firstCard).queryByRole("button", { name: "Show full takeaways for Essentialism" })).not.toBeInTheDocument();
        expect(within(firstCard).getByRole("link", { name: "Read Essentialism" }).parentElement).toHaveClass("justify-start");
    });

    it("renders only the full takeaways action on mobile focus cards", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");
        expect(screen.queryByRole("link", {
            name: "Read Essentialism",
        })).not.toBeInTheDocument();
        expect(screen.getByRole("button", {
            name: "Show full takeaways for Essentialism",
        })).toBeInTheDocument();
    });

    it("keeps the full takeaway list available in the mobile bottom sheet regardless of the card limit", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        fireEvent.click(
            screen.getByRole("button", { name: "Show full takeaways for Essentialism" })
        );

        const sheet = await screen.findByTestId("focus-takeaways-sheet");
        expect(within(sheet).getByText("Cut projects that dilute the essential")).toBeInTheDocument();
        expect(within(sheet).getByText("Treat rest as strategic capacity")).toBeInTheDocument();
    });
});
