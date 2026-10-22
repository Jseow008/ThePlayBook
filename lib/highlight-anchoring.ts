interface SavedHighlightAnchor {
    highlighted_text: string;
    anchor_start: number | null;
    anchor_end: number | null;
}

/** Resolve against the original section's canonical text, without changing the saved record. */
export function resolveHighlightAnchor(
    sectionText: string,
    highlight: SavedHighlightAnchor
): { start: number; end: number } | null {
    const { highlighted_text: quote, anchor_start: start, anchor_end: end } = highlight;
    if (quote.trim().length === 0) return null;

    // Matching positions identify the original occurrence even if the quote repeats.
    if (typeof start === "number" && typeof end === "number"
        && Number.isSafeInteger(start) && Number.isSafeInteger(end)
        && start >= 0 && end > start && end <= sectionText.length
        && sectionText.slice(start, end) === quote) {
        return { start, end };
    }

    const match = sectionText.indexOf(quote);
    if (match === -1 || sectionText.indexOf(quote, match + 1) !== -1) return null;
    return { start: match, end: match + quote.length };
}
