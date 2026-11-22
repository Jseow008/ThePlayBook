// Use DOM text offsets so a phrase can span inline emphasis or a saved highlight.
export function findSearchPassageRange(body: HTMLElement, phrase: string): Range | null {
    if (!phrase) return null;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let text = "";
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        nodes.push(node);
        text += node.data;
    }
    const start = text.indexOf(phrase);
    if (start < 0) return null;
    const end = start + phrase.length;
    const range = document.createRange();
    let offset = 0;
    for (const node of nodes) {
        const next = offset + node.length;
        if (offset <= start && start < next) range.setStart(node, start - offset);
        if (offset < end && end <= next) {
            range.setEnd(node, end - offset);
            return range;
        }
        offset = next;
    }
    return null;
}
