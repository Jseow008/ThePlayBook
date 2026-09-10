// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    AuthUserProvider,
} from "@/hooks/useAuthUser";
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
import { fetchCompleteLibrarySnapshot } from "@/lib/account-data-client";

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

vi.mock("@/lib/account-data-client", () => ({
    LibrarySnapshotClientError: class LibrarySnapshotClientError extends Error {
        constructor(message: string, readonly code = "SNAPSHOT_UNAVAILABLE") { super(message); }
    },
    fetchCompleteLibrarySnapshot: vi.fn(),
    getLibrarySnapshotIdempotencyKey: vi.fn(() => "00000000-0000-4000-8000-000000000099"),
    clearLibrarySnapshotIdempotencyKey: vi.fn(),
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
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
            AuthUserProvider,
            null,
            createElement(ReadingProgressProvider, null, children),
        ),
    );
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
        (fetchCompleteLibrarySnapshot as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve({
            manifest: {
                snapshotId: "snapshot-test",
                recordCount: currentCloudRows.length,
                manifestHash: "hash",
                resetEpoch: 0,
                boundaryLibraryRevision: 0,
                expiresAt: "2030-01-01T00:00:00.000Z",
            },
            records: currentCloudRows
                .filter((row) => row.user_id === undefined || row.user_id === currentAuthUser?.id)
                .map((row, index) => ({
                    ordinal: index + 1,
                    payloadHash: `hash-${index}`,
                    content_id: row.content_id,
                    is_bookmarked: row.is_bookmarked,
                    progress: row.progress,
                    last_interacted_at: row.last_interacted_at,
                    library_updated_at: row.last_interacted_at,
                    library_revision: index + 1,
                })),
        }));
    });

    it("migrates legacy guest storage into scoped guest keys", async () => {
        const legacyProgressKey = "netflux_progress_item-1";
        const legacyMyListKey = "netflux_mylist";

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

    it("records a stable completion timestamp for completed progress", async () => {
        const { result } = renderHook(() => useReadingProgress(), { wrapper });

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        act(() => {
            result.current.saveReadingProgress("item-complete", {
                itemId: "item-complete",
                completed: ["seg-1", "seg-2"],
                lastSegmentIndex: 1,
                lastReadAt: "2026-03-10T00:00:00.000Z",
                isCompleted: true,
                totalSegments: 2,
            });
        });

        expect(result.current.getProgress("item-complete")?.completedAt).toBe("2026-03-10T00:00:00.000Z");

        act(() => {
            result.current.saveReadingProgress("item-complete", {
                itemId: "item-complete",
                completed: ["seg-1", "seg-2"],
                lastSegmentIndex: 1,
                lastReadAt: "2026-03-12T00:00:00.000Z",
                isCompleted: true,
                totalSegments: 2,
            });
        });

        expect(result.current.getProgress("item-complete")?.completedAt).toBe("2026-03-10T00:00:00.000Z");

        act(() => {
            result.current.saveReadingProgress("item-complete", {
                itemId: "item-complete",
                completed: ["seg-1"],
                lastSegmentIndex: 0,
                lastReadAt: "2026-03-13T00:00:00.000Z",
                isCompleted: false,
                totalSegments: 2,
            });
        });

        expect(result.current.getProgress("item-complete")?.completedAt).toBeUndefined();
    });

    it("archives an in-progress item without deleting its progress", async () => {
        const { result } = renderHook(() => useReadingProgress(), { wrapper });

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        act(() => {
            result.current.saveReadingProgress("item-archive", {
                itemId: "item-archive",
                completed: ["seg-1"],
                lastSegmentIndex: 0,
                lastReadAt: "2026-03-10T00:00:00.000Z",
                isCompleted: false,
                totalSegments: 3,
            });
        });

        expect(result.current.inProgressIds).toContain("item-archive");

        act(() => {
            result.current.archiveFromProgressList("item-archive", "reading");
        });

        expect(result.current.inProgressIds).not.toContain("item-archive");
        expect(result.current.getProgress("item-archive")).toEqual(
            expect.objectContaining({
                completed: ["seg-1"],
                archivedFromLists: { reading: true },
            })
        );
        expect(localStorage.getItem(progressKey(GUEST_STORAGE_SCOPE, "item-archive"))).not.toBeNull();
    });

    it("clears the archive flag when progress is saved again for the current list", async () => {
        const { result } = renderHook(() => useReadingProgress(), { wrapper });

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        act(() => {
            result.current.saveReadingProgress("item-reopen", {
                itemId: "item-reopen",
                completed: ["seg-1"],
                lastSegmentIndex: 0,
                lastReadAt: "2026-03-10T00:00:00.000Z",
                isCompleted: false,
                totalSegments: 3,
            });
            result.current.archiveFromProgressList("item-reopen", "reading");
        });

        expect(result.current.inProgressIds).not.toContain("item-reopen");

        act(() => {
            result.current.saveReadingProgress("item-reopen", {
                itemId: "item-reopen",
                completed: ["seg-1", "seg-2"],
                lastSegmentIndex: 1,
                lastReadAt: "2026-03-11T00:00:00.000Z",
                isCompleted: false,
                totalSegments: 3,
            });
        });

        expect(result.current.inProgressIds).toContain("item-reopen");
        expect(result.current.getProgress("item-reopen")?.archivedFromLists).toBeUndefined();
    });

    it("restores an archived progress item back to its current library list", async () => {
        const { result } = renderHook(() => useReadingProgress(), { wrapper });

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        act(() => {
            result.current.saveReadingProgress("item-restore", {
                itemId: "item-restore",
                completed: ["seg-1"],
                lastSegmentIndex: 0,
                lastReadAt: "2026-03-10T00:00:00.000Z",
                isCompleted: false,
                totalSegments: 3,
            });
            result.current.archiveFromProgressList("item-restore", "reading");
        });

        expect(result.current.inProgressIds).not.toContain("item-restore");

        act(() => {
            result.current.restoreProgressListArchive("item-restore", "reading");
        });

        expect(result.current.inProgressIds).toContain("item-restore");
        expect(result.current.getProgress("item-restore")).toEqual(
            expect.objectContaining({
                completed: ["seg-1"],
            })
        );
        expect(result.current.getProgress("item-restore")?.archivedFromLists).toBeUndefined();
    });

    it("removes an item from history and clears recommendation memory", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ success: true }), { status: 200 }),
        );
        const { result } = renderHook(() => useReadingProgress(), { wrapper });

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        act(() => {
            result.current.saveReadingProgress("item-history", {
                itemId: "item-history",
                completed: ["seg-1", "seg-2"],
                lastSegmentIndex: 1,
                lastReadAt: "2026-03-10T00:00:00.000Z",
                isCompleted: true,
                totalSegments: 2,
            });
        });

        localStorage.setItem(`netflux_recent_recommendations_${GUEST_STORAGE_SCOPE}`, JSON.stringify([{ id: "rec-1", shownAt: "2026-03-10T00:00:00.000Z" }]));
        localStorage.setItem(`netflux_recommendation_cache_${GUEST_STORAGE_SCOPE}`, JSON.stringify([{ cacheKey: "cache-1", storedAt: "2026-03-10T00:00:00.000Z", items: [] }]));
        localStorage.setItem(`netflux_browse_recommendation_cache_${GUEST_STORAGE_SCOPE}`, JSON.stringify([{ cacheKey: "browse-1", storedAt: "2026-03-10T00:00:00.000Z", data: { recentItems: [], libraryItems: [] } }]));

        await act(async () => {
            await result.current.removeFromHistory("item-history", {
                deleteNotesAndHighlights: true,
            });
        });

        expect(result.current.completedIds).not.toContain("item-history");
        expect(result.current.getProgress("item-history")).toBeNull();
        expect(localStorage.getItem(progressKey(GUEST_STORAGE_SCOPE, "item-history"))).toBeNull();
        expect(localStorage.getItem(`netflux_recent_recommendations_${GUEST_STORAGE_SCOPE}`)).toBeNull();
        expect(localStorage.getItem(`netflux_recommendation_cache_${GUEST_STORAGE_SCOPE}`)).toBeNull();
        expect(localStorage.getItem(`netflux_browse_recommendation_cache_${GUEST_STORAGE_SCOPE}`)).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();

        fetchMock.mockRestore();
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

    it("preserves guest data until the explicit guest-to-account migration runs", async () => {
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

        await waitFor(() => expect(result.current.myListIds).toEqual([]));
        expect(result.current.inProgressIds).toEqual([]);
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-10"))).toBeNull();
        expect(localStorage.getItem(myListKey(getStorageScope("user-a")))).toBe(JSON.stringify([]));
        expect(localStorage.getItem(progressKey(GUEST_STORAGE_SCOPE, "item-10"))).not.toBeNull();
        expect(localStorage.getItem(myListKey(GUEST_STORAGE_SCOPE))).toBe(JSON.stringify(["item-11"]));
        expect(upsertMock).not.toHaveBeenCalled();
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

        await waitFor(() => expect(result.current.myListIds).toEqual([]));
        expect(result.current.inProgressIds).toEqual([]);
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-21"))).not.toBeNull();
        expect(localStorage.getItem(myListKey(getStorageScope("user-a")))).toBe(JSON.stringify(["item-22"]));
        expect(localStorage.getItem(progressKey(getStorageScope("user-b"), "item-21"))).toBeNull();
        expect(localStorage.getItem(myListKey(getStorageScope("user-b")))).toBe(JSON.stringify([]));
    });

    it("discards account A's in-flight snapshot after switching to account B", async () => {
        let resolveAccountA!: (value: unknown) => void;
        const accountASnapshot = new Promise((resolve) => { resolveAccountA = resolve; });
        (fetchCompleteLibrarySnapshot as unknown as ReturnType<typeof vi.fn>)
            .mockImplementationOnce(() => accountASnapshot)
            .mockResolvedValueOnce({
                manifest: { snapshotId: "snapshot-b", recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" },
                records: [{ ordinal: 1, payloadHash: "hash-b", content_id: "item-b", is_bookmarked: true, progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: 1 }],
            });

        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        currentAuthUser = { id: "user-a" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });
        currentAuthUser = { id: "user-b" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });

        await waitFor(() => expect(result.current.myListIds).toEqual(["item-b"]));
        await act(async () => {
            resolveAccountA({
                manifest: { snapshotId: "snapshot-a", recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" },
                records: [{ ordinal: 1, payloadHash: "hash-a", content_id: "item-a", is_bookmarked: true, progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: 1 }],
            });
        });

        expect(result.current.storageScope).toBe(getStorageScope("user-b"));
        expect(result.current.myListIds).toEqual(["item-b"]);
        expect(localStorage.getItem(myListKey(getStorageScope("user-b")))).toBe(JSON.stringify(["item-b"]));
    });

    it("does not overwrite a local save that occurs during snapshot hydration", async () => {
        let resolveSnapshot!: (value: unknown) => void;
        const pendingSnapshot = new Promise((resolve) => { resolveSnapshot = resolve; });
        (fetchCompleteLibrarySnapshot as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => pendingSnapshot);

        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        currentAuthUser = { id: "user-a" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });
        act(() => {
            result.current.toggleMyList("new-local-item");
        });
        await act(async () => {
            resolveSnapshot({
                manifest: { snapshotId: "snapshot-old", recordCount: 0, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 0, expiresAt: "2030-01-01T00:00:00.000Z" },
                records: [],
            });
        });

        expect(result.current.myListIds).toEqual(["new-local-item"]);
        expect(localStorage.getItem(myListKey(getStorageScope("user-a")))).toBe(JSON.stringify(["new-local-item"]));
    });

    it("falls back to the guest flow when auth bootstrap errors", async () => {
        currentAuthError = {
            message: "Network failure",
            name: "AuthRetryableFetchError",
        };

        const { result } = renderHook(() => useReadingProgress(), { wrapper });

        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        expect(result.current.storageScope).toBe(GUEST_STORAGE_SCOPE);
        expect(result.current.user).toBeNull();
    });

    it("keeps guest progress and downgrades snapshot failures to warnings", async () => {
        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const guestProgress = {
            itemId: "item-31",
            completed: ["seg-1"],
            lastSegmentIndex: 0,
            lastReadAt: new Date().toISOString(),
            isCompleted: false,
        } satisfies ReadingProgressData;

        localStorage.setItem(progressKey(GUEST_STORAGE_SCOPE, "item-31"), JSON.stringify(guestProgress));

        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(result.current.isLoaded).toBe(true));

        currentAuthUser = { id: "user-a" };
        (fetchCompleteLibrarySnapshot as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Snapshot unavailable"));

        await act(async () => {
            authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser });
        });

        await waitFor(() => expect(result.current.storageScope).toBe(getStorageScope("user-a")));

        expect(result.current.inProgressIds).toEqual([]);
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-31"))).toBeNull();
        expect(localStorage.getItem(progressKey(GUEST_STORAGE_SCOPE, "item-31"))).not.toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            "[ReadingProgress] Fetch complete library snapshot failed",
            expect.objectContaining({
                scope: getStorageScope("user-a"),
                userId: "user-a",
                error: expect.any(Object),
            }),
        );
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it("installs only the signed-in user's server snapshot during hydration", async () => {
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

        expect(fetchCompleteLibrarySnapshot).toHaveBeenCalled();
        expect(result.current.inProgressIds).toEqual(["item-own"]);
        expect(result.current.myListIds).toEqual([]);
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-own"))).not.toBeNull();
        expect(localStorage.getItem(progressKey(getStorageScope("user-a"), "item-foreign"))).toBeNull();
        expect(upsertMock).not.toHaveBeenCalledWith(expect.objectContaining({ content_id: "item-foreign" }), expect.anything());
    });
});
