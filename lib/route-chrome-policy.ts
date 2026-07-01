export type MobileChromeMode = "none" | "default" | "compact";
export type MobileBottomPaddingMode = "none" | "default" | "compact";

/**
 * Shell viewport ownership contract:
 * - standalone: no public app chrome; the shell returns the route as-is.
 * - standard: document-flow app page with mobile header, bottom nav, and safe-area padding.
 * - immersive: route owns the viewport inside a 100dvh, overflow-hidden shell.
 * - reader: reader-owned document flow with mobile header and no bottom nav.
 * - preview: preview-owned document flow with mobile header and no bottom nav.
 */
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

const routeChromePolicyRules = [
    {
        name: "landing",
        pattern: "/",
        matches: (pathname: string) => pathname === "/",
        policy: landingPolicy,
    },
    {
        name: "browse",
        pattern: "/browse",
        matches: (pathname: string) => pathname === "/browse",
        policy: browsePolicy,
    },
    {
        name: "read",
        pattern: "/read/*",
        matches: (pathname: string) => pathname === "/read" || pathname.startsWith("/read/"),
        policy: readPolicy,
    },
    {
        name: "preview",
        pattern: "/preview/*",
        matches: (pathname: string) => pathname === "/preview" || pathname.startsWith("/preview/"),
        policy: previewPolicy,
    },
    {
        name: "ask",
        pattern: "/ask",
        matches: (pathname: string) => pathname === "/ask",
        policy: askPolicy,
    },
    {
        name: "focus",
        pattern: "/focus",
        matches: (pathname: string) => pathname === "/focus",
        policy: focusPolicy,
    },
] as const;

export const ROUTE_CHROME_POLICY_RULE_PATTERNS = routeChromePolicyRules.map((rule) => rule.pattern);

export const DEFAULT_ROUTE_CHROME_POLICY = standardPolicy;

export function getRouteChromePolicy(pathname: string): RouteChromePolicy {
    for (const rule of routeChromePolicyRules) {
        if (rule.matches(pathname)) {
            return rule.policy;
        }
    }

    return DEFAULT_ROUTE_CHROME_POLICY;
}
