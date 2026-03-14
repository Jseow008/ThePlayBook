// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    ReadingProgressProvider,
    useReadingProgress,
    type ReadingProgressData,
} from "../useReadingProgress";
import {
    GUEST_STORAGE_SCOPE,
    getStorageScope,
    myListKey,
    progressKey,
} from "@/lib/local-user-storage";

let authStateChangeHandler: ((event: string, session: { user: { id: string } | null } | null) => void) | null = null;
let currentAuthUser: { id: string } | null = null;
let currentAuthError: { code?: string; message?: string; name?: string } | null = null;
let currentCloudRows: Array<{
    user_id?: string;
    content_id: string;
    is_bookmarked: boolean;
    progress: ReadingProgressData | null;
    last_interacted_at: string;
}> = [];
const upsertMock = vi.fn();
const deleteMatchMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();

const userLibraryTable = {
    select: selectMock,
    upsert: upsertMock,
    delete: vi.fn(() => ({
        match: deleteMatchMock,
    })),
};

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
            getUser: vi.fn(() => Promise.resolve({ data: { user: currentAuthUser }, error: currentAuthError })),
        },
        from: vi.fn(() => userLibraryTable),
    }),
}));

selectMock.mockImplementation(() => ({
    eq: eqMock,
}));

eqMock.mockImplementation((column: string, value: string) => Promise.resolve({
    data: column === "user_id"
        ? currentCloudRows.filter((row) => row.user_id === undefined || row.user_id === value)
        : currentCloudRows,
    error: null,
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

function wrapper({ children }: { children: ReactNode }) {
    return createElement(ReadingProgressProvider, null, children);
}

describe("useReadingProgress", () => {
    beforeEach(() => {
        authStateChangeHandler = null;
        currentAuthUser = null;
        currentAuthError = null;
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

        const { result } = renderHook(() => useReadingProgress(), { wrapper });

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
        const { result } = renderHook(() => useReadingProgress(), { wrapper });

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

    it("treats missing-session bootstrap as a guest flow without logging an error", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        currentAuthError = {
            code: "session_not_found",
            message: "Auth session missing!",
            name: "AuthSessionMissingError",
        };

        const { result } = renderHook(() => useReadingProgress(), { wrapper });

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        expect(result.current.storageScope).toBe(GUEST_STORAGE_SCOPE);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
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

        const { result } = renderHook(() => useReadingProgress(), { wrapper });
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
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
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

    it("keeps logging unexpected auth bootstrap errors", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        currentAuthError = {
            message: "Network failure",
            name: "AuthRetryableFetchError",
        };

        const { result } = renderHook(() => useReadingProgress(), { wrapper });

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Failed to resolve auth state for reading progress:",
            currentAuthError,
        );
        consoleErrorSpy.mockRestore();
    });

    it("loads only the signed-in user's cloud rows during hydration", async () => {
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        currentAuthUser = { id: "user-a" };
        currentCloudRows = [
            {
                user_id: "user-a",
                content_id: "item-own",
                is_bookmarked: false,
                progress: {
                    itemId: "item-own",
                    completed: ["seg-1"],
                    lastSegmentIndex: 0,
                    lastReadAt: "2026-03-13T10:00:00.000Z",
                    isCompleted: false,
                },
                last_interacted_at: "2026-03-13T10:00:00.000Z",
            },
            {
                user_id: "user-b",
                content_id: "item-foreign",
                is_bookmarked: true,
                progress: {
                    itemId: "item-foreign",
                    completed: ["seg-2"],
                    lastSegmentIndex: 1,
                    lastReadAt: "2026-03-13T11:00:00.000Z",
                    isCompleted: false,
                },
                last_interacted_at: "2026-03-13T11:00:00.000Z",
            },
        ];

        await act(async () => {
            authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser });
        });

        await waitFor(() => expect(result.current.storageScope).toBe(getStorageScope("user-a")));

        expect(eqMock).toHaveBeenCalledWith("user_id", "user-a");
        expect(result.current.inProgressIds).toEqual(["item-own"]);
        expect(result.current.myListIds).toEqual([]);
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-own"))).not.toBeNull();
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-foreign"))).toBeNull();
        expect(upsertMock).not.toHaveBeenCalledWith(expect.objectContaining({ content_id: "item-foreign" }), expect.anything());
    });
});
