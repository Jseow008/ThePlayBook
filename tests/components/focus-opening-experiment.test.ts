import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFocusOpeningVariant, orderFocusBatch } from "@/components/focus/focus-opening-experiment";
import type { FocusFeedItem } from "@/types/domain";

const items = ["best", "second", "third"].map((id) => ({ id })) as FocusFeedItem[];

describe("Focus opening experiment", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        const storage = new Map<string, string>();
        vi.mocked(window.localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null);
        vi.mocked(window.localStorage.setItem).mockImplementation((key, value) => { storage.set(key, value); });
    });

    it("keeps a stable browser assignment", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.9);
        expect(getFocusOpeningVariant()).toBe("ranked");
        expect(window.localStorage.getItem("focus-opening-order-v1")).toBe("ranked");
        vi.spyOn(Math, "random").mockReturnValue(0.1);
        expect(getFocusOpeningVariant()).toBe("ranked");
    });

    it("pins the selected first candidate only for a fresh ranked opening", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);
        expect(orderFocusBatch(items, "ranked", true, true)[0]?.id).toBe("best");
        expect(orderFocusBatch(items, "ranked", false, true)[0]?.id).not.toBe("best");
        expect(orderFocusBatch(items, "ranked", true, false)[0]?.id).not.toBe("best");
        expect(orderFocusBatch(items, "control", true, true)[0]?.id).not.toBe("best");
    });
});
