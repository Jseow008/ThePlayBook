import type { FocusFeedItem } from "@/types/domain";

export interface FocusCard {
    id: string;
    title: string;
    author: string | null;
    type: string;
    category: string | null;
    duration_seconds: number | null;
    hook: string;
    takeaways: string[];
}

const FALLBACK_HOOK = "Open the full summary when you want to go deeper.";

export function buildFocusCards(items: FocusFeedItem[]): FocusCard[] {
    return items.map((item) => ({
        id: item.id,
        title: item.title,
        author: item.author,
        type: item.type,
        category: item.category,
        duration_seconds: item.duration_seconds,
        hook: item.quick_mode_json.hook.trim() || FALLBACK_HOOK,
        takeaways: item.quick_mode_json.key_takeaways
            .map((takeaway) => takeaway.trim())
            .filter(Boolean)
            .slice(0, 4),
    }));
}

export function mergeUniqueFocusItems(
    existing: FocusFeedItem[],
    incoming: FocusFeedItem[]
): FocusFeedItem[] {
    const seenIds = new Set(existing.map((item) => item.id));
    const uniqueIncoming = incoming.filter((item) => {
        if (seenIds.has(item.id)) {
            return false;
        }

        seenIds.add(item.id);
        return true;
    });

    return [...existing, ...uniqueIncoming];
}
