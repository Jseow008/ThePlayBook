import { getRouteChromePolicy } from "@/lib/route-chrome-policy";

const MOBILE_TOAST_NAV_GAP = "0.75rem";

const mobileBottomOffsetByNavMode = {
    default: `calc(var(--mobile-bottom-nav-height) + max(${MOBILE_TOAST_NAV_GAP}, var(--safe-area-bottom)) + ${MOBILE_TOAST_NAV_GAP})`,
    compact: `calc(var(--mobile-bottom-nav-compact-height) + max(${MOBILE_TOAST_NAV_GAP}, var(--safe-area-bottom)) + ${MOBILE_TOAST_NAV_GAP})`,
} as const;

/**
 * Returns the mobile toast clearance required by the route's fixed bottom
 * navigation. Routes without that navigation retain Sonner's normal offset.
 */
export function getToasterMobileOffset(pathname: string): { bottom: string } | undefined {
    const { mobileBottomNav } = getRouteChromePolicy(pathname);

    if (mobileBottomNav === "none") {
        return undefined;
    }

    return { bottom: mobileBottomOffsetByNavMode[mobileBottomNav] };
}
