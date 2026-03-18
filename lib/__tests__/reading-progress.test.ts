import { describe, expect, it } from "vitest";
import {
    clampReadingProgressPercent,
    normalizeReadingProgress,
} from "@/lib/reading-progress";

describe("reading-progress helpers", () => {
    it("normalizes stale completed ids, duplicates, and out-of-range indices", () => {
        const { progress, didChange } = normalizeReadingProgress({
            progress: {
                itemId: "old-id",
                completed: ["seg-1", "seg-2", "seg-2", "missing", 42 as never],
                lastSegmentIndex: 99,
                maxSegmentIndex: -5,
                lastReadAt: "2026-03-17T10:00:00.000Z",
                isCompleted: false,
                totalSegments: 99,
            },
            itemId: "item-1",
            totalSegments: 2,
            validSegmentIds: ["seg-1", "seg-2"],
        });

        expect(didChange).toBe(true);
        expect(progress).toEqual({
            itemId: "item-1",
            completed: ["seg-1", "seg-2"],
            lastSegmentIndex: 1,
            maxSegmentIndex: -1,
            lastReadAt: "2026-03-17T10:00:00.000Z",
            isCompleted: true,
            totalSegments: 2,
        });
    });

    it("clamps progress percentages to the 0-100 range", () => {
        expect(clampReadingProgressPercent(7, 5)).toBe(100);
        expect(clampReadingProgressPercent(-2, 5)).toBe(0);
        expect(clampReadingProgressPercent(1, 0)).toBe(0);
    });

    it("preserves legacy resume position when maxSegmentIndex is missing", () => {
        const { progress, didChange } = normalizeReadingProgress({
            progress: {
                itemId: "legacy-item",
                completed: [],
                lastSegmentIndex: 4,
                lastReadAt: "2026-03-17T10:00:00.000Z",
                isCompleted: false,
                totalSegments: 10,
            },
            itemId: "legacy-item",
            totalSegments: 6,
            validSegmentIds: ["seg-1", "seg-2", "seg-3", "seg-4", "seg-5", "seg-6"],
        });

        expect(didChange).toBe(true);
        expect(progress.lastSegmentIndex).toBe(4);
        expect(progress.maxSegmentIndex).toBe(4);
    });
});
