import { QuickModeSchema, type FocusFeedItem } from "@/types/domain";

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

function normalizeQuickMode(quickMode: unknown) {
    const parsedQuickMode = QuickModeSchema.safeParse(quickMode);
    if (!parsedQuickMode.success) {
        return {
            hook: FALLBACK_HOOK,
            takeaways: [] as string[],
        };
    }

    const hook = parsedQuickMode.data.hook.trim() || FALLBACK_HOOK;
    const takeaways = parsedQuickMode.data.key_takeaways
        .map((takeaway) => takeaway.trim())
        .filter(Boolean);

    return {
        hook,
        takeaways,
    };
}

export function buildFocusCards(items: FocusFeedItem[]): FocusCard[] {
    return items.map((item) => {
        const { hook, takeaways } = normalizeQuickMode(item.quick_mode_json);

        return {
            id: item.id,
            title: item.title,
            author: item.author,
            type: item.type,
            category: item.category,
            duration_seconds: item.duration_seconds,
            hook,
            mobileTakeawayLimit: getMobileTakeawayLimit(item.title, hook, takeaways),
            totalTakeaways: takeaways.length,
            takeaways,
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
