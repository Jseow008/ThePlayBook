"use client";

import Link from "next/link";
import {
    type MutableRefObject,
    type TouchEvent as ReactTouchEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { BookOpen, Info, Loader2, X } from "lucide-react";
import { z } from "zod";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { QuickModeSchema, type FocusFeedItem } from "@/types/domain";
import { buildFocusCards, mergeUniqueFocusItems, type FocusCard } from "@/components/focus/focus-feed-utils";

const BATCH_SIZE = 6;
const FEED_LIST_VIEWPORT_CLASS = "h-[calc(100svh-10rem)] md:h-[calc(100svh-7.5rem)]";
const FEED_CARD_HEIGHT_CLASS = "min-h-[calc(100svh-10.75rem)] md:min-h-[calc(100svh-7.5rem)]";
const TAKEAWAYS_SHEET_OPEN_DURATION_MS = 240;
const TAKEAWAYS_SHEET_CLOSE_DURATION_MS = 210;
const TAKEAWAYS_SHEET_BACKDROP_OPEN_DURATION_MS = 200;
const TAKEAWAYS_SHEET_ENTER_DELAY_MS = 16;
const WHEEL_TRIGGER = 40;
const TOUCH_TRIGGER = 40;
const GESTURE_UNLOCK_TIMEOUT_MS = 200;
const WHEEL_QUIET_PERIOD_MS = 180;
const FOCUS_FEED_RESTORE_STORAGE_KEY = "focus-feed-restore-v1";

type TakeawaysSheetPhase = "closed" | "entering" | "entered" | "exiting";

const FocusRestoreItemSchema = z.object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    author: z.string().nullable(),
    category: z.string().nullable(),
    cover_image_url: z.string().nullable(),
    duration_seconds: z.number().nullable(),
    quick_mode_json: QuickModeSchema,
});

const FocusRestoreStateSchema = z
    .object({
        items: z.array(FocusRestoreItemSchema).min(1),
        activeCardIndex: z.number().int().min(0),
        hasMore: z.boolean(),
        seenIds: z.array(z.string()),
    })
    .superRefine((value, ctx) => {
        if (value.activeCardIndex >= value.items.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["activeCardIndex"],
                message: "activeCardIndex must be within the restored items array",
            });
        }
    });

type FocusRestoreState = z.infer<typeof FocusRestoreStateSchema>;

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
    if (!container) {
        return [];
    }

    return Array.from(
        container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

function formatDuration(durationSeconds: number | null) {
    if (!durationSeconds) return null;
    return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function buildExcludeParam(ids: string[]) {
    return Array.from(new Set(ids.filter(Boolean))).join(",");
}

function readFocusRestoreState(): FocusRestoreState | null {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = window.sessionStorage.getItem(FOCUS_FEED_RESTORE_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = FocusRestoreStateSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
            window.sessionStorage.removeItem(FOCUS_FEED_RESTORE_STORAGE_KEY);
            return null;
        }

        return parsed.data;
    } catch {
        window.sessionStorage.removeItem(FOCUS_FEED_RESTORE_STORAGE_KEY);
        return null;
    }
}

export function FocusFeed() {
    const { completedIds, isLoaded } = useReadingProgress();
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const [items, setItems] = useState<FocusFeedItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [takeawaysSheetCard, setTakeawaysSheetCard] = useState<FocusCard | null>(null);
    const [takeawaysSheetPhase, setTakeawaysSheetPhase] = useState<TakeawaysSheetPhase>("closed");
    const [sheetDragOffset, setSheetDragOffset] = useState(0);
    const listRef = useRef<HTMLDivElement | null>(null);
    const seenIdsRef = useRef<Set<string>>(new Set());
    const hasInitializedRef = useRef(false);
    const isFetchingRef = useRef(false);
    const activeCardIndexRef = useRef(0);
    const isGestureLockedRef = useRef(false);
    const pendingCardIndexRef = useRef<number | null>(null);
    const unlockTimeoutRef = useRef<number | null>(null);
    const accumulatedWheelDeltaRef = useRef(0);
    const isWheelMomentumLockedRef = useRef(false);
    const wheelQuietTimeoutRef = useRef<number | null>(null);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const sheetTouchStartYRef = useRef<number | null>(null);
    const sheetCloseTimeoutRef = useRef<number | null>(null);
    const sheetEnterTimeoutRef = useRef<number | null>(null);
    const takeawaysSheetDialogRef = useRef<HTMLDivElement | null>(null);
    const takeawaysSheetCloseButtonRef = useRef<HTMLButtonElement | null>(null);
    const takeawaysSheetOpenerRef = useRef<HTMLElement | null>(null);
    const pendingRestoreCardIndexRef = useRef<number | null>(null);

    const cards = useMemo(() => buildFocusCards(items), [items]);
    const isTakeawaysSheetOpen = !isDesktop && takeawaysSheetCard !== null;

    const unlockGestures = useCallback(() => {
        isGestureLockedRef.current = false;
        pendingCardIndexRef.current = null;

        if (unlockTimeoutRef.current !== null) {
            window.clearTimeout(unlockTimeoutRef.current);
            unlockTimeoutRef.current = null;
        }
    }, []);

    const clearWheelQuietTimeout = useCallback(() => {
        if (wheelQuietTimeoutRef.current !== null) {
            window.clearTimeout(wheelQuietTimeoutRef.current);
            wheelQuietTimeoutRef.current = null;
        }
    }, []);

    const refreshWheelQuietPeriod = useCallback(() => {
        isWheelMomentumLockedRef.current = true;
        clearWheelQuietTimeout();
        wheelQuietTimeoutRef.current = window.setTimeout(() => {
            isWheelMomentumLockedRef.current = false;
            accumulatedWheelDeltaRef.current = 0;
            wheelQuietTimeoutRef.current = null;
        }, WHEEL_QUIET_PERIOD_MS);
    }, [clearWheelQuietTimeout]);

    const clearSheetAnimationTimeouts = useCallback(() => {
        if (sheetCloseTimeoutRef.current !== null) {
            window.clearTimeout(sheetCloseTimeoutRef.current);
            sheetCloseTimeoutRef.current = null;
        }

        if (sheetEnterTimeoutRef.current !== null) {
            window.clearTimeout(sheetEnterTimeoutRef.current);
            sheetEnterTimeoutRef.current = null;
        }
    }, []);

    const restoreTakeawaysSheetFocus = useCallback(() => {
        const opener = takeawaysSheetOpenerRef.current;
        takeawaysSheetOpenerRef.current = null;

        if (opener && opener.isConnected) {
            opener.focus();
        }
    }, []);

    const closeTakeawaysSheet = useCallback(() => {
        clearSheetAnimationTimeouts();
        setSheetDragOffset(0);
        sheetTouchStartYRef.current = null;
        if (prefersReducedMotion) {
            setTakeawaysSheetPhase("closed");
            setTakeawaysSheetCard(null);
            restoreTakeawaysSheetFocus();
            return;
        }

        setTakeawaysSheetPhase("exiting");
        sheetCloseTimeoutRef.current = window.setTimeout(() => {
            setTakeawaysSheetCard(null);
            setTakeawaysSheetPhase("closed");
            sheetCloseTimeoutRef.current = null;
            restoreTakeawaysSheetFocus();
        }, TAKEAWAYS_SHEET_CLOSE_DURATION_MS);
    }, [clearSheetAnimationTimeouts, prefersReducedMotion, restoreTakeawaysSheetFocus]);

    const openTakeawaysSheet = useCallback((card: FocusCard, opener: HTMLElement) => {
        clearSheetAnimationTimeouts();
        takeawaysSheetOpenerRef.current = opener;
        setTakeawaysSheetCard(card);
        setSheetDragOffset(0);
        sheetTouchStartYRef.current = null;
        setTakeawaysSheetPhase(prefersReducedMotion ? "entered" : "entering");
    }, [clearSheetAnimationTimeouts, prefersReducedMotion]);

    const moveToCard = useCallback(
        (nextIndex: number) => {
            const list = listRef.current;
            if (!list) {
                return false;
            }

            const cardElements = Array.from(
                list.querySelectorAll<HTMLElement>("[data-focus-card-index]")
            );

            if (cardElements.length === 0) {
                return false;
            }

            const boundedIndex = Math.max(0, Math.min(nextIndex, cardElements.length - 1));
            if (boundedIndex === activeCardIndexRef.current) {
                return false;
            }

            const targetCard = cardElements[boundedIndex];
            if (!targetCard) {
                return false;
            }

            isGestureLockedRef.current = true;
            pendingCardIndexRef.current = boundedIndex;
            accumulatedWheelDeltaRef.current = 0;

            if (unlockTimeoutRef.current !== null) {
                window.clearTimeout(unlockTimeoutRef.current);
            }

            unlockTimeoutRef.current = window.setTimeout(() => {
                unlockGestures();
            }, GESTURE_UNLOCK_TIMEOUT_MS);

            targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
            return true;
        },
        [unlockGestures]
    );

    const moveByDirection = useCallback(
        (direction: -1 | 1) => {
            if (
                isGestureLockedRef.current ||
                isWheelMomentumLockedRef.current ||
                isTakeawaysSheetOpen ||
                cards.length === 0
            ) {
                return false;
            }

            return moveToCard(activeCardIndexRef.current + direction);
        },
        [cards.length, isTakeawaysSheetOpen, moveToCard]
    );

    const fetchBatch = useCallback(async () => {
        if (isFetchingRef.current || !hasMore) {
            return;
        }

        isFetchingRef.current = true;
        setLoading(true);
        setError(null);

        try {
            const excludeIds = buildExcludeParam([
                ...completedIds,
                ...Array.from(seenIdsRef.current),
            ]);

            const params = new URLSearchParams({
                limit: String(BATCH_SIZE),
            });

            if (excludeIds) {
                params.set("excludeIds", excludeIds);
            }

            const response = await fetch(`/api/focus?${params.toString()}`);
            if (!response.ok) {
                throw new Error("Failed to load focus feed.");
            }

            const data = (await response.json()) as FocusFeedItem[];

            data.forEach((item) => seenIdsRef.current.add(item.id));
            setItems((current) => mergeUniqueFocusItems(current, data));
            setHasMore(data.length >= BATCH_SIZE);
        } catch (err) {
            console.error(err);
            setError("Focus mode is unavailable right now.");
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    }, [completedIds, hasMore]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!takeawaysSheetCard || prefersReducedMotion || takeawaysSheetPhase !== "entering") {
            return;
        }

        sheetEnterTimeoutRef.current = window.setTimeout(() => {
            setTakeawaysSheetPhase("entered");
            sheetEnterTimeoutRef.current = null;
        }, TAKEAWAYS_SHEET_ENTER_DELAY_MS);

        return () => {
            if (sheetEnterTimeoutRef.current !== null) {
                window.clearTimeout(sheetEnterTimeoutRef.current);
                sheetEnterTimeoutRef.current = null;
            }
        };
    }, [prefersReducedMotion, takeawaysSheetCard, takeawaysSheetPhase]);

    useEffect(() => {
        if (!isLoaded || hasInitializedRef.current) {
            return;
        }

        const restoredState = readFocusRestoreState();
        if (!restoredState) {
            return;
        }

        seenIdsRef.current = new Set(restoredState.seenIds);
        activeCardIndexRef.current = restoredState.activeCardIndex;
        pendingRestoreCardIndexRef.current = restoredState.activeCardIndex;
        setItems(restoredState.items);
        setHasMore(restoredState.hasMore);
        setActiveCardIndex(restoredState.activeCardIndex);
        hasInitializedRef.current = true;
    }, [isLoaded]);

    useEffect(() => {
        if (!isTakeawaysSheetOpen) {
            return;
        }

        const dialog = takeawaysSheetDialogRef.current;
        if (!dialog) {
            return;
        }

        if (dialog.contains(document.activeElement)) {
            return;
        }

        const focusTarget = takeawaysSheetCloseButtonRef.current ?? dialog;
        focusTarget.focus();
    }, [isTakeawaysSheetOpen, takeawaysSheetPhase]);

    useEffect(() => {
        if (pendingRestoreCardIndexRef.current === null) {
            return;
        }

        const list = listRef.current;
        if (!list || cards.length === 0) {
            return;
        }

        const targetCard = list.querySelector<HTMLElement>(
            `[data-focus-card-index="${pendingRestoreCardIndexRef.current}"]`
        );

        if (!targetCard) {
            return;
        }

        targetCard.scrollIntoView({ block: "start" });
        pendingRestoreCardIndexRef.current = null;
    }, [cards.length]);

    useEffect(() => {
        if (!isLoaded || hasInitializedRef.current) {
            return;
        }

        hasInitializedRef.current = true;
        void fetchBatch();
    }, [fetchBatch, isLoaded]);

    useEffect(() => {
        const list = listRef.current;
        if (!list) {
            return;
        }

        const cardElements = Array.from(
            list.querySelectorAll<HTMLElement>("[data-focus-card-index]")
        );

        if (cardElements.length === 0) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const visibleEntry = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

                if (!visibleEntry) {
                    return;
                }

                const nextIndex = Number(
                    (visibleEntry.target as HTMLElement).dataset.focusCardIndex ?? 0
                );
                const normalizedIndex = Number.isNaN(nextIndex) ? 0 : nextIndex;
                activeCardIndexRef.current = normalizedIndex;
                setActiveCardIndex(normalizedIndex);

                if (
                    isGestureLockedRef.current &&
                    pendingCardIndexRef.current === normalizedIndex
                ) {
                    unlockGestures();
                }
            },
            {
                root: list,
                threshold: [0.55, 0.85],
            }
        );

        cardElements.forEach((element) => observer.observe(element));
        return () => observer.disconnect();
    }, [cards.length, unlockGestures]);

    useEffect(() => {
        activeCardIndexRef.current = activeCardIndex;
    }, [activeCardIndex]);

    useEffect(() => {
        const list = listRef.current;
        if (!list || cards.length === 0) {
            return;
        }

        const handleWheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
                return;
            }

            event.preventDefault();

            if (isGestureLockedRef.current) {
                refreshWheelQuietPeriod();
                return;
            }

            if (isWheelMomentumLockedRef.current) {
                refreshWheelQuietPeriod();
                return;
            }

            accumulatedWheelDeltaRef.current += event.deltaY;
            if (Math.abs(accumulatedWheelDeltaRef.current) < WHEEL_TRIGGER) {
                return;
            }

            const direction = accumulatedWheelDeltaRef.current > 0 ? 1 : -1;
            accumulatedWheelDeltaRef.current = 0;
            if (moveByDirection(direction)) {
                refreshWheelQuietPeriod();
            }
        };

        const handleTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 1) {
                touchStartRef.current = null;
                return;
            }

            const touch = event.touches[0];
            touchStartRef.current = {
                x: touch.clientX,
                y: touch.clientY,
            };
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (!touchStartRef.current || event.touches.length !== 1) {
                return;
            }

            const touch = event.touches[0];
            const deltaX = touch.clientX - touchStartRef.current.x;
            const deltaY = touch.clientY - touchStartRef.current.y;

            if (Math.abs(deltaY) <= Math.abs(deltaX)) {
                return;
            }

            event.preventDefault();

            if (isGestureLockedRef.current || Math.abs(deltaY) < TOUCH_TRIGGER) {
                return;
            }

            touchStartRef.current = null;
            moveByDirection(deltaY < 0 ? 1 : -1);
        };

        const resetTouchTracking = () => {
            touchStartRef.current = null;
        };

        list.addEventListener("wheel", handleWheel, { passive: false });
        list.addEventListener("touchstart", handleTouchStart, { passive: true });
        list.addEventListener("touchmove", handleTouchMove, { passive: false });
        list.addEventListener("touchend", resetTouchTracking);
        list.addEventListener("touchcancel", resetTouchTracking);

        return () => {
            list.removeEventListener("wheel", handleWheel);
            list.removeEventListener("touchstart", handleTouchStart);
            list.removeEventListener("touchmove", handleTouchMove);
            list.removeEventListener("touchend", resetTouchTracking);
            list.removeEventListener("touchcancel", resetTouchTracking);
        };
    }, [cards.length, moveByDirection, refreshWheelQuietPeriod]);

    useEffect(() => {
        return () => {
            unlockGestures();
            clearWheelQuietTimeout();
            clearSheetAnimationTimeouts();
        };
    }, [clearSheetAnimationTimeouts, clearWheelQuietTimeout, unlockGestures]);

    useEffect(() => {
        if (!isDesktop || takeawaysSheetCard === null) {
            return;
        }

        clearSheetAnimationTimeouts();
        setTakeawaysSheetCard(null);
        setTakeawaysSheetPhase("closed");
        setSheetDragOffset(0);
        sheetTouchStartYRef.current = null;
        restoreTakeawaysSheetFocus();
    }, [clearSheetAnimationTimeouts, isDesktop, restoreTakeawaysSheetFocus, takeawaysSheetCard]);

    useEffect(() => {
        if (!mounted || !isTakeawaysSheetOpen) {
            return;
        }

        const originalBodyOverflow = document.body.style.overflow;
        const originalHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = originalBodyOverflow;
            document.documentElement.style.overflow = originalHtmlOverflow;
        };
    }, [isTakeawaysSheetOpen, mounted]);

    useEffect(() => {
        if (!isTakeawaysSheetOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeTakeawaysSheet();
                return;
            }

            if (event.key !== "Tab") {
                return;
            }

            const focusableElements = getFocusableElements(takeawaysSheetDialogRef.current);
            if (focusableElements.length === 0) {
                event.preventDefault();
                takeawaysSheetDialogRef.current?.focus();
                return;
            }

            const first = focusableElements[0];
            const last = focusableElements[focusableElements.length - 1];
            const activeElement = document.activeElement as HTMLElement | null;

            if (!activeElement || !takeawaysSheetDialogRef.current?.contains(activeElement)) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
                return;
            }

            if (event.shiftKey && activeElement === first) {
                event.preventDefault();
                last?.focus();
                return;
            }

            if (!event.shiftKey && activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [closeTakeawaysSheet, isTakeawaysSheetOpen]);

    useEffect(() => {
        if (!hasInitializedRef.current || loading || !hasMore || cards.length === 0) {
            return;
        }

        if (cards.length - activeCardIndex <= 3) {
            void fetchBatch();
        }
    }, [activeCardIndex, cards.length, fetchBatch, hasMore, loading]);

    useEffect(() => {
        if (!mounted || !isLoaded || loading || items.length === 0) {
            return;
        }

        const snapshot: FocusRestoreState = {
            items,
            activeCardIndex,
            hasMore,
            seenIds: Array.from(seenIdsRef.current),
        };

        window.sessionStorage.setItem(
            FOCUS_FEED_RESTORE_STORAGE_KEY,
            JSON.stringify(snapshot)
        );
    }, [activeCardIndex, hasMore, isLoaded, items, loading, mounted]);

    return (
        <section className="px-4 pt-11 md:px-6 md:pt-8 md:pb-6 lg:px-10">
            <div className="mx-auto max-w-3xl space-y-5 md:space-y-6">
                <header className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
                        Focus Mode
                    </p>
                </header>

                {!isLoaded || (loading && cards.length === 0) ? (
                    <LoadingState />
                ) : !loading && cards.length === 0 ? (
                    <EmptyState error={error} />
                ) : (
                    <div
                        ref={listRef}
                        data-testid="focus-feed-list"
                        className={`${FEED_LIST_VIEWPORT_CLASS} scrollbar-hide snap-y snap-mandatory overflow-y-auto overscroll-y-contain`}
                    >
                        <div className="space-y-3 pb-4 md:pb-2">
                            {cards.map((card, index) => (
                                <FocusCardView
                                    key={card.id}
                                    card={card}
                                    cardIndex={index}
                                    isDesktop={isDesktop}
                                    onOpenTakeaways={openTakeawaysSheet}
                                />
                            ))}

                            {loading && cards.length > 0 && (
                                <div className="flex min-h-20 items-center justify-center py-3 text-sm text-muted-foreground">
                                    <Loader2 className="mr-2 size-4 animate-spin text-primary" />
                                    Loading more
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {mounted && isTakeawaysSheetOpen && takeawaysSheetCard
                ? createPortal(
                    <FocusTakeawaysSheet
                        card={takeawaysSheetCard}
                        dragOffset={sheetDragOffset}
                        phase={takeawaysSheetPhase}
                        prefersReducedMotion={prefersReducedMotion}
                        onClose={closeTakeawaysSheet}
                        onDragOffsetChange={setSheetDragOffset}
                        touchStartYRef={sheetTouchStartYRef}
                        dialogRef={takeawaysSheetDialogRef}
                        closeButtonRef={takeawaysSheetCloseButtonRef}
                    />,
                    document.body
                )
                : null}
        </section>
    );
}

function LoadingState() {
    return (
        <div className={`flex items-center justify-center rounded-3xl border border-border/60 bg-card/40 px-6 ${FEED_LIST_VIEWPORT_CLASS}`}>
            <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-5 py-3 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading focus mode
            </div>
        </div>
    );
}

function EmptyState({ error }: { error: string | null }) {
    return (
        <div className={`flex items-center justify-center rounded-3xl border border-border/60 bg-card/40 px-6 ${FEED_LIST_VIEWPORT_CLASS}`}>
            <div className="max-w-md rounded-[2rem] border border-border/60 bg-card/70 p-8 text-center shadow-sm">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Nothing queued yet
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Focus mode needs verified quick-mode content to build the feed.
                </p>
                {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            </div>
        </div>
    );
}

function FocusCardView({
    card,
    cardIndex,
    isDesktop,
    onOpenTakeaways,
}: {
    card: FocusCard;
    cardIndex: number;
    isDesktop: boolean;
    onOpenTakeaways: (card: FocusCard, opener: HTMLElement) => void;
}) {
    const duration = formatDuration(card.duration_seconds);
    const visibleTakeaways = isDesktop
        ? card.takeaways.slice(0, 7)
        : card.takeaways.slice(0, 2);
    const takeawayLabel = isDesktop
        ? "Key Takeaways"
        : card.totalTakeaways > visibleTakeaways.length
            ? `Key Takeaways (${visibleTakeaways.length} of ${card.totalTakeaways})`
            : `Key Takeaways (${card.totalTakeaways})`;

    return (
        <article
            data-focus-card-index={cardIndex}
            data-testid="focus-feed-card"
            className={`${FEED_CARD_HEIGHT_CLASS} snap-start overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 px-5 py-4 shadow-sm backdrop-blur sm:px-6 sm:py-5`}
        >
            <div className="flex h-full flex-col">
                <div className={isDesktop ? "space-y-2.5" : "space-y-2.5"}>
                    <div className={isDesktop ? "space-y-1.5" : "space-y-2"}>
                        <h2 className="line-clamp-3 text-[1.2rem] font-semibold tracking-tight leading-[1.1] text-foreground sm:text-[1.5rem] sm:leading-[1.1]">
                            {card.title}
                        </h2>
                        <div className="space-y-1.5">
                            {card.author && (
                                <p className="line-clamp-1 text-xs text-muted-foreground/70 sm:text-[13px]">
                                    {card.author}
                                </p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/70 sm:text-xs">
                                <span className="rounded-full border border-border/40 px-2 py-0.5 uppercase tracking-[0.16em] text-muted-foreground/80">
                                    {card.type}
                                </span>
                                {card.category && (
                                    <span className="line-clamp-1 rounded-full border border-border/40 px-2 py-0.5 text-muted-foreground/80">
                                        {card.category}
                                    </span>
                                )}
                                {duration && (
                                    <span className="rounded-full border border-border/40 px-2 py-0.5 text-muted-foreground/80">
                                        {duration}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <section
                        className={
                            isDesktop
                                ? "rounded-2xl border border-border/35 bg-background/30 p-2.5 sm:p-3"
                                : ""
                        }
                    >
                        <p
                            className={
                                isDesktop
                                    ? "line-clamp-6 text-[0.9rem] leading-[1.55] text-foreground/92 sm:text-[0.95rem] sm:leading-[1.55]"
                                    : "line-clamp-8 text-[0.9rem] leading-[1.55] text-foreground/92 sm:text-[0.95rem] sm:leading-[1.55]"
                            }
                        >
                            {card.hook}
                        </p>
                    </section>

                    <section
                        className={
                            isDesktop
                                ? "rounded-2xl border border-border/35 bg-background/30 p-2.5 sm:p-3"
                                : ""
                        }
                    >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/75 sm:text-[11px]">
                            {takeawayLabel}
                        </p>
                        {visibleTakeaways.length > 0 ? (
                            <div className={isDesktop ? "mt-1.5 space-y-1.5" : "mt-1.5 space-y-1.5"}>
                                {visibleTakeaways.map((takeaway, index) => (
                                    <div
                                        key={`${card.id}-${index}`}
                                        className="flex gap-2.5 text-[0.85rem] leading-[1.55] text-foreground/88 sm:text-[0.9rem] sm:leading-[1.55]"
                                    >
                                        <span className="mt-0.5 text-[11px] font-semibold text-primary sm:text-xs">
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                        <span className={isDesktop ? "line-clamp-2" : "line-clamp-4"}>
                                            {takeaway}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2.5 line-clamp-2 text-[0.9rem] leading-[1.55] text-muted-foreground">
                                Open the full summary for the complete breakdown.
                            </p>
                        )}
                    </section>

                    <div className={isDesktop ? "flex flex-wrap items-center justify-start gap-3 pt-0" : "flex flex-wrap items-center justify-end gap-3 pt-0"}>
                        {isDesktop ? (
                            <Link
                                href={`/read/${card.id}`}
                                className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                aria-label={`Read ${card.title}`}
                            >
                                <BookOpen className="size-4" />
                                Read
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={(event) => onOpenTakeaways(card, event.currentTarget)}
                                className="focus-ring inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                aria-label={`Show full takeaways for ${card.title}`}
                            >
                                <Info className="size-4" />
                                Full takeaways
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

function FocusTakeawaysSheet({
    card,
    dragOffset,
    phase,
    prefersReducedMotion,
    onClose,
    onDragOffsetChange,
    touchStartYRef,
    dialogRef,
    closeButtonRef,
}: {
    card: FocusCard;
    dragOffset: number;
    phase: TakeawaysSheetPhase;
    prefersReducedMotion: boolean;
    onClose: () => void;
    onDragOffsetChange: (offset: number) => void;
    touchStartYRef: MutableRefObject<number | null>;
    dialogRef: MutableRefObject<HTMLDivElement | null>;
    closeButtonRef: MutableRefObject<HTMLButtonElement | null>;
}) {
    const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
        if (event.touches.length !== 1) {
            touchStartYRef.current = null;
            return;
        }

        touchStartYRef.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
        if (touchStartYRef.current === null || event.touches.length !== 1) {
            return;
        }

        const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
        const nextOffset = Math.max(0, currentY - touchStartYRef.current);
        onDragOffsetChange(Math.min(nextOffset, 160));
    };

    const handleTouchEnd = () => {
        if (dragOffset > 80) {
            onClose();
            return;
        }

        touchStartYRef.current = null;
        onDragOffsetChange(0);
    };

    const isDragging = dragOffset > 0;
    const shouldAnimateMotion = !prefersReducedMotion && !isDragging;
    const isExiting = phase === "exiting";
    const backdropOpacityClass =
        phase === "entered" ? "opacity-100" : "opacity-0";
    const sheetTranslateY = isDragging
        ? dragOffset
        : prefersReducedMotion
            ? 0
            : phase === "entering"
                ? 24
                : phase === "exiting"
                    ? 20
                    : 0;
    const sheetOpacity = prefersReducedMotion
        ? 1
        : phase === "entered"
            ? 1
            : 0.94;
    const backdropTransitionStyle = prefersReducedMotion
        ? undefined
        : {
            transitionDuration: `${isExiting ? TAKEAWAYS_SHEET_CLOSE_DURATION_MS : TAKEAWAYS_SHEET_BACKDROP_OPEN_DURATION_MS}ms`,
            transitionTimingFunction: isExiting ? "ease-in" : "ease-out",
        };
    const sheetTransitionStyle = shouldAnimateMotion
        ? {
            transitionDuration: `${isExiting ? TAKEAWAYS_SHEET_CLOSE_DURATION_MS : TAKEAWAYS_SHEET_OPEN_DURATION_MS}ms`,
            transitionTimingFunction: isExiting ? "ease-in" : "ease-out",
            transform: `translateY(${sheetTranslateY}px)`,
            opacity: sheetOpacity,
        }
        : {
            transform: `translateY(${sheetTranslateY}px)`,
            opacity: sheetOpacity,
        };

    return (
        <div className="fixed inset-0 z-[80] lg:hidden" aria-hidden={false}>
            <button
                type="button"
                data-testid="focus-takeaways-sheet-backdrop"
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${prefersReducedMotion ? "" : "transition-opacity"} ${backdropOpacityClass}`}
                aria-label="Close full takeaways"
                onClick={onClose}
                style={backdropTransitionStyle}
            />

            <div
                data-testid="focus-takeaways-sheet-frame"
                className="absolute inset-x-0 bottom-0 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Full takeaways for ${card.title}`}
                    data-testid="focus-takeaways-sheet"
                    ref={dialogRef}
                    tabIndex={-1}
                    className={`mx-auto flex max-h-[min(82svh,calc(100svh-1rem))] w-full max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-background shadow-2xl ${prefersReducedMotion ? "" : "transition-transform transition-opacity"}`}
                    style={sheetTransitionStyle}
                >
                    <div
                        className="relative flex justify-center px-4 pt-3 pb-2"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchEnd}
                    >
                        <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30" />
                        <button
                            type="button"
                            onClick={onClose}
                            ref={closeButtonRef}
                            data-testid="focus-takeaways-sheet-close"
                            className="focus-ring absolute right-3 top-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                            aria-label="Close full takeaways"
                        >
                            <X className="size-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
                        <div className="space-y-3">
                            {card.takeaways.map((takeaway, index) => (
                                <div
                                    key={`${card.id}-sheet-${index}`}
                                    className="flex gap-3 text-[0.92rem] leading-[1.55] text-foreground/90"
                                >
                                    <span className="mt-0.5 text-[11px] font-semibold text-primary">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <span>{takeaway}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-border/40 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <Link
                            href={`/read/${card.id}`}
                            className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                            aria-label={`Read ${card.title}`}
                        >
                            <BookOpen className="size-4" />
                            Read
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
