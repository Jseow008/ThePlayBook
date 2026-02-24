// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useReadingProgress } from "../useReadingProgress";
// Mock Supabase client
vi.mock("@/lib/supabase/client", () => {
    const mockAuth = {
        onAuthStateChange: vi.fn(() => ({
            data: {
                subscription: {
                    unsubscribe: vi.fn(),
                },
            },
        })),
    };
    const mockSupabase = {
        auth: mockAuth,
        from: vi.fn(),
    };
    return {
        createClient: () => mockSupabase,
    };
});

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        get length() {
            return Object.keys(store).length;
        },
        key: vi.fn((index: number) => Object.keys(store)[index] || null),
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

describe("useReadingProgress", () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    it("loads empty progress from localStorage by default", () => {
        const { result } = renderHook(() => useReadingProgress());

        expect(result.current.inProgressIds).toEqual([]);
        expect(result.current.completedIds).toEqual([]);
        expect(result.current.myListIds).toEqual([]);
        expect(result.current.isLoaded).toBe(true);
    });

    it("loads existing progress from localStorage", () => {
        // Setup local storage directly
        const time1 = new Date(Date.now() - 1000).toISOString();
        const time2 = new Date(Date.now() - 5000).toISOString();

        localStorage.setItem("flux_progress_item-1", JSON.stringify({
            itemId: "item-1",
            completed: ["seg-1"],
            lastReadAt: time1,
            isCompleted: false,
        }));

        localStorage.setItem("flux_progress_item-2", JSON.stringify({
            itemId: "item-2",
            completed: ["seg-1", "seg-2"],
            lastReadAt: time2,
            isCompleted: true,
        }));

        localStorage.setItem("flux_mylist", JSON.stringify(["item-3"]));

        const { result } = renderHook(() => useReadingProgress());

        expect(result.current.inProgressIds).toEqual(["item-1"]);
        expect(result.current.completedIds).toEqual(["item-2"]);
        expect(result.current.myListIds).toEqual(["item-3"]);
        expect(result.current.isLoaded).toBe(true);
    });

    it("saves new reading progress and updates state", () => {
        const { result } = renderHook(() => useReadingProgress());

        act(() => {
            result.current.saveReadingProgress("item-4", {
                itemId: "item-4",
                completed: ["seg-x"],
                lastSegmentIndex: 0,
                lastReadAt: new Date().toISOString(),
                isCompleted: false,
            });
        });

        expect(result.current.inProgressIds).toContain("item-4");
        expect(result.current.getProgress("item-4")).toBeDefined();

        // Check localStorage string
        const localData = localStorage.getItem("flux_progress_item-4");
        expect(localData).toBeDefined();
        expect(JSON.parse(localData!).completed).toContain("seg-x");
    });

    it("toggles items in My List correctly", () => {
        const { result } = renderHook(() => useReadingProgress());

        act(() => {
            result.current.toggleMyList("item-10");
        });

        expect(result.current.myListIds).toContain("item-10");
        expect(result.current.isInMyList("item-10")).toBe(true);
        expect(JSON.parse(localStorage.getItem("flux_mylist") || "[]")).toContain("item-10");

        act(() => {
            result.current.toggleMyList("item-10");
        });

        expect(result.current.myListIds).not.toContain("item-10");
        expect(result.current.isInMyList("item-10")).toBe(false);
    });
});
