import { describe, expect, it } from "vitest";
import {
    buildCanonicalReadPath,
    buildReadPath,
    getLegacyReadIdFromPathname,
    isCanonicalReadSlug,
    slugifyContentTitle,
} from "@/lib/content-paths";

describe("content paths", () => {
    it("builds stable canonical read paths from an id and title", () => {
        expect(buildReadPath({
            id: "item-1",
            title: "Deep Work: Rules for Focused Success",
        })).toBe("/read/item-1/deep-work-rules-for-focused-success");
    });

    it("normalizes punctuation, diacritics, and empty titles", () => {
        expect(slugifyContentTitle("Café & Strategy!!!")).toBe("cafe-and-strategy");
        expect(buildCanonicalReadPath("item-2", "!!!")).toBe("/read/item-2/read");
    });

    it("validates optional catch-all slug segments exactly", () => {
        expect(isCanonicalReadSlug(["deep-work"], "Deep Work")).toBe(true);
        expect(isCanonicalReadSlug(undefined, "Deep Work")).toBe(false);
        expect(isCanonicalReadSlug(["deep-work", "extra"], "Deep Work")).toBe(false);
        expect(isCanonicalReadSlug(["wrong"], "Deep Work")).toBe(false);
    });

    it("detects only legacy two-segment read paths", () => {
        expect(getLegacyReadIdFromPathname("/read/item-1")).toBe("item-1");
        expect(getLegacyReadIdFromPathname("/read/item%201")).toBe("item 1");
        expect(getLegacyReadIdFromPathname("/read/item-1/deep-work")).toBeNull();
        expect(getLegacyReadIdFromPathname("/preview/item-1")).toBeNull();
    });
});
