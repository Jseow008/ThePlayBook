import { describe, expect, it } from "vitest";
import {
    buildCanonicalCategoryStats,
    CANONICAL_CONTENT_CATEGORIES,
    getCanonicalContentCategory,
    getContentCategoryRawValues,
} from "../content-categories";

describe("approved content categories", () => {
    it("keeps Christianity and Religion & Spirituality separate across labels and counts", () => {
        expect(CANONICAL_CONTENT_CATEGORIES).toHaveLength(19);
        expect(getCanonicalContentCategory("Christian")).toBe("Christianity");
        expect(getCanonicalContentCategory("Religion & Spirituality")).toBe("Religion & Spirituality");
        expect(getContentCategoryRawValues("Christianity")).toEqual(["Christianity", "Christian"]);
        expect(getContentCategoryRawValues("Religion & Spirituality")).toEqual(["Religion & Spirituality"]);
        expect(buildCanonicalCategoryStats([
            { category: "Christianity", count: 20 },
            { category: "Christian", count: 1 },
            { category: "Religion & Spirituality", count: 3 },
        ])).toEqual([
            { category: "Christianity", count: 21, rawValues: ["Christian", "Christianity"] },
            { category: "Religion & Spirituality", count: 3, rawValues: ["Religion & Spirituality"] },
        ]);
    });
});
