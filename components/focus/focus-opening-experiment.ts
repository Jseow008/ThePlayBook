import type { FocusFeedItem } from "@/types/domain";

export type FocusOpeningVariant = "control" | "ranked";
export type FocusSelectionSource = "personalized" | "discovery";

const ASSIGNMENT_KEY = "focus-opening-order-v1";

export function getFocusOpeningVariant(): FocusOpeningVariant {
    try {
        const existing = window.localStorage.getItem(ASSIGNMENT_KEY);
        if (existing === "control" || existing === "ranked") return existing;

        const assigned: FocusOpeningVariant = Math.random() < 0.5 ? "control" : "ranked";
        window.localStorage.setItem(ASSIGNMENT_KEY, assigned);
        return assigned;
    } catch {
        // Storage-restricted browsers keep the current behavior.
        return "control";
    }
}

export function orderFocusBatch(
    items: FocusFeedItem[],
    variant: FocusOpeningVariant,
    isFreshOpening: boolean,
    hasRankedSelection: boolean,
): FocusFeedItem[] {
    const shuffled = [...items];
    const fixedFirst = variant === "ranked" && isFreshOpening && hasRankedSelection
        ? shuffled.shift()
        : undefined;

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }

    return fixedFirst ? [fixedFirst, ...shuffled] : shuffled;
}
