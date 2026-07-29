import { describe, expect, it } from "vitest";
import { classifyHighlightRange } from "@/lib/highlight-ranges";

describe("classifyHighlightRange", () => {
    it.each([
        [{ start: 10, end: 20 }, { start: 10, end: 20 }, "exact"],
        [{ start: 10, end: 20 }, { start: 12, end: 18 }, "contained"],
        [{ start: 12, end: 18 }, { start: 10, end: 20 }, "contains"],
        [{ start: 10, end: 20 }, { start: 15, end: 25 }, "partial-overlap"],
        [{ start: 10, end: 20 }, { start: 20, end: 25 }, "distinct"],
        [{ start: 10, end: 20 }, { start: 0, end: 10 }, "distinct"],
        [{ start: 10, end: 20 }, { start: 30, end: 35 }, "distinct"],
    ] as const)("classifies %o against %o as %s", (existing, candidate, expected) => {
        expect(classifyHighlightRange(existing, candidate)).toBe(expected);
    });
});
