import { describe, expect, it } from "vitest";
import {
    DEFAULT_ROUTE_CHROME_POLICY,
    ROUTE_CHROME_POLICY_RULE_PATTERNS,
    getRouteChromePolicy,
} from "@/lib/route-chrome-policy";

describe("getRouteChromePolicy", () => {
    it("exports the documented special policy patterns", () => {
        expect(ROUTE_CHROME_POLICY_RULE_PATTERNS).toEqual([
            "/",
            "/browse",
            "/read/*",
            "/preview/*",
            "/ask",
            "/focus",
        ]);
    });

    it("returns standalone chrome policy for the landing page", () => {
        expect(getRouteChromePolicy("/")).toEqual({
            mobileHeader: "none",
            mobileBottomNav: "none",
            mobileBottomPadding: "none",
            desktopSidebarPadding: false,
            viewportMode: "standalone",
        });
    });

    it("returns compact mobile chrome for browse", () => {
        expect(getRouteChromePolicy("/browse")).toEqual({
            mobileHeader: "compact",
            mobileBottomNav: "compact",
            mobileBottomPadding: "compact",
            desktopSidebarPadding: true,
            viewportMode: "standard",
        });
    });

    it("keeps the mobile header and removes bottom nav for read routes", () => {
        expect(getRouteChromePolicy("/read/test-item")).toEqual({
            mobileHeader: "default",
            mobileBottomNav: "none",
            mobileBottomPadding: "none",
            desktopSidebarPadding: true,
            viewportMode: "reader",
        });
    });

    it("keeps the mobile header and removes bottom nav for preview routes", () => {
        expect(getRouteChromePolicy("/preview/test-item")).toEqual({
            mobileHeader: "default",
            mobileBottomNav: "none",
            mobileBottomPadding: "none",
            desktopSidebarPadding: true,
            viewportMode: "preview",
        });
    });

    it("returns immersive no-chrome policy for ask", () => {
        expect(getRouteChromePolicy("/ask")).toEqual({
            mobileHeader: "none",
            mobileBottomNav: "none",
            mobileBottomPadding: "none",
            desktopSidebarPadding: true,
            viewportMode: "immersive",
        });
    });

    it("returns immersive bottom-nav policy for focus", () => {
        expect(getRouteChromePolicy("/focus")).toEqual({
            mobileHeader: "none",
            mobileBottomNav: "default",
            mobileBottomPadding: "none",
            desktopSidebarPadding: true,
            viewportMode: "immersive",
        });
    });

    it("returns standard chrome for default app routes", () => {
        expect(getRouteChromePolicy("/requests")).toEqual({
            mobileHeader: "default",
            mobileBottomNav: "default",
            mobileBottomPadding: "default",
            desktopSidebarPadding: true,
            viewportMode: "standard",
        });
    });

    it("returns standard chrome for notes", () => {
        expect(getRouteChromePolicy("/notes")).toEqual({
            mobileHeader: "default",
            mobileBottomNav: "default",
            mobileBottomPadding: "default",
            desktopSidebarPadding: true,
            viewportMode: "standard",
        });
    });

    it.each([
        "/about",
        "/library/completed",
        "/library/my-list",
        "/library/reading",
        "/privacy",
        "/profile",
        "/requests",
        "/search",
        "/series/test-series",
        "/settings",
        "/terms",
    ])("returns default standard chrome for %s", (pathname) => {
        expect(getRouteChromePolicy(pathname)).toEqual(DEFAULT_ROUTE_CHROME_POLICY);
    });
});
