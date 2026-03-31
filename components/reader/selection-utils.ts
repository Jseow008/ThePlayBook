export function findSegmentElement(node: Node | null): HTMLElement | null {
    let current: HTMLElement | null =
        node instanceof HTMLElement ? node : node?.parentElement ?? null;

    while (current && current !== document.body) {
        if (current.hasAttribute("data-segment-id")) {
            return current;
        }
        current = current.parentElement;
    }

    return null;
}

export function getTrimmedSelection(range: Range, segmentElement: HTMLElement) {
    const rawText = range.toString();
    const trimmedText = rawText.trim();

    if (!trimmedText) {
        return null;
    }

    const leadingWhitespace = rawText.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace = rawText.match(/\s*$/)?.[0].length ?? 0;

    const prefixRange = range.cloneRange();
    prefixRange.selectNodeContents(segmentElement);
    prefixRange.setEnd(range.startContainer, range.startOffset);

    const selectionStart = prefixRange.toString().length + leadingWhitespace;
    const selectionEnd = prefixRange.toString().length + rawText.length - trailingWhitespace;

    if (selectionEnd <= selectionStart) {
        return null;
    }

    return {
        text: trimmedText,
        anchorStart: selectionStart,
        anchorEnd: selectionEnd,
    };
}
