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
                totalTakeaways: 8,
                takeaways: baseItem.quick_mode_json.key_takeaways.slice(0, 7),
            })
        );
        expect(cards[0]).not.toHaveProperty("bigIdea");
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
