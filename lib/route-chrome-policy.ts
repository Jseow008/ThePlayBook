export type MobileChromeMode = "none" | "default" | "compact";
export type MobileBottomPaddingMode = "none" | "default" | "compact";
export type ViewportMode = "standalone" | "standard" | "immersive" | "reader" | "preview";

export interface RouteChromePolicy {
    mobileHeader: MobileChromeMode;
    mobileBottomNav: MobileChromeMode;
    mobileBottomPadding: MobileBottomPaddingMode;
    desktopSidebarPadding: boolean;
    viewportMode: ViewportMode;
}

const landingPolicy = {
    mobileHeader: "none",
    mobileBottomNav: "none",
    mobileBottomPadding: "none",
    desktopSidebarPadding: false,
    viewportMode: "standalone",
} satisfies RouteChromePolicy;

const browsePolicy = {
    mobileHeader: "compact",
    mobileBottomNav: "compact",
    mobileBottomPadding: "compact",
    desktopSidebarPadding: true,
    viewportMode: "standard",
} satisfies RouteChromePolicy;

const readPolicy = {
    mobileHeader: "default",
    mobileBottomNav: "none",
    mobileBottomPadding: "none",
    desktopSidebarPadding: true,
    viewportMode: "reader",
} satisfies RouteChromePolicy;

const previewPolicy = {
    mobileHeader: "default",
    mobileBottomNav: "none",
    mobileBottomPadding: "none",
    desktopSidebarPadding: true,
    viewportMode: "preview",
} satisfies RouteChromePolicy;

const askPolicy = {
    mobileHeader: "none",
    mobileBottomNav: "none",
    mobileBottomPadding: "none",
    desktopSidebarPadding: true,
    viewportMode: "immersive",
} satisfies RouteChromePolicy;

const focusPolicy = {
    mobileHeader: "none",
    mobileBottomNav: "default",
    mobileBottomPadding: "none",
    desktopSidebarPadding: true,
    viewportMode: "immersive",
} satisfies RouteChromePolicy;

const standardPolicy = {
    mobileHeader: "default",
    mobileBottomNav: "default",
    mobileBottomPadding: "default",
    desktopSidebarPadding: true,
    viewportMode: "standard",
} satisfies RouteChromePolicy;

export function getRouteChromePolicy(pathname: string): RouteChromePolicy {
    if (pathname === "/") return landingPolicy;
    if (pathname === "/browse") return browsePolicy;
    if (pathname.startsWith("/read")) return readPolicy;
    if (pathname.startsWith("/preview")) return previewPolicy;
    if (pathname === "/ask") return askPolicy;
    if (pathname === "/focus") return focusPolicy;

    return standardPolicy;
}
