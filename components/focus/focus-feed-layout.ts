// /focus has no mobile header. The mobile vertical chrome term is focus-internal
// spacing plus the shell bottom nav and safe-area, not the compact header height.
export const FEED_LIST_VIEWPORT_CLASS =
    "h-[calc(100dvh-var(--focus-mobile-vertical-chrome)-var(--mobile-bottom-nav-height)-var(--safe-area-bottom))] md:h-[calc(100dvh-7.5rem)]";
export const FEED_CARD_HEIGHT_CLASS =
    "min-h-[calc(100dvh-var(--focus-mobile-vertical-chrome)-var(--mobile-bottom-nav-height)-var(--safe-area-bottom))] md:min-h-[calc(100dvh-7.5rem)]";
export const TAKEAWAYS_SHEET_OPEN_DURATION_MS = 240;
export const TAKEAWAYS_SHEET_CLOSE_DURATION_MS = 210;
export const TAKEAWAYS_SHEET_BACKDROP_OPEN_DURATION_MS = 200;
export const TAKEAWAYS_SHEET_ENTER_DELAY_MS = 16;

export type TakeawaysSheetPhase = "closed" | "entering" | "entered" | "exiting";
export type SheetTouchPoint = { y: number; time: number };
export type DesktopCompactLevel = 0 | 1 | 2 | 3;

const MOBILE_CARD_FIT_BUFFER_PX = 10;
const DESKTOP_VISIBLE_TAKEAWAY_COUNT = 3;
export const FOCUS_COVER_WIDTHS = {
    default: 132,
    medium: 116,
    compact: 104,
    dense: 92,
} as const;

export const DESKTOP_COMPACT_LEVELS = [0, 1, 2, 3] as const;
export const MAX_DESKTOP_COMPACT_LEVEL = 3 satisfies DesktopCompactLevel;

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

export function shouldHideMobileHook({
    availableContentHeight,
    requiredContentHeight,
}: {
    availableContentHeight: number;
    requiredContentHeight: number;
}) {
    return requiredContentHeight > availableContentHeight;
}

export function getDesktopAvailableContentHeight(viewportHeight: number) {
    return Math.max(viewportHeight - 42, 0);
}

export function getInitialDesktopCompactLevel(availableContentHeight: number): DesktopCompactLevel {
    if (availableContentHeight >= 700) {
        return 0;
    }

    if (availableContentHeight >= 620) {
        return 1;
    }

    if (availableContentHeight >= 540) {
        return 2;
    }

    return 3;
}

export function getDesktopCoverWidth({
    availableContentHeight,
    compactLevel = getInitialDesktopCompactLevel(availableContentHeight),
}: {
    availableContentHeight: number;
    compactLevel?: DesktopCompactLevel;
}) {
    if (compactLevel >= 3) {
        return FOCUS_COVER_WIDTHS.dense;
    }

    if (compactLevel >= 2) {
        return FOCUS_COVER_WIDTHS.compact;
    }

    if (compactLevel >= 1) {
        return FOCUS_COVER_WIDTHS.medium;
    }

    if (availableContentHeight >= 700) {
        return FOCUS_COVER_WIDTHS.default;
    }

    if (availableContentHeight >= 620) {
        return FOCUS_COVER_WIDTHS.medium;
    }

    return FOCUS_COVER_WIDTHS.compact;
}

export function getDesktopVisibleTakeawayCount({
    availableContentHeight,
    totalTakeaways,
    compactLevel = getInitialDesktopCompactLevel(availableContentHeight),
}: {
    availableContentHeight: number;
    totalTakeaways: number;
    compactLevel?: DesktopCompactLevel;
}) {
    if (totalTakeaways <= 0) {
        return 0;
    }

    if (compactLevel >= 3) {
        return 0;
    }

    if (compactLevel >= 2) {
        return Math.min(totalTakeaways, 1);
    }

    if (compactLevel >= 1) {
        return Math.min(totalTakeaways, 2);
    }

    if (availableContentHeight >= 700) {
        return Math.min(totalTakeaways, DESKTOP_VISIBLE_TAKEAWAY_COUNT);
    }

    if (availableContentHeight >= 620) {
        return Math.min(totalTakeaways, 2);
    }

    return Math.min(totalTakeaways, 1);
}
