import { describe, expect, it } from "vitest";
import { getToasterMobileOffset } from "@/lib/toaster-mobile-offset";

describe("getToasterMobileOffset", () => {
    it("clears the standard mobile bottom navigation on standard app routes", () => {
        expect(getToasterMobileOffset("/library/my-list")).toEqual({
            bottom: "calc(var(--mobile-bottom-nav-height) + max(0.75rem, var(--safe-area-bottom)) + 0.75rem)",
        });
    });

    it("clears the compact mobile bottom navigation on browse", () => {
        expect(getToasterMobileOffset("/browse")).toEqual({
            bottom: "calc(var(--mobile-bottom-nav-compact-height) + max(0.75rem, var(--safe-area-bottom)) + 0.75rem)",
        });
    });

    it.each(["/", "/ask", "/preview/example", "/read/example"])(
        "preserves Sonner's default mobile offset when %s has no bottom navigation",
        (pathname) => {
            expect(getToasterMobileOffset(pathname)).toBeUndefined();
        }
    );
});
