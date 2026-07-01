import { BREAKPOINTS, MEDIA_QUERIES, VIEWPORT_QUERIES } from "@/lib/breakpoints";

describe("breakpoints", () => {
    it("defines the shared Tailwind-aligned breakpoint values", () => {
        expect(BREAKPOINTS).toEqual({
            sm: 640,
            md: 768,
            lg: 1024,
        });
    });

    it("builds exact media query strings", () => {
        expect(MEDIA_QUERIES).toEqual({
            smUp: "(min-width: 640px)",
            mdUp: "(min-width: 768px)",
            lgUp: "(min-width: 1024px)",
            belowSm: "(max-width: 639px)",
            belowMd: "(max-width: 767px)",
            belowLg: "(max-width: 1023px)",
        });
    });

    it("maps semantic viewport queries to their intended thresholds", () => {
        expect(VIEWPORT_QUERIES.contentDesktop).toBe(MEDIA_QUERIES.mdUp);
        expect(VIEWPORT_QUERIES.focusDesktop).toBe(MEDIA_QUERIES.mdUp);
        expect(VIEWPORT_QUERIES.readerInteractionDesktop).toBe(MEDIA_QUERIES.smUp);
        expect(VIEWPORT_QUERIES.compactReaderControls).toBe(MEDIA_QUERIES.belowSm);
        expect(VIEWPORT_QUERIES.askFullLayout).toBe(MEDIA_QUERIES.lgUp);
        expect(VIEWPORT_QUERIES.appDesktopChrome).toBe(MEDIA_QUERIES.lgUp);
        expect(VIEWPORT_QUERIES.notesAskSidebarAvailable).toBe(MEDIA_QUERIES.lgUp);
        expect(VIEWPORT_QUERIES.landingMobileMotion).toBe(MEDIA_QUERIES.belowMd);
    });
});
