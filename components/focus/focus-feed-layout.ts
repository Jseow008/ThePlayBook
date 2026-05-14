export const FEED_LIST_VIEWPORT_CLASS =
    "h-[calc(100dvh-3rem-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-7.5rem)]";
export const FEED_CARD_HEIGHT_CLASS =
    "min-h-[calc(100dvh-3rem-4rem-env(safe-area-inset-bottom))] md:min-h-[calc(100dvh-7.5rem)]";
export const TAKEAWAYS_SHEET_OPEN_DURATION_MS = 240;
export const TAKEAWAYS_SHEET_CLOSE_DURATION_MS = 210;
export const TAKEAWAYS_SHEET_BACKDROP_OPEN_DURATION_MS = 200;
export const TAKEAWAYS_SHEET_ENTER_DELAY_MS = 16;

export type TakeawaysSheetPhase = "closed" | "entering" | "entered" | "exiting";
export type SheetTouchPoint = { y: number; time: number };

const MOBILE_CARD_FIT_BUFFER_PX = 10;
export const MOBILE_MIN_READABLE_HOOK_HEIGHT_PX = 72;
const DESKTOP_VISIBLE_TAKEAWAY_COUNT = 3;
const DESKTOP_DEFAULT_COVER_WIDTH = 132;
const DESKTOP_MEDIUM_COVER_WIDTH = 116;
const DESKTOP_COMPACT_COVER_WIDTH = 104;

export function formatDuration(durationSeconds: number | null) {
    if (!durationSeconds) return null;
    return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

export function getMobileAvailableContentHeight({
    mobileCardTargetHeight,
    verticalPadding,
}: {
    mobileCardTargetHeight: number;
    verticalPadding: number;
}) {
    return Math.max(mobileCardTargetHeight - verticalPadding - MOBILE_CARD_FIT_BUFFER_PX, 0);
}

export function getMobileHookMaxHeight({
    availableContentHeight,
    requiredContentHeight,
    currentHookHeight,
}: {
    availableContentHeight: number;
    requiredContentHeight: number;
    currentHookHeight: number;
}) {
    if (requiredContentHeight <= availableContentHeight) {
        return null;
    }

    const nonHookContentHeight = requiredContentHeight - currentHookHeight;
    const minimumReadableHookHeight = Math.min(currentHookHeight, MOBILE_MIN_READABLE_HOOK_HEIGHT_PX);
    const unclampedHookMaxHeight = availableContentHeight - nonHookContentHeight;

    // Preserve a readable excerpt instead of collapsing the hook entirely on short mobile viewports.
    return Math.min(currentHookHeight, Math.max(minimumReadableHookHeight, unclampedHookMaxHeight));
}

export function getDesktopAvailableContentHeight(viewportHeight: number) {
    return Math.max(viewportHeight - 42, 0);
}

export function getDesktopCoverWidth({
    availableContentHeight,
}: {
    availableContentHeight: number;
}) {
    if (availableContentHeight >= 700) {
        return DESKTOP_DEFAULT_COVER_WIDTH;
    }

    if (availableContentHeight >= 620) {
        return DESKTOP_MEDIUM_COVER_WIDTH;
    }

    return DESKTOP_COMPACT_COVER_WIDTH;
}

export function getDesktopVisibleTakeawayCount({
    availableContentHeight,
    totalTakeaways,
}: {
    availableContentHeight: number;
    totalTakeaways: number;
}) {
    if (totalTakeaways <= 0) {
        return 0;
    }

    if (availableContentHeight >= 700) {
        return Math.min(totalTakeaways, DESKTOP_VISIBLE_TAKEAWAY_COUNT);
    }

    if (availableContentHeight >= 620) {
        return Math.min(totalTakeaways, 2);
    }

    return Math.min(totalTakeaways, 1);
}
