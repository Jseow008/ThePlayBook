import { describe, expect, it } from "vitest";
import { buildFocusCards, mergeUniqueFocusItems } from "@/components/focus/focus-feed-utils";
import type { FocusFeedItem } from "@/types/domain";

const baseItem: FocusFeedItem = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    title: "Deep Work",
    type: "book",
    author: "Cal Newport",
    category: "Productivity",
    cover_image_url: "https://example.com/deep-work.jpg",
    duration_seconds: 1200,
    quick_mode_json: {
        hook: "Work with more intensity.",
        big_idea: "Protect your attention to produce better output.",
        key_takeaways: [
            "Schedule focus blocks",
            "Reduce context switching",
            "Measure your output",
            "Protect deep work time",
            "Minimize shallow tasks",
            "Track when your energy peaks",
            "Use rituals to start faster",
            "Guard your shutdown routine",
        ],
    },
};

describe("focus-feed-utils", () => {
    it("builds one normalized focus card per title", () => {
        const cards = buildFocusCards([baseItem]);

        expect(cards).toHaveLength(1);
        expect(cards[0]).toEqual(
            expect.objectContaining({
                id: baseItem.id,
                hook: baseItem.quick_mode_json.hook,
                mobileTakeawayLimit: 4,
                totalTakeaways: 8,
                takeaways: baseItem.quick_mode_json.key_takeaways,
            })
        );
        expect(cards[0]).not.toHaveProperty("bigIdea");
    });

    it("derives a denser mobile takeaway limit for long titles, hooks, and takeaways", () => {
        const denseItem: FocusFeedItem = {
            ...baseItem,
            id: "123e4567-e89b-12d3-a456-426614174002",
            title: "A Very Long Title About Systems Thinking That Pushes the Mobile Layout Hard",
            quick_mode_json: {
                ...baseItem.quick_mode_json,
                hook: "This is a deliberately long hook that explains a dense concept in enough detail to cross the threshold and force the mobile layout to reserve more room for the opening summary before the list begins.",
                key_takeaways: [
                    "This takeaway is intentionally verbose so the average length of the first few items crosses the heuristic threshold and pushes the mobile card toward a denser presentation that should clamp at two visible rows.",
                    "A second intentionally long takeaway keeps the average high and mimics the kind of content that would obviously consume much more vertical space on a mobile card than the current lightweight examples.",
                    "A third long takeaway maintains that pressure and ensures the test is not sensitive to one unusually short item sneaking into the sample window used by the heuristic.",
                    "A fourth long takeaway closes the loop by keeping the first four items consistently dense, which is exactly the scenario the mobile limit calculation is supposed to treat conservatively.",
                ],
            },
        };

        const cards = buildFocusCards([denseItem]);

        expect(cards[0]?.mobileTakeawayLimit).toBe(2);
        expect(cards[0]?.takeaways).toHaveLength(4);
    });

    it("derives a medium mobile takeaway limit when only one density threshold is crossed", () => {
        const mediumItem: FocusFeedItem = {
            ...baseItem,
            id: "123e4567-e89b-12d3-a456-426614174003",
            title: "A Title Long Enough To Cross The Heuristic Threshold For Mobile",
            quick_mode_json: {
                ...baseItem.quick_mode_json,
                hook: "Short hook.",
                key_takeaways: [
                    "Keep sessions focused",
                    "Stack small wins",
                    "Protect creative energy",
                    "Review progress weekly",
                ],
            },
        };

        const cards = buildFocusCards([mediumItem]);

        expect(cards[0]?.mobileTakeawayLimit).toBe(3);
    });

    it("deduplicates incoming items when merging feed batches", () => {
        const anotherItem: FocusFeedItem = {
            ...baseItem,
            id: "123e4567-e89b-12d3-a456-426614174001",
            title: "Atomic Habits",
        };

        const merged = mergeUniqueFocusItems([baseItem], [baseItem, anotherItem]);

        expect(merged).toEqual([baseItem, anotherItem]);
    });
});
