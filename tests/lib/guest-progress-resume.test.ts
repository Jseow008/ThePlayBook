import { beforeEach, describe, expect, it } from "vitest";
import { combineReadingProgress, readGuestProgress } from "@/lib/guest-progress-resume";
import { progressKey } from "@/lib/local-user-storage";
import type { ReadingProgressData } from "@/hooks/useReadingProgress";

const segmentIds = ["first", "second"];

describe("guest progress on sign-in return", () => {
    beforeEach(() => {
        const data = new Map<string, string>();
        Object.defineProperty(window, "localStorage", { configurable: true, value: {
            getItem: (key: string) => data.get(key) ?? null,
            setItem: (key: string, value: string) => { data.set(key, value); },
            removeItem: (key: string) => { data.delete(key); },
            clear: () => { data.clear(); },
        } });
    });

    it("uses only current sections and merges guest completion with account progress", () => {
        localStorage.setItem(progressKey("guest", "read-1"), JSON.stringify({
            itemId: "read-1",
            completed: ["first", "second", "removed-section"],
            lastSegmentIndex: 2,
            lastReadAt: "2026-10-02T00:00:00.000Z",
            completedAt: "2026-10-02T00:00:00.000Z",
            isCompleted: true,
        }));
        const guest = readGuestProgress(localStorage, "read-1", segmentIds);
        expect(guest).toMatchObject({ completed: segmentIds, isCompleted: true, totalSegments: 2 });

        const account: ReadingProgressData = {
            itemId: "read-1",
            completed: ["first"],
            lastSegmentIndex: 0,
            lastReadAt: "2026-10-01T00:00:00.000Z",
            isCompleted: false,
            totalSegments: 2,
        };
        const merged = combineReadingProgress(guest!, account, segmentIds);
        expect(merged.completed).toEqual(segmentIds);
        expect(merged.isCompleted).toBe(true);
        expect(merged.completedAt).toBe("2026-10-02T00:00:00.000Z");
        expect(merged.lastSegmentIndex).toBe(1);
    });

    it("does not import malformed or mismatched guest records", () => {
        localStorage.setItem(progressKey("guest", "read-1"), JSON.stringify({
            itemId: "another-read",
            completed: ["first", "second"],
            lastReadAt: "2026-10-02T00:00:00.000Z",
        }));
        expect(readGuestProgress(localStorage, "read-1", segmentIds)).toBeNull();
    });

    it("preserves manually incomplete sections that stay incomplete after sign-in", () => {
        localStorage.setItem(progressKey("guest", "read-1"), JSON.stringify({
            itemId: "read-1",
            completed: ["first"],
            manuallyIncomplete: ["second", "removed-section", "first"],
            lastSegmentIndex: 1,
            lastReadAt: "2026-10-02T00:00:00.000Z",
            isCompleted: false,
        }));
        const guest = readGuestProgress(localStorage, "read-1", segmentIds);
        expect(guest?.manuallyIncomplete).toEqual(["second"]);

        const merged = combineReadingProgress(guest!, null, segmentIds);
        expect(merged.manuallyIncomplete).toEqual(["second"]);
        expect(merged.completed).toEqual(["first"]);
    });

    it("keeps account-only sections when browser progress adds a different section", () => {
        const guest: ReadingProgressData = {
            itemId: "read-1",
            completed: ["first", "third"],
            lastSegmentIndex: 2,
            lastReadAt: "2026-10-02T00:00:00.000Z",
            isCompleted: false,
        };
        const account: ReadingProgressData = {
            itemId: "read-1",
            completed: ["first", "second"],
            lastSegmentIndex: 1,
            lastReadAt: "2026-10-01T00:00:00.000Z",
            isCompleted: false,
        };
        expect(combineReadingProgress(guest, account, ["first", "second", "third"]))
            .toMatchObject({ completed: ["first", "second", "third"], isCompleted: true });
    });
});
