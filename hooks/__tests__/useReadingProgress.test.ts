// @vitest-environment jsdom
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReadingProgress, type ReadingProgressData } from "../useReadingProgress";
import {
    GUEST_STORAGE_SCOPE,
    getStorageScope,
    myListKey,
    progressKey,
} from "@/lib/local-user-storage";

let authStateChangeHandler: ((event: string, session: { user: { id: string } | null } | null) => void) | null = null;
let currentAuthUser: { id: string } | null = null;
let currentCloudRows: Array<{
    content_id: string;
    is_bookmarked: boolean;
    progress: ReadingProgressData | null;
    last_interacted_at: string;
}> = [];
const upsertMock = vi.fn();
const deleteMatchMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            onAuthStateChange: vi.fn((callback: (event: string, session: { user: { id: string } | null } | null) => void) => {
                authStateChangeHandler = callback;
                return {
                    data: {
                        subscription: {
                            unsubscribe: vi.fn(),
                        },
                    },
                };
            }),
            getUser: vi.fn(() => Promise.resolve({ data: { user: currentAuthUser }, error: null })),
        },
        from: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: currentCloudRows, error: null })),
            upsert: upsertMock,
            delete: vi.fn(() => ({
                match: deleteMatchMock,
            })),
        })),
    }),
}));

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

Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
});

describe("useReadingProgress", () => {
    beforeEach(() => {
        authStateChangeHandler = null;
        currentAuthUser = null;
        currentCloudRows = [];
        window.localStorage.clear();
        upsertMock.mockResolvedValue({ error: null });
        deleteMatchMock.mockResolvedValue({ error: null });
        vi.clearAllMocks();
    });

    it("migrates legacy guest storage into scoped guest keys", async () => {
        const legacyProgressKey = "flux_progress_item-1";
        const legacyMyListKey = "flux_mylist";

        localStorage.setItem(legacyProgressKey, JSON.stringify({
            itemId: "item-1",
            completed: ["seg-1"],
            lastSegmentIndex: 0,
            lastReadAt: new Date().toISOString(),
            isCompleted: false,
        }));
        localStorage.setItem(legacyMyListKey, JSON.stringify(["item-3"]));

        const { result } = renderHook(() => useReadingProgress());

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        expect(result.current.storageScope).toBe(GUEST_STORAGE_SCOPE);
        expect(result.current.inProgressIds).toEqual(["item-1"]);
        expect(result.current.myListIds).toEqual(["item-3"]);
        expect(localStorage.getItem(legacyProgressKey)).toBeNull();
        expect(localStorage.getItem(legacyMyListKey)).toBeNull();
        expect(localStorage.getItem(progressKey(GUEST_STORAGE_SCOPE, "item-1"))).not.toBeNull();
        expect(localStorage.getItem(myListKey(GUEST_STORAGE_SCOPE))).toBe(JSON.stringify(["item-3"]));
    });

    it("saves new guest reading progress under the scoped guest key", async () => {
        const { result } = renderHook(() => useReadingProgress());

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

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

        const localData = localStorage.getItem(progressKey(GUEST_STORAGE_SCOPE, "item-4"));
        expect(localData).toBeDefined();
        expect(JSON.parse(localData!).completed).toContain("seg-x");
    });

    it("imports guest data into the first signed-in account and clears guest storage", async () => {
        const guestProgress = {
            itemId: "item-10",
            completed: ["seg-1"],
            lastSegmentIndex: 0,
            lastReadAt: new Date().toISOString(),
            isCompleted: false,
        } satisfies ReadingProgressData;

        localStorage.setItem(progressKey(GUEST_STORAGE_SCOPE, "item-10"), JSON.stringify(guestProgress));
        localStorage.setItem(myListKey(GUEST_STORAGE_SCOPE), JSON.stringify(["item-11"]));

        const { result } = renderHook(() => useReadingProgress());
        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        currentAuthUser = { id: "user-a" };
        currentCloudRows = [];

        await act(async () => {
            authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser });
        });

        await waitFor(() => expect(result.current.storageScope).toBe(getStorageScope("user-a")));

        expect(result.current.inProgressIds).toEqual(["item-10"]);
        expect(result.current.myListIds).toEqual(["item-11"]);
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-10"))).not.toBeNull();
        expect(localStorage.getItem(myListKey(getStorageScope("user-a")))).toBe(JSON.stringify(["item-11"]));
        expect(localStorage.getItem(progressKey(GUEST_STORAGE_SCOPE, "item-10"))).toBeNull();
        expect(localStorage.getItem(myListKey(GUEST_STORAGE_SCOPE))).toBeNull();
        expect(upsertMock).toHaveBeenCalled();
    });

    it("does not leak account A local data into account B on the same device", async () => {
        const { result } = renderHook(() => useReadingProgress());
        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        currentAuthUser = { id: "user-a" };
        currentCloudRows = [];
        await act(async () => {
            authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser });
        });

        await waitFor(() => expect(result.current.storageScope).toBe(getStorageScope("user-a")));

        act(() => {
            result.current.saveReadingProgress("item-21", {
                itemId: "item-21",
                completed: ["seg-a"],
                lastSegmentIndex: 0,
                lastReadAt: new Date().toISOString(),
                isCompleted: false,
            });
            result.current.toggleMyList("item-22");
        });

        currentAuthUser = { id: "user-b" };
        currentCloudRows = [];

        await act(async () => {
            authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser });
        });

        await waitFor(() => expect(result.current.storageScope).toBe(getStorageScope("user-b")));

        expect(result.current.inProgressIds).toEqual([]);
        expect(result.current.myListIds).toEqual([]);
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-21"))).not.toBeNull();
        expect(localStorage.getItem(myListKey(getStorageScope("user-a")))).toBe(JSON.stringify(["item-22"]));
        expect(localStorage.getItem(progressKey(getStorageScope("user-b"), "item-21"))).toBeNull();
        expect(localStorage.getItem(myListKey(getStorageScope("user-b")))).toBe(JSON.stringify([]));
    });
});
