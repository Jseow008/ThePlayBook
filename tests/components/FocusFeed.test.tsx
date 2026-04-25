import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
    FocusFeed,
    getDesktopAvailableContentHeight,
    getDesktopCoverWidth,
    getDesktopVisibleTakeawayCount,
    getMobileHookMaxHeight,
} from "@/components/focus/FocusFeed";

const FOCUS_FEED_RESTORE_STORAGE_KEY = "focus-feed-restore-v1";
const FOCUS_FEED_SEED_STORAGE_KEY = "focus-feed-seed-v1";
const MOBILE_SCROLL_HINT_DISMISSED_STORAGE_KEY = "focus-feed-mobile-scroll-hint-dismissed-v1";

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

function createMockRect({ width = 0, height = 0 }: { width?: number; height?: number } = {}) {
    return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({}),
    } as DOMRect;
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
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;
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
        mathRandomSpy = vi.spyOn(Math, "random").mockReturnValue(0.999999);
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

    afterEach(() => {
        mathRandomSpy.mockRestore();
    });

    it("loads focus items immediately before reading progress hydration and renders the updated mobile focus card", async () => {
        readingProgressState.value = {
            completedIds: ["123e4567-e89b-12d3-a456-426614174111"],
            isLoaded: false,
            myListIds: [],
        };

        render(<FocusFeed />);

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0] ?? ""), "http://localhost");
        expect(requestUrl.pathname).toBe("/api/focus");
        expect(requestUrl.searchParams.get("limit")).toBe("6");
        expect(requestUrl.searchParams.get("seed")).toBe("zzzybj7u3b");
        expect(window.sessionStorage.getItem(FOCUS_FEED_SEED_STORAGE_KEY)).toBe("zzzybj7u3b");

        expect(screen.queryByText("Focus Mode")).not.toBeInTheDocument();
        expect(screen.getByTestId("focus-feed-list").closest("section")).toHaveClass("pt-5");
        expect(screen.queryByRole("heading", { name: "One idea per post" })).not.toBeInTheDocument();
        const cards = await screen.findAllByTestId("focus-feed-card");
        const firstCard = cards[0]!;

        expect(await screen.findByText("Essentialism")).toBeInTheDocument();
        expect(within(firstCard).queryByText("Hook")).not.toBeInTheDocument();
        expect(within(firstCard).queryByText("Key Takeaways (1 of 8)")).not.toBeInTheDocument();
        expect(within(firstCard).queryByText("8 key takeaways")).not.toBeInTheDocument();
        expect(screen.queryByText("What stands out")).not.toBeInTheDocument();
        expect(screen.getByText("Do less, but better.")).toBeInTheDocument();
        expect(screen.queryByText("Eliminate the trivial to make room for the essential.")).not.toBeInTheDocument();
        expect(screen.queryByText("Protect white space")).not.toBeInTheDocument();
        expect(screen.queryByText("Trade busyness for clarity")).not.toBeInTheDocument();
        expect(screen.queryByText("Audit every commitment")).not.toBeInTheDocument();
        expect(screen.queryByText("Reduce shallow obligations")).not.toBeInTheDocument();
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("overflow-y-auto");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("scrollbar-hide");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("snap-mandatory");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("h-[calc(100dvh-3rem-4rem-env(safe-area-inset-bottom))]");
        expect(screen.getByTestId("focus-feed-list")).toHaveClass("md:h-[calc(100dvh-7.5rem)]");
        expect(screen.getByTestId("focus-feed-list").firstElementChild).toHaveClass("pb-4");
        expect(screen.getByTestId("focus-feed-list").firstElementChild).toHaveClass("md:pb-2");
        expect(screen.getByRole("button", { name: "Preview Essentialism" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("text-[1.2rem]");
        expect(screen.getByRole("heading", { name: "Essentialism" })).toHaveClass("sm:text-[1.5rem]");
        expect(screen.getByText("Greg McKeown")).toHaveClass("text-sm");
        expect(screen.getByText("Greg McKeown")).toHaveClass("font-medium");
        expect(within(firstCard).getByText("book")).toBeInTheDocument();
        expect(within(firstCard).getByText("Productivity")).toBeInTheDocument();
        expect(within(firstCard).getByText("15 min")).toBeInTheDocument();
        expect(screen.getByText("Do less, but better.")).toHaveClass("text-[0.95rem]");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("border");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("bg-secondary/20");
        expect(within(firstCard).getByRole("img", { name: "Essentialism" })).toHaveAttribute("src", "https://example.com/essentialism.jpg");
        expect(firstCard).toHaveClass("min-h-[calc(100dvh-3rem-4rem-env(safe-area-inset-bottom))]");
        expect(firstCard).toHaveClass("md:min-h-[calc(100dvh-7.5rem)]");
        expect(firstCard).toHaveClass("py-4");
    });

    it("calculates a hook clamp that preserves viewport containment when the card would overflow", () => {
        expect(
            getMobileHookMaxHeight({
                availableContentHeight: 438,
                requiredContentHeight: 520,
                currentHookHeight: 220,
            })
        ).toBe(138);

        expect(
            getMobileHookMaxHeight({
                availableContentHeight: 438,
                requiredContentHeight: 420,
                currentHookHeight: 220,
            })
        ).toBeNull();

        expect(
            getMobileHookMaxHeight({
                availableContentHeight: 300,
                requiredContentHeight: 560,
                currentHookHeight: 260,
            })
        ).toBe(72);
    });

    it("calculates desktop presentation rules for varying heights", () => {
        expect(getDesktopAvailableContentHeight(760)).toBe(718);
        expect(getDesktopAvailableContentHeight(620)).toBe(578);

        expect(
            getDesktopCoverWidth({
                availableContentHeight: 718,
            })
        ).toBe(132);

        expect(
            getDesktopCoverWidth({
                availableContentHeight: 650,
            })
        ).toBe(116);

        expect(
            getDesktopCoverWidth({
                availableContentHeight: 578,
            })
        ).toBe(104);

        expect(
            getDesktopVisibleTakeawayCount({
                availableContentHeight: 718,
                totalTakeaways: 8,
            })
        ).toBe(3);

        expect(
            getDesktopVisibleTakeawayCount({
                availableContentHeight: 578,
                totalTakeaways: 2,
            })
        ).toBe(2);
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
                nextCursor: focusItems[2]!.id,
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

        fireEvent(window, new Event("pagehide"));

        const savedState = JSON.parse(
            window.sessionStorage.getItem(FOCUS_FEED_RESTORE_STORAGE_KEY) || "{}"
        );

        expect(savedState).toEqual(
            expect.objectContaining({
                activeCardIndex: 1,
                hasMore: false,
                nextCursor: null,
                items: expect.arrayContaining([
                    expect.objectContaining({ id: focusItems[0]!.id }),
                    expect.objectContaining({ id: focusItems[1]!.id }),
                    expect.objectContaining({ id: focusItems[2]!.id }),
                ]),
            })
        );
        expect(savedState.seenIds).toEqual([
            focusItems[0]!.id,
            focusItems[1]!.id,
            focusItems[2]!.id,
        ]);
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

    it("preserves the same logical active card when an earlier completed item is pruned", async () => {
        readingProgressState.value = {
            completedIds: [],
            isLoaded: false,
            myListIds: [],
        };

        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: focusItems,
                activeCardIndex: 1,
                hasMore: false,
                nextCursor: null,
                seenIds: focusItems.map((item) => item.id),
            })
        );

        const { rerender } = render(<FocusFeed />);

        expect(await screen.findByText("Deep Work")).toBeInTheDocument();

        readingProgressState.value = {
            completedIds: [focusItems[0]!.id],
            isLoaded: true,
            myListIds: [],
        };

        rerender(<FocusFeed />);

        await waitFor(() => {
            expect(screen.queryByText("Essentialism")).not.toBeInTheDocument();
        });

        fireEvent(window, new Event("pagehide"));

        const savedState = JSON.parse(
            window.sessionStorage.getItem(FOCUS_FEED_RESTORE_STORAGE_KEY) || "{}"
        );

        expect(savedState.items.map((item: { id: string }) => item.id)).toEqual([
            focusItems[1]!.id,
            focusItems[2]!.id,
        ]);
        expect(savedState.activeCardIndex).toBe(0);
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
                nextCursor: focusItems[2]!.id,
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
        expect(requestUrl).toContain(`cursor=${focusItems[2]!.id}`);
    });

    it("flushes the latest active card immediately on pagehide", async () => {
        render(<FocusFeed />);

        const cards = await screen.findAllByTestId("focus-feed-card");
        await waitFor(() => {
            expect(observerInstances.length).toBeGreaterThan(0);
        });

        await act(async () => {
            observerInstances.at(-1)!.trigger(cards[1]!);
            fireEvent(window, new Event("pagehide"));
        });

        const savedState = JSON.parse(
            window.sessionStorage.getItem(FOCUS_FEED_RESTORE_STORAGE_KEY) || "{}"
        );

        expect(savedState.activeCardIndex).toBe(1);
    });

    it("keeps save/remove toast feedback aligned on rapid repeated taps", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        const saveButton = screen.getByRole("button", { name: "Save Essentialism to My List" });

        fireEvent.click(saveButton);
        fireEvent.click(saveButton);

        expect(toggleMyListMock).toHaveBeenNthCalledWith(1, focusItems[0]!.id);
        expect(toggleMyListMock).toHaveBeenNthCalledWith(2, focusItems[0]!.id);
        expect(toastSuccessMock).toHaveBeenNthCalledWith(1, "Added to My List");
        expect(toastSuccessMock).toHaveBeenNthCalledWith(2, "Removed from My List");
    });

    it("opens a simplified mobile takeaways sheet with the full takeaway list and closes back to the same feed", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");
        const trigger = screen.getByRole("button", {
            name: "Preview Essentialism",
        });
        trigger.focus();

        fireEvent.click(trigger);

        const sheetFrame = await screen.findByTestId("focus-takeaways-sheet-frame");
        const sheet = await screen.findByTestId("focus-takeaways-sheet");
        const closeButton = screen.getByTestId("focus-takeaways-sheet-close");
        expect(sheetFrame).toHaveClass("px-5");
        expect(sheet).toHaveAttribute("aria-label", "Preview for Essentialism");
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

    it("clamps long mobile hooks at render time while keeping preview visible", async () => {
        const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLDivElement.prototype, "scrollHeight");
        const originalGetComputedStyle = window.getComputedStyle;
        const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
            const testId = (this as HTMLElement).getAttribute("data-testid");

            if (testId === "focus-feed-list" || testId === "focus-feed-card") {
                return createMockRect({ width: 360, height: 310 });
            }

            if (testId === "focus-mobile-hook-body") {
                return createMockRect({ width: 320, height: 260 });
            }

            return createMockRect({ width: 320, height: 0 });
        });

        Object.defineProperty(HTMLDivElement.prototype, "scrollHeight", {
            configurable: true,
            get() {
                return (this as HTMLElement).getAttribute("data-testid") === "focus-card-content" ? 620 : 0;
            },
        });
        const getComputedStyleSpy = vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
            const styles = originalGetComputedStyle(element);
            return new Proxy(styles, {
                get(target, property, receiver) {
                    if (property === "paddingTop" || property === "paddingBottom") {
                        return "0px";
                    }

                    return Reflect.get(target, property, receiver);
                },
            });
        });

        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => [
                {
                    ...focusItems[0]!,
                    quick_mode_json: {
                        ...focusItems[0]!.quick_mode_json,
                        hook: Array.from({ length: 36 }, () => "A long hook sentence that keeps the card under pressure.")
                            .join(" "),
                    },
                },
            ],
        });

        try {
            render(<FocusFeed />);

            const firstCard = (await screen.findAllByTestId("focus-feed-card"))[0]!;
            const cardContent = within(firstCard).getByTestId("focus-card-content");
            const hookBody = within(firstCard).getByTestId("focus-mobile-hook-body");

            await waitFor(() => {
                expect(cardContent.scrollHeight).toBe(620);
                expect(hookBody.style.maxHeight).toBe("72px");
            });

            expect(within(firstCard).getByTestId("focus-mobile-hook-fade")).toBeInTheDocument();
            expect(within(firstCard).getByRole("button", { name: "Preview Essentialism" })).toBeInTheDocument();
        } finally {
            rectSpy.mockRestore();
            getComputedStyleSpy.mockRestore();
            vi.stubGlobal("fetch", fetchMock);
            if (originalScrollHeight) {
                Object.defineProperty(HTMLDivElement.prototype, "scrollHeight", originalScrollHeight);
            } else {
                Reflect.deleteProperty(HTMLDivElement.prototype, "scrollHeight");
            }
        }
    });

    it("keeps the sheet mounted for the exit animation before unmounting", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        fireEvent.click(
            screen.getByRole("button", { name: "Preview Essentialism" })
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
            screen.getByRole("button", { name: "Preview Essentialism" })
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
        await act(async () => {});

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

    it("shows three desktop takeaways with preview and read CTAs", async () => {
        mediaQueryState.value = {
            isDesktop: true,
            prefersReducedMotion: false,
        };

        render(<FocusFeed />);

        const firstCard = (await screen.findAllByTestId("focus-feed-card"))[0]!;

        expect(within(firstCard).getByText("Key Takeaways (3 of 8)")).toBeInTheDocument();
        expect(within(firstCard).queryByText("Key Takeaways (2 of 8)")).not.toBeInTheDocument();
        expect(within(firstCard).queryByText("Key Takeaways (4 of 8)")).not.toBeInTheDocument();
        expect(within(firstCard).getAllByText(/^[1-3]$/)).toHaveLength(3);
        expect(within(firstCard).queryByText("8 key takeaways")).not.toBeInTheDocument();
        expect(within(firstCard).getByRole("img", { name: "Essentialism" })).toBeInTheDocument();
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("border-l-[3px]");
        expect(within(firstCard).getByText("Do less, but better.").closest("section")).toHaveClass("bg-secondary/25");
        expect(within(firstCard).getByText("Do less, but better.")).toHaveClass("text-[1.05rem]");
        expect(within(firstCard).getByText("Do less, but better.")).toHaveClass("leading-[1.58]");
        expect(within(firstCard).getByText("Trade busyness for clarity")).toBeInTheDocument();
        expect(within(firstCard).getByText("Say no more often")).toHaveClass("text-[1rem]");
        expect(within(firstCard).getByText("Say no more often")).toHaveClass("leading-[1.58]");
        expect(within(firstCard).queryByText("Audit every commitment")).not.toBeInTheDocument();
        expect(within(firstCard).queryByText("Treat rest as strategic capacity")).not.toBeInTheDocument();
        expect(within(firstCard).getByTestId("focus-desktop-takeaways-list")).toHaveClass("overflow-hidden");
        expect(within(firstCard).queryByRole("button", { name: "Preview Essentialism" })).not.toBeInTheDocument();
        expect(within(firstCard).getByRole("link", { name: "Preview Essentialism" })).toHaveAttribute(
            "href",
            `/preview/${focusItems[0]!.id}?takeaways=all`
        );
        expect(within(firstCard).queryByRole("button", { name: "Save Essentialism to My List" })).not.toBeInTheDocument();
        expect(within(firstCard).queryByRole("button", { name: "Not interested in Essentialism" })).not.toBeInTheDocument();
        expect(within(firstCard).getByText("Say no more often").closest("div")).toHaveClass("px-1");
        expect(within(firstCard).getByText("Say no more often").closest("div")).toHaveClass("py-0.5");
        expect(within(firstCard).getByRole("link", { name: "Read Essentialism" }).parentElement).toHaveClass("justify-start");
    });

    it("keeps three desktop takeaways and shows preview on shorter desktop heights", async () => {
        mediaQueryState.value = {
            isDesktop: true,
            prefersReducedMotion: false,
        };

        const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
            const testId = (this as HTMLElement).getAttribute("data-testid");

            if (testId === "focus-feed-list") {
                return createMockRect({ width: 960, height: 620 });
            }

            return createMockRect({ width: 960, height: 0 });
        });

        try {
            render(<FocusFeed />);

            const firstCard = (await screen.findAllByTestId("focus-feed-card"))[0]!;

            await waitFor(() => {
                expect(within(firstCard).getByText("Key Takeaways (3 of 8)")).toBeInTheDocument();
            });

            expect(within(firstCard).getByRole("link", { name: "Preview Essentialism" })).toHaveAttribute(
                "href",
                `/preview/${focusItems[0]!.id}?takeaways=all`
            );
            expect(within(firstCard).getByText("Say no more often")).toBeInTheDocument();
            expect(within(firstCard).getByText("Protect white space")).toBeInTheDocument();
            expect(within(firstCard).getByText("Trade busyness for clarity")).toBeInTheDocument();
            expect(within(firstCard).queryByText("Audit every commitment")).not.toBeInTheDocument();
        } finally {
            rectSpy.mockRestore();
        }
    });

    it("renders header utility actions and the preview CTA on mobile focus cards", async () => {
        render(<FocusFeed />);

        const firstCard = (await screen.findAllByTestId("focus-feed-card"))[0]!;
        expect(screen.queryByRole("link", {
            name: "Read Essentialism",
        })).not.toBeInTheDocument();
        const button = screen.getByRole("button", {
            name: "Preview Essentialism",
        });
        expect(screen.getByRole("button", {
            name: "Save Essentialism to My List",
        })).toBeInTheDocument();
        expect(within(firstCard).getByRole("button", {
            name: "Share this content",
        })).toBeInTheDocument();
        expect(button).toBeInTheDocument();
        expect(button).toHaveClass("min-h-11");
        expect(button).toHaveClass("touch-manipulation");
        expect(button.parentElement).toHaveClass("flex-col");
        expect(within(firstCard).queryByText("Key Takeaways (1 of 8)")).not.toBeInTheDocument();
        expect(within(firstCard).queryByText("8 key takeaways")).not.toBeInTheDocument();
        expect(within(firstCard).getByRole("img", { name: "Essentialism" })).toBeInTheDocument();
        expect(screen.queryByRole("button", {
            name: "More actions for Essentialism",
        })).not.toBeInTheDocument();
        expect(screen.queryByRole("menuitem", {
            name: "Not interested in Essentialism",
        })).not.toBeInTheDocument();
    });

    it("shows the mobile navigation hint on the first visible restored card", async () => {
        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: focusItems,
                activeCardIndex: 1,
                hasMore: false,
                seenIds: focusItems.map((item) => item.id),
            })
        );

        vi.useFakeTimers();

        try {
            render(<FocusFeed />);

            await act(async () => {});

            expect(screen.getByText("Deep Work")).toBeInTheDocument();

            expect(screen.queryByTestId("focus-navigation-cue")).not.toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2400);
            });

            expect(screen.getByTestId("focus-navigation-cue")).toHaveTextContent("Swipe up for next");
        } finally {
            vi.useRealTimers();
        }
    });

    it("dismisses the mobile navigation hint after the user advances past the anchored card", async () => {
        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: focusItems,
                activeCardIndex: 1,
                hasMore: false,
                seenIds: focusItems.map((item) => item.id),
            })
        );

        vi.useFakeTimers();

        try {
            render(<FocusFeed />);

            await act(async () => {});

            const list = screen.getByTestId("focus-feed-list");

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2400);
            });

            expect(screen.getByTestId("focus-navigation-cue")).toHaveTextContent("Swipe up for next");

            await act(async () => {
                fireEvent.touchStart(list, {
                    touches: [{ clientX: 32, clientY: 260 }],
                });
                fireEvent.touchMove(list, {
                    touches: [{ clientX: 36, clientY: 180 }],
                });
            });

            expect(screen.queryByTestId("focus-navigation-cue")).not.toBeInTheDocument();
            expect(window.sessionStorage.getItem(MOBILE_SCROLL_HINT_DISMISSED_STORAGE_KEY)).toBe("true");
        } finally {
            vi.useRealTimers();
        }
    });

    it("dismisses the mobile navigation hint when the visible card changes after the hint is shown", async () => {
        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: focusItems,
                activeCardIndex: 1,
                hasMore: false,
                seenIds: focusItems.map((item) => item.id),
            })
        );

        vi.useFakeTimers();

        try {
            render(<FocusFeed />);

            await act(async () => {});

            const cards = screen.getAllByTestId("focus-feed-card");

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2400);
            });

            expect(screen.getByTestId("focus-navigation-cue")).toHaveTextContent("Swipe up for next");
            expect(observerInstances.length).toBeGreaterThan(0);

            await act(async () => {
                observerInstances.at(-1)!.trigger(cards[2]!);
            });

            expect(screen.queryByTestId("focus-navigation-cue")).not.toBeInTheDocument();
            expect(window.sessionStorage.getItem(MOBILE_SCROLL_HINT_DISMISSED_STORAGE_KEY)).toBe("true");
        } finally {
            vi.useRealTimers();
        }
    });

    it("dismisses the mobile navigation hint when the active card changes after the hint is shown", async () => {
        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify({
                items: focusItems,
                activeCardIndex: 1,
                hasMore: false,
                seenIds: focusItems.map((item) => item.id),
            })
        );

        vi.useFakeTimers();

        try {
            render(<FocusFeed />);

            await act(async () => {});

            const cards = screen.getAllByTestId("focus-feed-card");

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2400);
            });

            expect(screen.getByTestId("focus-navigation-cue")).toHaveTextContent("Swipe up for next");
            expect(observerInstances.length).toBeGreaterThan(0);

            await act(async () => {
                observerInstances.at(-1)!.trigger(cards[2]!);
            });

            expect(screen.queryByTestId("focus-navigation-cue")).not.toBeInTheDocument();
            expect(window.sessionStorage.getItem(MOBILE_SCROLL_HINT_DISMISSED_STORAGE_KEY)).toBe("true");
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not reshow the mobile navigation hint after it was dismissed in the current session", async () => {
        window.sessionStorage.setItem(MOBILE_SCROLL_HINT_DISMISSED_STORAGE_KEY, "true");

        vi.useFakeTimers();

        try {
            render(<FocusFeed />);

            await act(async () => {});

            expect(screen.getByText("Essentialism")).toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2400);
            });

            expect(screen.queryByTestId("focus-navigation-cue")).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it("reschedules the mobile navigation hint after the takeaways sheet temporarily interrupts it", async () => {
        mediaQueryState.value = {
            isDesktop: false,
            prefersReducedMotion: true,
        };

        vi.useFakeTimers();

        try {
            render(<FocusFeed />);

            await act(async () => {});

            fireEvent.click(
                screen.getByRole("button", { name: "Preview Essentialism" })
            );

            expect(screen.getByTestId("focus-takeaways-sheet")).toBeInTheDocument();

            await act(async () => {
                fireEvent.keyDown(document, { key: "Escape" });
            });

            expect(screen.queryByTestId("focus-takeaways-sheet")).not.toBeInTheDocument();

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2400);
            });

            expect(screen.getByTestId("focus-navigation-cue")).toHaveTextContent("Swipe up for next");
        } finally {
            vi.useRealTimers();
        }
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

    it("keeps the full takeaway list available in the mobile bottom sheet regardless of the card limit", async () => {
        render(<FocusFeed />);

        await screen.findByText("Essentialism");

        fireEvent.click(
            screen.getByRole("button", { name: "Preview Essentialism" })
        );

        const sheet = await screen.findByTestId("focus-takeaways-sheet");
        expect(within(sheet).getByText("Cut projects that dilute the essential")).toBeInTheDocument();
        expect(within(sheet).getByText("Treat rest as strategic capacity")).toBeInTheDocument();
    });
});
