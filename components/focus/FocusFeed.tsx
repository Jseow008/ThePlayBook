"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useOverlayInteractions } from "@/hooks/useOverlayInteractions";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { VIEWPORT_QUERIES } from "@/lib/breakpoints";
import { QuickModeSchema, type FocusFeedItem } from "@/types/domain";
import { FocusCardView } from "@/components/focus/FocusCardView";
import { EmptyState, LoadingState } from "@/components/focus/FocusFeedStates";
import { FocusTakeawaysSheet } from "@/components/focus/FocusTakeawaysSheet";
import { buildFocusCards, mergeUniqueFocusItems, type FocusCard } from "@/components/focus/focus-feed-utils";
import {
    FEED_LIST_VIEWPORT_CLASS,
    TAKEAWAYS_SHEET_CLOSE_DURATION_MS,
    TAKEAWAYS_SHEET_ENTER_DELAY_MS,
    getDesktopAvailableContentHeight,
    getDesktopCoverWidth,
    getDesktopVisibleTakeawayCount,
    getMobileHookMaxHeight,
    type SheetTouchPoint,
    type TakeawaysSheetPhase,
} from "@/components/focus/focus-feed-layout";

export {
    getDesktopAvailableContentHeight,
    getDesktopCoverWidth,
    getDesktopVisibleTakeawayCount,
    getMobileHookMaxHeight,
};

const BATCH_SIZE = 6;
const DESKTOP_SCROLL_CUE_DELAY_MS = 5000;
const MOBILE_SCROLL_HINT_DELAY_MS = 2400;
const FOCUS_FEED_RESTORE_STORAGE_KEY = "focus-feed-restore-v1";
const FOCUS_FEED_SEED_STORAGE_KEY = "focus-feed-seed-v1";
const MOBILE_SCROLL_HINT_DISMISSED_STORAGE_KEY = "focus-feed-mobile-scroll-hint-dismissed-v1";
const RESTORE_STATE_WRITE_DELAY_MS = 250;
const FOCUS_FEED_FETCH_TIMEOUT_MS = 10_000;
const FOCUS_FEED_GESTURE_LOCK_MS = 420;
const FOCUS_FEED_WHEEL_THRESHOLD_PX = 48;
const FOCUS_FEED_TOUCH_THRESHOLD_PX = 44;
const FOCUS_EXCLUSION_LIMIT = 500;
const FOCUS_PERSONALIZATION_SEED_LIMIT = 12;
const FocusItemIdSchema = z.string().uuid();

type FocusFeedResponse = {
    items: FocusFeedItem[];
    pageInfo?: {
        hasMore?: boolean;
        nextCursor?: string | null;
    };
};

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
        items: z.array(FocusRestoreItemSchema),
        activeCardIndex: z.number().int().min(0),
        hasMore: z.boolean(),
        nextCursor: z.string().trim().min(1).max(4096).nullable().optional(),
        seenIds: z.array(z.string()).optional(),
    })
    .superRefine((value, ctx) => {
        if (value.items.length === 0 && value.activeCardIndex !== 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["activeCardIndex"],
                message: "activeCardIndex must be zero when there are no restored items",
            });
            return;
        }

        if (value.items.length > 0 && value.activeCardIndex >= value.items.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["activeCardIndex"],
                message: "activeCardIndex must be within the restored items array",
            });
        }
    });

type FocusRestoreState = z.infer<typeof FocusRestoreStateSchema>;

function readSessionStorageItem(key: string) {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        return window.sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeSessionStorageItem(key: string, value: string) {
    if (typeof window === "undefined") {
        return false;
    }

    try {
        window.sessionStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function removeSessionStorageItem(key: string) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // Storage can be unavailable in private or restricted browser contexts.
    }
}

function shuffleItems<T>(items: T[]): T[] {
    const next = [...items];

    for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }

    return next;
}

function normalizeFocusItemIds(ids: string[], max = Number.POSITIVE_INFINITY) {
    return Array.from(
        new Set(
            ids
                .map((id) => id.trim())
                .filter((id) => FocusItemIdSchema.safeParse(id).success)
        )
    ).slice(0, max);
}

function createFocusSeed() {
    return Math.random().toString(36).slice(2, 12) || "focus";
}

function readOrCreateFocusSeed() {
    if (typeof window === "undefined") {
        return "focus";
    }

    const existingSeed = readSessionStorageItem(FOCUS_FEED_SEED_STORAGE_KEY);
    if (existingSeed && /^[a-zA-Z0-9_-]{1,64}$/.test(existingSeed)) {
        return existingSeed;
    }

    const nextSeed = createFocusSeed();
    writeSessionStorageItem(FOCUS_FEED_SEED_STORAGE_KEY, nextSeed);
    return nextSeed;
}

function readFocusRestoreState(): FocusRestoreState | null {
    if (typeof window === "undefined") {
        return null;
    }

    const raw = readSessionStorageItem(FOCUS_FEED_RESTORE_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = FocusRestoreStateSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
            removeSessionStorageItem(FOCUS_FEED_RESTORE_STORAGE_KEY);
            return null;
        }

        return parsed.data;
    } catch {
        removeSessionStorageItem(FOCUS_FEED_RESTORE_STORAGE_KEY);
        return null;
    }
}

function writeFocusRestoreState(snapshot: FocusRestoreState) {
    if (typeof window === "undefined") {
        return;
    }

    writeSessionStorageItem(
        FOCUS_FEED_RESTORE_STORAGE_KEY,
        JSON.stringify(snapshot)
    );
}

function readMobileScrollHintDismissed() {
    if (typeof window === "undefined") {
        return false;
    }

    return readSessionStorageItem(MOBILE_SCROLL_HINT_DISMISSED_STORAGE_KEY) === "true";
}

function writeMobileScrollHintDismissed() {
    writeSessionStorageItem(MOBILE_SCROLL_HINT_DISMISSED_STORAGE_KEY, "true");
}

function buildRestoreCursorFromSnapshot(snapshot: FocusRestoreState) {
    if (snapshot.nextCursor !== undefined) {
        return snapshot.nextCursor;
    }

    if (!snapshot.hasMore) {
        return null;
    }

    return null;
}

function getFocusCardIndex(element: HTMLElement | null) {
    const index = Number(element?.dataset.focusCardIndex ?? 0);
    return Number.isNaN(index) ? 0 : index;
}

function getClosestVisibleFocusCardIndex(
    list: HTMLElement,
    visibleElements: Iterable<HTMLElement>,
    fallbackElement: HTMLElement | null
) {
    const candidates = Array.from(visibleElements).filter((element) => element.isConnected);

    if (candidates.length === 0) {
        return fallbackElement ? getFocusCardIndex(fallbackElement) : null;
    }

    const listRect = list.getBoundingClientRect();
    const viewportCenter = listRect.top + listRect.height / 2;
    let closestElement: HTMLElement | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    candidates.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const cardCenter = rect.top + rect.height / 2;
        const distance = Math.abs(cardCenter - viewportCenter);

        if (distance < closestDistance) {
            closestDistance = distance;
            closestElement = element;
        }
    });

    return getFocusCardIndex(closestElement);
}

export function FocusFeed() {
    const { completedIds, isLoaded, myListIds, toggleMyList } = useReadingProgress();
    const isFocusDesktop = useMediaQuery(VIEWPORT_QUERIES.focusDesktop);
    const prefersReducedMotion = usePrefersReducedMotion();
    const [items, setItems] = useState<FocusFeedItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hasInitialized, setHasInitialized] = useState(false);
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [listViewportHeight, setListViewportHeight] = useState<number | null>(null);
    const [takeawaysSheetCard, setTakeawaysSheetCard] = useState<FocusCard | null>(null);
    const [takeawaysSheetPhase, setTakeawaysSheetPhase] = useState<TakeawaysSheetPhase>("closed");
    const [sheetDragOffset, setSheetDragOffset] = useState(0);
    const [isDesktopScrollCueVisible, setIsDesktopScrollCueVisible] = useState(false);
    const [isMobileScrollHintVisible, setIsMobileScrollHintVisible] = useState(false);
    const listRef = useRef<HTMLDivElement | null>(null);
    const seenIdsRef = useRef<Set<string>>(new Set());
    const hasInitializedRef = useRef(false);
    const isFetchingRef = useRef(false);
    const activeCardIndexRef = useRef(0);
    const hasMoreRef = useRef(true);
    const itemsRef = useRef<FocusFeedItem[]>([]);
    const myListIdSetRef = useRef<Set<string>>(new Set());
    const nextCursorRef = useRef<string | null>(null);
    const isRestoringSnapshotRef = useRef(false);
    const restorePrefetchArmedRef = useRef(false);
    const sheetTouchStartYRef = useRef<number | null>(null);
    const sheetTouchLastPointRef = useRef<SheetTouchPoint | null>(null);
    const sheetTouchVelocityRef = useRef(0);
    const sheetCloseTimeoutRef = useRef<number | null>(null);
    const sheetEnterTimeoutRef = useRef<number | null>(null);
    const takeawaysSheetDialogRef = useRef<HTMLDivElement | null>(null);
    const takeawaysSheetCloseButtonRef = useRef<HTMLButtonElement | null>(null);
    const takeawaysSheetOpenerRef = useRef<HTMLElement | null>(null);
    const pendingRestoreCardIndexRef = useRef<number | null>(null);
    const desktopScrollCueTimeoutRef = useRef<number | null>(null);
    const mobileScrollHintShowTimeoutRef = useRef<number | null>(null);
    const gestureNavigationLockTimeoutRef = useRef<number | null>(null);
    const wheelDeltaYRef = useRef(0);
    const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
    const hasDismissedMobileScrollHintRef = useRef(false);
    const hasScheduledMobileScrollHintRef = useRef(false);
    const mobileScrollHintAnchorIndexRef = useRef<number | null>(null);
    const restoreStateWriteTimeoutRef = useRef<number | null>(null);
    const pendingRestoreSnapshotRef = useRef<FocusRestoreState | null>(null);
    const focusSeedRef = useRef<string | null>(null);
    const visibleCardElementsRef = useRef<Set<HTMLElement>>(new Set());

    const cards = useMemo(() => buildFocusCards(items), [items]);
    const myListIdSet = useMemo(() => new Set(myListIds), [myListIds]);
    const isTakeawaysSheetOpen = !isFocusDesktop && takeawaysSheetCard !== null;

    const buildRestoreSnapshot = useCallback((): FocusRestoreState => ({
        items: itemsRef.current,
        activeCardIndex: activeCardIndexRef.current,
        hasMore: hasMoreRef.current,
        nextCursor: nextCursorRef.current,
        seenIds: Array.from(seenIdsRef.current),
    }), []);

    const clearDesktopScrollCueTimeout = useCallback(() => {
        if (desktopScrollCueTimeoutRef.current !== null) {
            window.clearTimeout(desktopScrollCueTimeoutRef.current);
            desktopScrollCueTimeoutRef.current = null;
        }
    }, []);

    const clearMobileScrollHintTimeouts = useCallback(() => {
        if (mobileScrollHintShowTimeoutRef.current !== null) {
            window.clearTimeout(mobileScrollHintShowTimeoutRef.current);
            mobileScrollHintShowTimeoutRef.current = null;
        }
    }, []);

    const clearGestureNavigationLockTimeout = useCallback(() => {
        if (gestureNavigationLockTimeoutRef.current !== null) {
            window.clearTimeout(gestureNavigationLockTimeoutRef.current);
            gestureNavigationLockTimeoutRef.current = null;
        }
    }, []);

    const dismissMobileScrollHint = useCallback(() => {
        clearMobileScrollHintTimeouts();
        setIsMobileScrollHintVisible(false);
        mobileScrollHintAnchorIndexRef.current = null;
        hasDismissedMobileScrollHintRef.current = true;
        writeMobileScrollHintDismissed();
    }, [clearMobileScrollHintTimeouts]);

    const resetDesktopScrollCueTimer = useCallback(() => {
        clearDesktopScrollCueTimeout();
        setIsDesktopScrollCueVisible(false);

        if (!isFocusDesktop || activeCardIndexRef.current >= cards.length - 1) {
            return;
        }

        desktopScrollCueTimeoutRef.current = window.setTimeout(() => {
            setIsDesktopScrollCueVisible(true);
            desktopScrollCueTimeoutRef.current = null;
        }, DESKTOP_SCROLL_CUE_DELAY_MS);
    }, [cards.length, clearDesktopScrollCueTimeout, isFocusDesktop]);

    const scheduleMobileScrollHint = useCallback(() => {
        clearMobileScrollHintTimeouts();
        setIsMobileScrollHintVisible(false);

        if (
            isFocusDesktop
            || hasDismissedMobileScrollHintRef.current
            || hasScheduledMobileScrollHintRef.current
            || cards.length <= 1
        ) {
            return;
        }

        hasScheduledMobileScrollHintRef.current = true;

        mobileScrollHintShowTimeoutRef.current = window.setTimeout(() => {
            mobileScrollHintAnchorIndexRef.current = Math.min(activeCardIndexRef.current, cards.length - 1);
            setIsMobileScrollHintVisible(true);
            mobileScrollHintShowTimeoutRef.current = null;
        }, MOBILE_SCROLL_HINT_DELAY_MS);
    }, [cards.length, clearMobileScrollHintTimeouts, isFocusDesktop]);

    const scrollToFocusCard = useCallback((direction: -1 | 1) => {
        const list = listRef.current;
        if (!list || cards.length <= 1 || gestureNavigationLockTimeoutRef.current !== null) {
            return false;
        }

        const currentIndex = activeCardIndexRef.current;
        const targetIndex = Math.min(
            Math.max(currentIndex + direction, 0),
            cards.length - 1
        );

        if (targetIndex === currentIndex) {
            return false;
        }

        const targetCard = list.querySelector<HTMLElement>(
            `[data-focus-card-index="${targetIndex}"]`
        );
        if (!targetCard) {
            return false;
        }

        activeCardIndexRef.current = targetIndex;
        setActiveCardIndex(targetIndex);
        targetCard.scrollIntoView({
            block: "start",
            behavior: prefersReducedMotion ? "auto" : "smooth",
        });

        if (isFocusDesktop) {
            resetDesktopScrollCueTimer();
        } else {
            dismissMobileScrollHint();
        }

        gestureNavigationLockTimeoutRef.current = window.setTimeout(() => {
            gestureNavigationLockTimeoutRef.current = null;
        }, FOCUS_FEED_GESTURE_LOCK_MS);

        return true;
    }, [
        cards.length,
        dismissMobileScrollHint,
        isFocusDesktop,
        prefersReducedMotion,
        resetDesktopScrollCueTimer,
    ]);

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

    const flushRestoreStateWrite = useCallback(() => {
        if (restoreStateWriteTimeoutRef.current !== null) {
            window.clearTimeout(restoreStateWriteTimeoutRef.current);
            restoreStateWriteTimeoutRef.current = null;
        }

        const snapshot = buildRestoreSnapshot();
        pendingRestoreSnapshotRef.current = snapshot;
        writeFocusRestoreState(snapshot);
    }, [buildRestoreSnapshot]);

    const scheduleRestoreStateWrite = useCallback((snapshot?: FocusRestoreState) => {
        const nextSnapshot = snapshot ?? buildRestoreSnapshot();
        pendingRestoreSnapshotRef.current = nextSnapshot;

        if (restoreStateWriteTimeoutRef.current !== null) {
            window.clearTimeout(restoreStateWriteTimeoutRef.current);
        }

        restoreStateWriteTimeoutRef.current = window.setTimeout(() => {
            restoreStateWriteTimeoutRef.current = null;
            writeFocusRestoreState(nextSnapshot);
        }, RESTORE_STATE_WRITE_DELAY_MS);
    }, [buildRestoreSnapshot]);

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
        sheetTouchLastPointRef.current = null;
        sheetTouchVelocityRef.current = 0;
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
        sheetTouchLastPointRef.current = null;
        sheetTouchVelocityRef.current = 0;
        setTakeawaysSheetPhase(prefersReducedMotion ? "entered" : "entering");
    }, [clearSheetAnimationTimeouts, prefersReducedMotion]);

    const handleToggleSave = useCallback((card: FocusCard) => {
        const wasSaved = myListIdSetRef.current.has(card.id);
        toggleMyList(card.id);
        if (wasSaved) {
            myListIdSetRef.current.delete(card.id);
        } else {
            myListIdSetRef.current.add(card.id);
        }
        toast.success(wasSaved ? "Removed from Library" : "Saved to Library");
    }, [toggleMyList]);

    const fetchBatch = useCallback(async (options?: {
        ignoreHasMore?: boolean;
        includeCompletedIds?: boolean;
        resetCursor?: boolean;
    }) => {
        if (isFetchingRef.current || (!options?.ignoreHasMore && !hasMoreRef.current)) {
            return;
        }

        isFetchingRef.current = true;
        setLoading(true);
        setError(null);

        if (options?.resetCursor) {
            nextCursorRef.current = null;
            setNextCursor(null);
        }

        const controller = new AbortController();
        let timeoutId: number | null = window.setTimeout(() => {
            controller.abort();
        }, FOCUS_FEED_FETCH_TIMEOUT_MS);

        try {
            const includeCompletedIds = options?.includeCompletedIds ?? isLoaded;
            const excludeIds = normalizeFocusItemIds([
                ...(includeCompletedIds ? completedIds : []),
                ...Array.from(seenIdsRef.current),
            ], FOCUS_EXCLUSION_LIMIT);
            focusSeedRef.current = focusSeedRef.current ?? readOrCreateFocusSeed();
            const cursor = options?.resetCursor ? null : nextCursorRef.current;

            const response = await fetch("/api/focus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    limit: BATCH_SIZE,
                    seed: focusSeedRef.current,
                    cursor: cursor ?? undefined,
                    excludeIds,
                    completedIds: includeCompletedIds
                        ? normalizeFocusItemIds(completedIds, FOCUS_PERSONALIZATION_SEED_LIMIT)
                        : [],
                    savedIds: isLoaded
                        ? normalizeFocusItemIds(myListIds, FOCUS_PERSONALIZATION_SEED_LIMIT)
                        : [],
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error("Failed to load focus feed.");
            }

            const payload = await response.json() as FocusFeedItem[] | FocusFeedResponse;
            const data = Array.isArray(payload) ? payload : payload.items ?? [];
            const pageInfo = Array.isArray(payload) ? undefined : payload.pageInfo;
            const shuffledData = shuffleItems(data);

            shuffledData.forEach((item) => seenIdsRef.current.add(item.id));
            setItems((current) => {
                const nextItems = mergeUniqueFocusItems(current, shuffledData);
                itemsRef.current = nextItems;
                return nextItems;
            });
            const resolvedHasMore = pageInfo?.hasMore ?? data.length >= BATCH_SIZE;
            hasMoreRef.current = resolvedHasMore;
            setHasMore(resolvedHasMore);
            const resolvedNextCursor = pageInfo?.nextCursor ?? null;
            nextCursorRef.current = resolvedNextCursor;
            setNextCursor(resolvedNextCursor);
        } catch (err) {
            const isAbortError = err instanceof DOMException && err.name === "AbortError";
            if (!isAbortError) {
                console.error(err);
            }
            setError(
                isAbortError
                    ? "Focus mode is taking too long to load."
                    : "Focus mode is unavailable right now."
            );
        } finally {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
                timeoutId = null;
            }
            isFetchingRef.current = false;
            setLoading(false);
        }
    }, [completedIds, isLoaded, myListIds]);

    const retryFocusFeed = useCallback(() => {
        setError(null);
        hasMoreRef.current = true;
        setHasMore(true);
        nextCursorRef.current = null;
        setNextCursor(null);

        if (itemsRef.current.length === 0) {
            seenIdsRef.current = new Set();
            activeCardIndexRef.current = 0;
            setActiveCardIndex(0);
        }

        void fetchBatch({
            ignoreHasMore: true,
            includeCompletedIds: isLoaded,
            resetCursor: true,
        });
    }, [fetchBatch, isLoaded]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const listElement = listRef.current;
        if (!listElement) {
            setListViewportHeight(null);
            return;
        }

        const updateListViewportHeight = () => {
            const nextHeight = Math.round(listElement.getBoundingClientRect().height);
            setListViewportHeight((currentHeight) =>
                currentHeight === nextHeight ? currentHeight : nextHeight
            );
        };

        updateListViewportHeight();

        const observer = new ResizeObserver(() => {
            updateListViewportHeight();
        });

        observer.observe(listElement);

        return () => observer.disconnect();
    }, [cards.length, hasInitialized, isFocusDesktop, loading, mounted]);

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
        if (hasInitializedRef.current) {
            return;
        }

        const restoredState = readFocusRestoreState();
        if (restoredState) {
            seenIdsRef.current = new Set(restoredState.seenIds ?? restoredState.items.map((item) => item.id));
            activeCardIndexRef.current = restoredState.activeCardIndex;
            isRestoringSnapshotRef.current = true;
            const restoredNextCursor = buildRestoreCursorFromSnapshot(restoredState);
            restorePrefetchArmedRef.current =
                restoredState.hasMore
                && restoredState.items.length > 0
                && restoredState.items.length - restoredState.activeCardIndex <= 3;
            pendingRestoreCardIndexRef.current =
                restoredState.items.length > 0 ? restoredState.activeCardIndex : null;
            itemsRef.current = restoredState.items;
            hasMoreRef.current = restoredState.hasMore;
            setHasMore(restoredState.hasMore);
            nextCursorRef.current = restoredNextCursor;
            setNextCursor(restoredNextCursor);
            setItems(restoredState.items);
            setActiveCardIndex(restoredState.activeCardIndex);
            hasInitializedRef.current = true;
            setHasInitialized(true);
            return;
        }

        hasInitializedRef.current = true;
        setHasInitialized(true);
        itemsRef.current = [];
        hasMoreRef.current = true;
        nextCursorRef.current = null;
        void fetchBatch({ includeCompletedIds: isLoaded });
    }, [fetchBatch, isLoaded]);

    useOverlayInteractions({
        enabled: isTakeawaysSheetOpen,
        containerRef: takeawaysSheetDialogRef,
        initialFocusRef: takeawaysSheetCloseButtonRef,
        restoreFocusRef: takeawaysSheetOpenerRef,
        onEscape: closeTakeawaysSheet,
        scrollLock: { lockDocumentElement: true },
    });

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
        if (!isLoaded || items.length === 0) {
            return;
        }

        const activeItemId = items[activeCardIndexRef.current]?.id ?? null;
        const completedSet = new Set(completedIds);
        const filteredItems = items.filter((item) => !completedSet.has(item.id));

        if (filteredItems.length === items.length) {
            return;
        }

        let nextActiveIndex = 0;
        if (filteredItems.length > 0) {
            const preservedActiveIndex = activeItemId === null
                ? -1
                : filteredItems.findIndex((item) => item.id === activeItemId);
            nextActiveIndex = preservedActiveIndex >= 0
                ? preservedActiveIndex
                : Math.min(activeCardIndexRef.current, filteredItems.length - 1);
        }

        if (nextActiveIndex !== activeCardIndexRef.current) {
            activeCardIndexRef.current = nextActiveIndex;
            setActiveCardIndex(nextActiveIndex);
        }

        itemsRef.current = filteredItems;
        setItems(filteredItems);

        if (filteredItems.length === 0) {
            nextCursorRef.current = null;
            setNextCursor(null);
            hasMoreRef.current = true;
            setHasMore(true);
            void fetchBatch({
                ignoreHasMore: true,
                includeCompletedIds: true,
                resetCursor: true,
            });
            return;
        }

        if (hasMore && filteredItems.length - nextActiveIndex <= 3) {
            void fetchBatch({ includeCompletedIds: true });
        }
    }, [completedIds, fetchBatch, hasMore, isLoaded, items]);

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

        const visibleCardElements = visibleCardElementsRef.current;
        visibleCardElements.clear();

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const target = entry.target as HTMLElement | null;
                    if (!target) {
                        return;
                    }

                    if (entry.isIntersecting) {
                        visibleCardElements.add(target);
                    } else {
                        visibleCardElements.delete(target);
                    }
                });

                const fallbackTarget = (entries.find((entry) => entry.isIntersecting)?.target as HTMLElement | undefined) ?? null;
                const normalizedIndex = getClosestVisibleFocusCardIndex(
                    list,
                    visibleCardElements,
                    fallbackTarget
                );

                if (normalizedIndex === null) {
                    return;
                }

                activeCardIndexRef.current = normalizedIndex;
                setActiveCardIndex(normalizedIndex);
            },
            {
                root: list,
                threshold: [0, 0.25, 0.5, 0.75, 1],
            }
        );

        cardElements.forEach((element) => observer.observe(element));
        return () => {
            visibleCardElements.clear();
            observer.disconnect();
        };
    }, [cards.length]);

    useEffect(() => {
        activeCardIndexRef.current = activeCardIndex;
    }, [activeCardIndex]);

    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    useEffect(() => {
        hasMoreRef.current = hasMore;
    }, [hasMore]);

    useEffect(() => {
        nextCursorRef.current = nextCursor;
    }, [nextCursor]);

    useEffect(() => {
        myListIdSetRef.current = new Set(myListIds);
    }, [myListIds]);

    useEffect(() => {
        hasDismissedMobileScrollHintRef.current = readMobileScrollHintDismissed();
    }, []);

    useEffect(() => {
        const list = listRef.current;
        if (!list || cards.length === 0) {
            return;
        }

        const handleScroll = () => {
            resetDesktopScrollCueTimer();

            if (!isFocusDesktop) {
                dismissMobileScrollHint();
            }
        };

        list.addEventListener("scroll", handleScroll, { passive: true });

        return () => list.removeEventListener("scroll", handleScroll);
    }, [cards.length, dismissMobileScrollHint, isFocusDesktop, resetDesktopScrollCueTimer]);

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

            if (gestureNavigationLockTimeoutRef.current !== null) {
                return;
            }

            wheelDeltaYRef.current += event.deltaY;
            if (Math.abs(wheelDeltaYRef.current) < FOCUS_FEED_WHEEL_THRESHOLD_PX) {
                return;
            }

            const direction = wheelDeltaYRef.current > 0 ? 1 : -1;
            wheelDeltaYRef.current = 0;
            scrollToFocusCard(direction);
        };

        const handleTouchStart = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (!touch) {
                touchStartPointRef.current = null;
                return;
            }

            touchStartPointRef.current = {
                x: touch.clientX,
                y: touch.clientY,
            };
        };

        const handleTouchMove = (event: TouchEvent) => {
            const touch = event.touches[0];
            const startPoint = touchStartPointRef.current;
            if (!touch || !startPoint) {
                return;
            }

            const deltaX = touch.clientX - startPoint.x;
            const deltaY = touch.clientY - startPoint.y;
            if (Math.abs(deltaY) > Math.abs(deltaX) && event.cancelable) {
                event.preventDefault();
            }
        };

        const handleTouchEnd = (event: TouchEvent) => {
            const changedTouch = event.changedTouches[0];
            const startPoint = touchStartPointRef.current;
            touchStartPointRef.current = null;
            if (!changedTouch || !startPoint || gestureNavigationLockTimeoutRef.current !== null) {
                return;
            }

            const deltaX = changedTouch.clientX - startPoint.x;
            const deltaY = changedTouch.clientY - startPoint.y;
            if (
                Math.abs(deltaY) < FOCUS_FEED_TOUCH_THRESHOLD_PX
                || Math.abs(deltaY) <= Math.abs(deltaX)
            ) {
                return;
            }

            scrollToFocusCard(deltaY < 0 ? 1 : -1);
        };

        list.addEventListener("wheel", handleWheel, { passive: false });
        list.addEventListener("touchstart", handleTouchStart, { passive: true });
        list.addEventListener("touchmove", handleTouchMove, { passive: false });
        list.addEventListener("touchend", handleTouchEnd);

        return () => {
            list.removeEventListener("wheel", handleWheel);
            list.removeEventListener("touchstart", handleTouchStart);
            list.removeEventListener("touchmove", handleTouchMove);
            list.removeEventListener("touchend", handleTouchEnd);
            wheelDeltaYRef.current = 0;
            touchStartPointRef.current = null;
        };
    }, [cards.length, scrollToFocusCard]);

    useEffect(() => {
        resetDesktopScrollCueTimer();

        return () => {
            clearDesktopScrollCueTimeout();
        };
    }, [activeCardIndex, cards.length, clearDesktopScrollCueTimeout, isFocusDesktop, resetDesktopScrollCueTimer]);

    useEffect(() => {
        if (isFocusDesktop) {
            clearMobileScrollHintTimeouts();
            setIsMobileScrollHintVisible(false);
            mobileScrollHintAnchorIndexRef.current = null;
            hasScheduledMobileScrollHintRef.current = false;
            return;
        }

        if (
            isMobileScrollHintVisible
            && mobileScrollHintAnchorIndexRef.current !== null
            && activeCardIndex !== mobileScrollHintAnchorIndexRef.current
        ) {
            dismissMobileScrollHint();
            return;
        }

        if (isTakeawaysSheetOpen) {
            clearMobileScrollHintTimeouts();
            setIsMobileScrollHintVisible(false);
            mobileScrollHintAnchorIndexRef.current = null;
            if (!hasDismissedMobileScrollHintRef.current) {
                hasScheduledMobileScrollHintRef.current = false;
            }
            return;
        }

        if (
            mounted
            && hasInitialized
            && cards.length > 1
            && !hasDismissedMobileScrollHintRef.current
            && !hasScheduledMobileScrollHintRef.current
        ) {
            scheduleMobileScrollHint();
        }
    }, [
        activeCardIndex,
        cards.length,
        clearMobileScrollHintTimeouts,
        dismissMobileScrollHint,
        hasInitialized,
        isFocusDesktop,
        isMobileScrollHintVisible,
        isTakeawaysSheetOpen,
        mounted,
        scheduleMobileScrollHint,
    ]);

    useEffect(() => {
        return () => {
            clearDesktopScrollCueTimeout();
            clearMobileScrollHintTimeouts();
            clearGestureNavigationLockTimeout();
            clearSheetAnimationTimeouts();
            flushRestoreStateWrite();
        };
    }, [
        clearDesktopScrollCueTimeout,
        clearGestureNavigationLockTimeout,
        clearMobileScrollHintTimeouts,
        clearSheetAnimationTimeouts,
        flushRestoreStateWrite,
    ]);

    useEffect(() => {
        if (!isFocusDesktop || takeawaysSheetCard === null) {
            return;
        }

        clearSheetAnimationTimeouts();
        setTakeawaysSheetCard(null);
        setTakeawaysSheetPhase("closed");
        setSheetDragOffset(0);
        sheetTouchStartYRef.current = null;
        sheetTouchLastPointRef.current = null;
        sheetTouchVelocityRef.current = 0;
        restoreTakeawaysSheetFocus();
    }, [clearSheetAnimationTimeouts, isFocusDesktop, restoreTakeawaysSheetFocus, takeawaysSheetCard]);

    useEffect(() => {
        if (!hasInitializedRef.current || isRestoringSnapshotRef.current || !hasMore || items.length > 0 || error) {
            return;
        }

        void fetchBatch();
    }, [error, fetchBatch, hasMore, items.length]);

    useEffect(() => {
        if (!hasInitializedRef.current || loading || !hasMore || cards.length === 0) {
            return;
        }

        if (isRestoringSnapshotRef.current) {
            return;
        }

        if (cards.length - activeCardIndex <= 3) {
            void fetchBatch();
        }
    }, [activeCardIndex, cards.length, fetchBatch, hasMore, loading]);

    useEffect(() => {
        if (!hasInitialized || !isRestoringSnapshotRef.current) {
            return;
        }

        isRestoringSnapshotRef.current = false;
        if (!restorePrefetchArmedRef.current) {
            return;
        }

        restorePrefetchArmedRef.current = false;
        void fetchBatch();
    }, [fetchBatch, hasInitialized]);

    useEffect(() => {
        if (!mounted || !hasInitialized) {
            return;
        }

        scheduleRestoreStateWrite();
    }, [activeCardIndex, hasInitialized, hasMore, items, mounted, nextCursor, scheduleRestoreStateWrite]);

    useEffect(() => {
        if (!mounted) {
            return;
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                flushRestoreStateWrite();
            }
        };

        window.addEventListener("pagehide", flushRestoreStateWrite);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("pagehide", flushRestoreStateWrite);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [flushRestoreStateWrite, mounted]);

    return (
        <section className="px-4 pt-5 md:px-6 md:pt-6 md:pb-6 lg:px-10">
            <div className="mx-auto max-w-3xl">
                {!mounted || !hasInitialized || (loading && cards.length === 0) ? (
                    <LoadingState />
                ) : !loading && cards.length === 0 ? (
                    <EmptyState error={error} onRetry={retryFocusFeed} />
                ) : (
                    <div className="relative">
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
                                            isSaved={myListIdSet.has(card.id)}
                                            isFocusDesktop={isFocusDesktop}
                                            isActive={index === activeCardIndex}
                                            showDesktopScrollCue={isDesktopScrollCueVisible && index < cards.length - 1}
                                            mobileCardTargetHeight={listViewportHeight}
                                            onOpenTakeaways={openTakeawaysSheet}
                                            onToggleSave={handleToggleSave}
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
                        {!isFocusDesktop && isMobileScrollHintVisible ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-4">
                                <div
                                    data-testid="focus-navigation-cue"
                                    className="focus-scroll-cue inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/88 px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-muted-foreground shadow-sm backdrop-blur-md"
                                >
                                    <span>Swipe up for next</span>
                                    <ChevronUp className="size-3.5" aria-hidden="true" />
                                </div>
                            </div>
                        ) : null}
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
                        touchLastPointRef={sheetTouchLastPointRef}
                        touchVelocityRef={sheetTouchVelocityRef}
                        dialogRef={takeawaysSheetDialogRef}
                        closeButtonRef={takeawaysSheetCloseButtonRef}
                    />,
                    document.body
                )
                : null}
        </section>
    );
}
