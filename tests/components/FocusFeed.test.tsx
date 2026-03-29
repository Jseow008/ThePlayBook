import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusFeed } from "@/components/focus/FocusFeed";

const FOCUS_FEED_RESTORE_STORAGE_KEY = "focus-feed-restore-v1";

const { readingProgressState, mediaQueryState, toggleMyListMock, toastSuccessMock } = vi.hoisted(() => ({
    readingProgressState: {
        value: {
            completedIds: ["123e4567-e89b-12d3-a456-426614174111"],
            isLoaded: true,
            myListIds: [] as string[],
        },
    },
    mediaQueryState: {
        value: {
            isDesktop: false,
            prefersReducedMotion: false,
        },
    },
    toggleMyListMock: vi.fn(),
    toastSuccessMock: vi.fn(),
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
    useReadingProgress: () => ({
        ...readingProgressState.value,
        isInMyList: (itemId: string) => readingProgressState.value.myListIds.includes(itemId),
        toggleMyList: toggleMyListMock,
    }),
}));

vi.mock("@/hooks/useMediaQuery", () => ({
    useMediaQuery: (query: string) =>
        query === "(min-width: 768px)"
            ? mediaQueryState.value.isDesktop
            : query === "(prefers-reduced-motion: reduce)"
                ? mediaQueryState.value.prefersReducedMotion
                : false,
}));

vi.mock("sonner", () => ({
    toast: {
        success: toastSuccessMock,
    },
}));

describe("FocusFeed", () => {
    const fetchMock = vi.fn();
    const focusItems = [
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
    ];

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
            myListIds: [],
        };
        mediaQueryState.value = {
            isDesktop: false,
            prefersReducedMotion: false,
        };
        toggleMyListMock.mockReset();
        toastSuccessMock.mockReset();
        window.sessionStorage.clear();
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => focusItems,
        });
        vi.stubGlobal("fetch", fetchMock);
    });

    it("loads focus items immediately before reading progress hydration and shows two mobile takeaways", async () => {
        readingProgressState.value = {
            completedIds: ["123e4567-e89b-12d3-a456-426614174111"],
            isLoaded: false,
            myListIds: [],
        };

        render(<FocusFeed />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith("/api/focus?limit=6");
        });

        expect(screen.queryByText("Focus Mode")).not.toBeInTheDocument();
        expect(screen.getByTestId("focus-feed-list").closest("section")).toHaveClass("pt-5");
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
        expect(screen.queryByText("Reduce shallow obligations")).not.toBeInTheDocument();
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("overflow-y-auto");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("scrollbar-hide");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("snap-mandatory");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("h-[calc(100dvh-7rem-4rem-env(safe-area-inset-bottom))]");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("md:h-[calc(100dvh-7.5rem)]");
        expect(screen.getByTestId("focus-feed-list").firstElementChild).toHaveClass("pb-4");
        expect(screen.getByTestId("focus-feed-list").firstElementChild).toHaveClass("md:pb-2");
        expect(screen.getByRole("button", { name: "Show full takeaways for Essentialism" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("text-[1.2rem]");
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("sm:text-[1.5rem]");
        expect(screen.getByText("Greg McKeown")).toHaveClass("text-sm");
        expect(screen.getByText("Greg McKeown")).toHaveClass("font-medium");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("book");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("Productivity");
        expect(screen.getByText("Greg McKeown").nextElementSibling).toHaveTextContent("15 min");
        expect(screen.getByText("Do less, but better.")).toHaveClass("text-[0.95rem]");
        expect(screen.getByText("Do less, but better.")).toHaveClass("line-clamp-8");
        expect(screen.getByText("Say no more often")).toHaveClass("line-clamp-4");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("border-l-[3px]");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("bg-secondary/25");
        expect(within(firstCard).getByText("Key Takeaways (2 of 8)").closest("section")).toHaveClass("space-y-2");
        expect(within(firstCard).getByText("Say no more often").closest("div")).toHaveClass("px-1");
        expect(within(firstCard).getByText("Say no more often").closest("div")).toHaveClass("py-0");
        expect(screen.getByRole("button", { name: "Show full takeaways for Essentialism" }).parentElement).toHaveClass("mt-auto");
        expect(firstCard).toHaveClass("min-h-[calc(100dvh-7rem-4rem-env(safe-area-inset-bottom))]");
        expect(firstCard).toHaveClass("md:min-h-[calc(100dvh-7.5rem)]");
        expect(firstCard).toHaveClass("py-4");
    });

    it("filters malformed completed IDs before building the focus exclude query", async () => {
        readingProgressState.value = {
            completedIds: ["not-a-uuid", focusItems[2]!.id],
            isLoaded: true,
            myListIds: [],
        };
        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: focusItems,
                activeCardIndex: 1,
                hasMore: true,
                seenIds: focusItems.map((item) => item.id),
            })
        );

        render(<FocusFeed />);

        await screen.findByText("Deep Work");
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        const requestUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
        expect(requestUrl).toContain(focusItems[2]!.id);
        expect(requestUrl).not.toContain("not-a-uuid");
    });

    it("prunes completed items after reading progress hydrates and fetches replacements", async () => {
        readingProgressState.value = {
            completedIds: [],
            isLoaded: false,
            myListIds: [],
        };

        const extraInitialItems = [
            {
                id: "123e4567-e89b-12d3-a456-426614174556",
                title: "Make Time",
                type: "book",
                author: "Jake Knapp",
                category: "Productivity",
                cover_image_url: "https://example.com/make-time.jpg",
                duration_seconds: 660,
                quick_mode_json: {
                    hook: "Design your day on purpose.",
                    big_idea: "Protect time for what matters before reactive work takes over.",
                    key_takeaways: [
                        "Choose one daily highlight",
                        "Remove default distractions",
                    ],
                },
            },
            {
                id: "123e4567-e89b-12d3-a456-426614174557",
                title: "Show Your Work",
                type: "book",
                author: "Austin Kleon",
                category: "Creativity",
                cover_image_url: "https://example.com/show-your-work.jpg",
                duration_seconds: 540,
                quick_mode_json: {
                    hook: "Share the process, not just the polished result.",
                    big_idea: "Consistent visibility compounds trust and opportunity.",
                    key_takeaways: [
                        "Document the work in public",
                        "Teach what you are learning",
                    ],
                },
            },
            {
                id: "123e4567-e89b-12d3-a456-426614174558",
                title: "Stillness Is the Key",
                type: "book",
                author: "Ryan Holiday",
                category: "Mindset",
                cover_image_url: "https://example.com/stillness.jpg",
                duration_seconds: 780,
                quick_mode_json: {
                    hook: "Calm is a competitive advantage.",
                    big_idea: "Mental stillness improves judgment and sustained performance.",
                    key_takeaways: [
                        "Create room for reflection",
                        "Reduce noise before deciding",
                    ],
                },
            },
        ];

        const replacementItem = {
            id: "123e4567-e89b-12d3-a456-426614174555",
            title: "The One Thing",
            type: "book",
            author: "Gary Keller",
            category: "Productivity",
            cover_image_url: "https://example.com/the-one-thing.jpg",
            duration_seconds: 720,
            quick_mode_json: {
                hook: "A narrower focus makes everything else easier.",
                big_idea: "Prioritize the one thing that creates the biggest downstream effect.",
                key_takeaways: [
                    "Find the highest-leverage task",
                    "Protect time for the main priority",
                ],
            },
        };

        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => [...focusItems, ...extraInitialItems],
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => [replacementItem],
            });

        const view = render(<FocusFeed />);

        expect(await screen.findByText("Essentialism")).toBeInTheDocument();

        readingProgressState.value = {
            completedIds: [
                focusItems[0]!.id,
                focusItems[1]!.id,
                focusItems[2]!.id,
            ],
            isLoaded: true,
            myListIds: [],
        };
        view.rerender(<FocusFeed />);

        await waitFor(() => {
            expect(screen.queryByText("Essentialism")).not.toBeInTheDocument();
        });
        expect(await screen.findByText("The One Thing")).toBeInTheDocument();

        const replacementRequestUrl = String(fetchMock.mock.calls[1]?.[0] ?? "");
        expect(replacementRequestUrl).toContain(`excludeIds=${focusItems[0]!.id}`);
        expect(replacementRequestUrl).toContain(focusItems[1]!.id);
        expect(replacementRequestUrl).toContain(focusItems[2]!.id);
    });

    it("saves a focus restore snapshot after the active card changes", async () => {
        render(<FocusFeed />);

        const cards = await screen.findAllByTestId("focus-feed-card");
        await waitFor(() => {
            expect(observerInstances.length).toBeGreaterThan(0);
        });
        const observer = observerInstances.at(-1)!;

        await act(async () => {
            observer.trigger(cards[1]!);
        });

        await waitFor(() => {
            const savedState = JSON.parse(
                window.sessionStorage.getItem(FOCUS_FEED_RESTORE_STORAGE_KEY) || "{}"
            );

            expect(savedState).toEqual(
                expect.objectContaining({
                    activeCardIndex: 1,
                    hasMore: false,
                    items: expect.arrayContaining([
                        expect.objectContaining({ id: focusItems[0]!.id }),
                        expect.objectContaining({ id: focusItems[1]!.id }),
                        expect.objectContaining({ id: focusItems[2]!.id }),
                    ]),
                    seenIds: expect.arrayContaining([
                        focusItems[0]!.id,
                        focusItems[1]!.id,
                        focusItems[2]!.id,
                    ]),
                })
            );
        });
    });

    it("restores the exact focus batch and card from sessionStorage immediately", async () => {
        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: focusItems,
                activeCardIndex: 1,
                hasMore: false,
                seenIds: focusItems.map((item) => item.id),
            })
        );

        render(<FocusFeed />);

        expect(await screen.findByText("Deep Work")).toBeInTheDocument();
        expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "start" });
        expect(screen.queryByTestId("focus-takeaways-sheet")).not.toBeInTheDocument();
    });

    it("falls back to the normal fetch path when restored state is invalid", async () => {
        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: [],
                activeCardIndex: 5,
                hasMore: true,
                seenIds: [],
            })
        );

        render(<FocusFeed />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
        expect(await screen.findByText("Essentialism")).toBeInTheDocument();
    });

    it("continues prefetching normally after restoring near the end of a saved batch", async () => {
        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: focusItems,
                activeCardIndex: 1,
                hasMore: true,
                seenIds: focusItems.map((item) => item.id),
            })
        );

        render(<FocusFeed />);

        await screen.findByText("Deep Work");

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        const requestUrl = String(fetchMock.mock.calls[0]?.[0] ?? "");
        expect(requestUrl).toContain(readingProgressState.value.completedIds[0]!);
        expect(requestUrl).toContain(focusItems[0]!.id);
        expect(requestUrl).toContain(focusItems[1]!.id);
        expect(requestUrl).toContain(focusItems[2]!.id);
    });

    it("opens a simplified mobile takeaways sheet with the full takeaway list and closes back to the same feed", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");
        const trigger = screen.getByRole("button", {
            name: "Show full takeaways for Essentialism",
        });
        trigger.focus();

        fireEvent.click(trigger);

        const sheetFrame = await screen.findByTestId("focus-takeaways-sheet-frame");
        const sheet = await screen.findByTestId("focus-takeaways-sheet");
        const closeButton = screen.getByTestId("focus-takeaways-sheet-close");
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
        await waitFor(() => {
            expect(closeButton).toHaveFocus();
        });

        readLink.focus();
        expect(readLink).toHaveFocus();

        fireEvent.keyDown(document, { key: "Tab" });
        expect(closeButton).toHaveFocus();

        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(readLink).toHaveFocus();

        fireEvent.wheel(screen.getByTestId("focus-takeaways-sheet-backdrop"), {
            deltaY: 120,
            deltaX: 0,
        });
        expect(scrollIntoViewMock).not.toHaveBeenCalled();

        fireEvent.keyDown(document, { key: "Escape" });
        await waitFor(() => {
            expect(screen.queryByTestId("focus-takeaways-sheet")).not.toBeInTheDocument();
        });
        expect(trigger).toHaveFocus();
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
                await vi.advanceTimersByTimeAsync(209);
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
        expect(within(firstCard).getAllByText(/^[1-7]$/)).toHaveLength(7);
        expect(within(firstCard).queryByText("08")).not.toBeInTheDocument();
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("border-l-[3px]");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("bg-secondary/25");
        expect(within(firstCard).getByText("Key Takeaways").closest("section")).toHaveClass("space-y-3");
        expect(within(firstCard).getByText("Say no more often").closest("div")).toHaveClass("px-1");
        expect(within(firstCard).getByText("Say no more often").closest("div")).toHaveClass("py-1");
        expect(within(firstCard).queryByRole("button", { name: "Show full takeaways for Essentialism" })).not.toBeInTheDocument();
        expect(within(firstCard).queryByRole("button", { name: "Save Essentialism to My List" })).not.toBeInTheDocument();
        expect(within(firstCard).queryByRole("button", { name: "Not interested in Essentialism" })).not.toBeInTheDocument();
        expect(within(firstCard).getByRole("link", { name: "Read Essentialism" }).parentElement).toHaveClass("justify-start");
    });

    it("renders header utility actions and full takeaways on mobile focus cards", async () => {
        render(<FocusFeed />);

        const firstCard = (await screen.findAllByTestId("focus-feed-card"))[0]!;
        expect(screen.queryByRole("link", {
            name: "Read Essentialism",
        })).not.toBeInTheDocument();
        const button = screen.getByRole("button", {
            name: "Show full takeaways for Essentialism",
        });
        expect(screen.getByRole("button", {
            name: "Save Essentialism to My List",
        })).toBeInTheDocument();
        const moreActionsButton = screen.getByRole("button", {
            name: "More actions for Essentialism",
        });
        expect(moreActionsButton).toBeInTheDocument();
        expect(button).toBeInTheDocument();
        expect(button).toHaveClass("min-h-11");
        expect(button).toHaveClass("touch-manipulation");
        expect(button.parentElement).toHaveClass("justify-start");
        expect(button.parentElement).toHaveClass("mt-auto");
        expect(button.parentElement).toHaveClass("pt-3");
        expect(within(firstCard).getByText("Key Takeaways (2 of 8)").nextElementSibling).toHaveClass("grid");
        expect(within(firstCard).getByText("Key Takeaways (2 of 8)").nextElementSibling).toHaveClass("gap-2");

        fireEvent.click(moreActionsButton);

        expect(screen.getByRole("menu", { name: "Actions for Essentialism" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", {
            name: "Not interested in Essentialism",
        })).toBeInTheDocument();
    });

    it("saves a mobile focus item to My List", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        fireEvent.click(
            screen.getByRole("button", { name: "Save Essentialism to My List" })
        );

        expect(toggleMyListMock).toHaveBeenCalledWith(focusItems[0]!.id);
        expect(toastSuccessMock).toHaveBeenCalledWith("Added to My List");
    });

    it("dismisses a mobile focus item for the current session", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        fireEvent.click(
            screen.getByRole("button", { name: "More actions for Essentialism" })
        );

        fireEvent.click(
            screen.getByRole("menuitem", { name: "Not interested in Essentialism" })
        );

        await waitFor(() => {
            expect(screen.queryByText("Essentialism")).not.toBeInTheDocument();
        });
        expect(screen.getByText("Deep Work")).toBeInTheDocument();
        expect(toastSuccessMock).toHaveBeenCalledWith("Removed from focus feed");
    });

    it("persists dismissed cards across a return even when the feed is temporarily empty", async () => {
        const restoredCard = focusItems[0]!;
        const refillCard = focusItems[1]!;
        let resolveRefill: ((value: { ok: true; json: () => Promise<typeof focusItems> }) => void) | null = null;

        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: [restoredCard],
                activeCardIndex: 0,
                hasMore: true,
                seenIds: [restoredCard.id],
                dismissedIds: [],
            })
        );

        fetchMock.mockReset();
        fetchMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveRefill = resolve;
                })
        );

        const view = render(<FocusFeed />);

        await screen.findByText("Essentialism");
        fireEvent.click(
            screen.getByRole("button", { name: "More actions for Essentialism" })
        );
        fireEvent.click(
            screen.getByRole("menuitem", { name: "Not interested in Essentialism" })
        );

        const storedStateAfterDismiss = JSON.parse(
            window.sessionStorage.getItem(FOCUS_FEED_RESTORE_STORAGE_KEY) || "{}"
        );
        expect(storedStateAfterDismiss).toMatchObject({
            items: [],
            activeCardIndex: 0,
            hasMore: true,
            dismissedIds: [restoredCard.id],
        });

        view.unmount();

        fetchMock.mockImplementationOnce(async () => ({
            ok: true,
            json: async () => [refillCard],
        }));

        render(<FocusFeed />);

        expect(screen.queryByText("Nothing queued yet")).not.toBeInTheDocument();

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
        expect(fetchMock.mock.calls[1]?.[0]).toContain(restoredCard.id);

        resolveRefill?.({
            ok: true,
            json: async () => [refillCard],
        });

        expect(await screen.findByText("Deep Work")).toBeInTheDocument();
        expect(screen.queryByText("Essentialism")).not.toBeInTheDocument();
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
