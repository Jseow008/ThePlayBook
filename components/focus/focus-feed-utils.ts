import type { FocusFeedItem } from "@/types/domain";

export interface FocusCard {
    id: string;
    title: string;
    author: string | null;
    type: string;
    category: string | null;
    duration_seconds: number | null;
    hook: string;
    mobileTakeawayLimit: 2 | 3 | 4;
    totalTakeaways: number;
    takeaways: string[];
}

const FALLBACK_HOOK = "Open the full summary when you want to go deeper.";

function getAverageTakeawayLength(takeaways: string[]) {
    const sampledTakeaways = takeaways.slice(0, 4);
    if (sampledTakeaways.length === 0) {
        return 0;
    }

    const totalLength = sampledTakeaways.reduce((sum, takeaway) => sum + takeaway.length, 0);
    return totalLength / sampledTakeaways.length;
}

function getMobileTakeawayLimit(title: string, hook: string, takeaways: string[]): 2 | 3 | 4 {
    let limit = 4;

    if (title.length > 55) {
        limit -= 1;
    }

    if (hook.length > 140) {
        limit -= 1;
    }

    if (getAverageTakeawayLength(takeaways) > 90) {
        limit -= 1;
    }

    return Math.max(2, Math.min(4, limit)) as 2 | 3 | 4;
}

export function buildFocusCards(items: FocusFeedItem[]): FocusCard[] {
    return items.map((item) => {
        const filteredTakeaways = item.quick_mode_json.key_takeaways
            .map((takeaway) => takeaway.trim())
            .filter(Boolean);
        const hook = item.quick_mode_json.hook.trim() || FALLBACK_HOOK;

        return {
            id: item.id,
            title: item.title,
            author: item.author,
            type: item.type,
            category: item.category,
            duration_seconds: item.duration_seconds,
            hook,
            mobileTakeawayLimit: getMobileTakeawayLimit(item.title, hook, filteredTakeaways),
            totalTakeaways: filteredTakeaways.length,
            takeaways: filteredTakeaways,
        };
    });
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
