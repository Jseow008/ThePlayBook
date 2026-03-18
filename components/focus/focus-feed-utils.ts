import { QuickModeSchema, type FocusFeedItem } from "@/types/domain";

export interface FocusCard {
    id: string;
    title: string;
    author: string | null;
    type: string;
    category: string | null;
    duration_seconds: number | null;
    hook: string;
    totalTakeaways: number;
    takeaways: string[];
}

const FALLBACK_HOOK = "Open the full summary when you want to go deeper.";

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
