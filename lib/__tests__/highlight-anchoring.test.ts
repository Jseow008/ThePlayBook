import { describe, expect, it } from "vitest";
import { resolveHighlightAnchor } from "../highlight-anchoring";

describe("highlight anchor integrity", () => {
    it("does not accept truncated ranges as valid positions when wording repeats", () => {
        expect(resolveHighlightAnchor("Alpha Alpha", {
            highlighted_text: "Alpha", anchor_start: 6, anchor_end: 99,
        })).toBeNull();
    });

    it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("does not treat invalid start %s as a valid repeated occurrence", (start) => {
        expect(resolveHighlightAnchor("Alpha Alpha", {
            highlighted_text: "Alpha", anchor_start: start, anchor_end: 5,
        })).toBeNull();
    });

    it("counts overlapping occurrences as ambiguous during recovery", () => {
        expect(resolveHighlightAnchor("aaa", {
            highlighted_text: "aa", anchor_start: null, anchor_end: null,
        })).toBeNull();
    });

    it("does not use case-insensitive or whitespace-normalized guesses", () => {
        expect(resolveHighlightAnchor("Alpha beta", {
            highlighted_text: "alpha beta", anchor_start: 0, anchor_end: 10,
        })).toBeNull();
        expect(resolveHighlightAnchor("Alpha  beta", {
            highlighted_text: "Alpha beta", anchor_start: 0, anchor_end: 10,
        })).toBeNull();
    });

    it.each(["", "  "])("rejects empty quotation %j", (quote) => {
        expect(resolveHighlightAnchor("Alpha", {
            highlighted_text: quote, anchor_start: null, anchor_end: null,
        })).toBeNull();
    });
});
