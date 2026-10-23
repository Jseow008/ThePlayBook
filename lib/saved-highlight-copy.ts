interface SavedHighlightCopy {
    highlighted_text: string;
    note_body: string | null;
    content_item: { title: string; author: string | null } | null;
    segment: { title: string | null } | null;
}

/** Copy persisted fields verbatim; display truncation and unfinished drafts are not inputs. */
export function buildSavedHighlightCopy(item: SavedHighlightCopy, passageHref: string | null, origin: string): string {
    const sections = [`Passage:\n${item.highlighted_text}`];

    if (item.note_body?.trim()) {
        sections.push(`My thought:\n${item.note_body}`);
    }

    const source: string[] = [];
    if (item.content_item?.title) source.push(`Source: ${item.content_item.title}`);
    if (item.content_item?.author) source.push(`Author: ${item.content_item.author}`);
    if (item.segment?.title) source.push(`Section: ${item.segment.title}`);
    if (passageHref) source.push(`Saved passage: ${new URL(passageHref, origin).href}`);
    if (source.length > 0) sections.push(source.join("\n"));

    return sections.join("\n\n");
}
