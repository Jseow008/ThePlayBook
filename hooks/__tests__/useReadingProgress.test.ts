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
import { readLibraryIntents, writeLibraryIntent } from "@/lib/library-mutation-journal";
import { LibraryMutationConflictError } from "@/lib/user-library-mutation-contract";
import { clearLibrarySnapshotIdempotencyKey, fetchCompleteLibrarySnapshot, LibrarySnapshotClientError } from "@/lib/account-data-client";

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
const { commitMutationMock } = vi.hoisted(() => ({ commitMutationMock: vi.fn() }));
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

vi.mock("@/lib/user-library-mutation-client", () => ({
    commitUserLibraryMutation: commitMutationMock,
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
        Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
        window.localStorage.clear();
        upsertMock.mockResolvedValue({ error: null });
        commitMutationMock.mockResolvedValue({ resetEpoch: 0, libraryRevision: 1 });
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

    const snapshotAt = (revision: number, saved = false, epoch = 0) => ({
        manifest: { snapshotId: `snapshot-${epoch}-${revision}`, recordCount: saved ? 1 : 0,
            manifestHash: "hash", resetEpoch: epoch, boundaryLibraryRevision: revision, expiresAt: "2030-01-01T00:00:00.000Z" },
        records: saved ? [{ ordinal: 1, payloadHash: "hash", content_id: "new-local-item", is_bookmarked: true,
            progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: revision }] : [],
    });

    it("keeps offline saves durable across reload and sends them only for the owning account", async () => {
        currentAuthUser = { id: "user-a" };
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(10) as never);
        let view = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(view.result.current.user?.id).toBe(currentAuthUser?.id); expect(view.result.current.hydrationStatus).toBe("ready"); });
        Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
        await act(async () => { await view.result.current.addToMyList("offline-item"); });
        const queued = readLibraryIntents(localStorage, "user-a").entries;
        expect(queued).toHaveLength(1);
        expect(queued[0].status).toBe("pending");
        expect(commitMutationMock).not.toHaveBeenCalled();
        view.unmount();
        currentAuthUser = { id: "user-b" };
        Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
        view = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(view.result.current.user?.id).toBe(currentAuthUser?.id); expect(view.result.current.hydrationStatus).toBe("ready"); });
        expect(commitMutationMock).not.toHaveBeenCalled();
        expect(view.result.current.recovery.pending).toBe(0);
        view.unmount();
        currentAuthUser = { id: "user-a" };
        commitMutationMock.mockResolvedValue({ resetEpoch: 0, libraryRevision: 11 });
        view = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(1));
        expect(commitMutationMock.mock.calls[0][0]).toMatchObject({ mutationId: queued[0].id, baseRevision: 10, expectedAccountId: "user-a" });
        await waitFor(() => expect(view.result.current.recovery.pending).toBe(0));
    });

    it("reuses the exact frozen request after a lost response and newer snapshot", async () => {
        currentAuthUser = { id: "user-a" };
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(10) as never);
        commitMutationMock.mockRejectedValueOnce(new Error("response lost"));
        let view = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(view.result.current.user?.id).toBe(currentAuthUser?.id); expect(view.result.current.hydrationStatus).toBe("ready"); });
        await act(async () => { await view.result.current.addToMyList("lost-ack"); });
        const original = commitMutationMock.mock.calls[0][0];
        expect(readLibraryIntents(localStorage, "user-a").entries[0].request?.mutationId).toBe(original.mutationId);
        view.unmount();
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(11) as never);
        commitMutationMock.mockResolvedValue({ resetEpoch: 0, libraryRevision: 11 });
        view = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(2));
        expect(commitMutationMock.mock.calls[1][0]).toEqual(original);
        await waitFor(() => expect(view.result.current.recovery.pending).toBe(0));
    });

    it("does not overlay or replay an offline save after a reset discovered on reload", async () => {
        currentAuthUser = { id: "user-a" };
        writeLibraryIntent(localStorage, { version: 1, id: crypto.randomUUID(), accountId: "user-a", itemId: "old-item",
            sequence: 1, createdAt: new Date().toISOString(), isBookmarked: true, progress: null,
            base: { resetEpoch: 0, libraryRevision: 1 }, status: "pending" });
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(20, false, 1) as never);
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe(currentAuthUser?.id); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual([]);
        expect(commitMutationMock).not.toHaveBeenCalled();
        expect(readLibraryIntents(localStorage, "user-a").entries[0].status).toBe("needs_attention");
    });

    it("imports explicitly, queues the whole guest batch first, and continues after an existing destination", async () => {
        currentAuthUser = { id: "user-a" };
        localStorage.setItem(myListKey("guest"), JSON.stringify(["existing", "eligible"]));
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(10) as never);
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe(currentAuthUser?.id); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(commitMutationMock).not.toHaveBeenCalled();
        commitMutationMock.mockImplementationOnce(async () => {
            expect(readLibraryIntents(localStorage, "user-a").entries).toHaveLength(2);
            return { resetEpoch: 0, libraryRevision: 10, outcome: "skipped", reason: "destination_exists" };
        }).mockResolvedValueOnce({ resetEpoch: 0, libraryRevision: 11, outcome: "applied" });
        await act(async () => { await result.current.importGuestLibrary(); });
        expect(commitMutationMock).toHaveBeenCalledTimes(2);
        const [first, second] = commitMutationMock.mock.calls.map(call => call[0]);
        expect(first.guestImport.migrationId).toBe(second.guestImport.migrationId);
        expect(first.guestImport.sourceRecordId).not.toBe(second.guestImport.sourceRecordId);
        expect(second.baseRevision).toBe(10);
        expect(JSON.parse(localStorage.getItem(myListKey("guest"))!)).toEqual(["existing"]);
        await waitFor(() => expect(result.current.recovery.attention).toHaveLength(1));
        expect(result.current.recovery.attention[0].canReapply).toBe(false);
    });

    it("keeps a throttled guest import durable and resumes the identical request before the next item", async () => {
        currentAuthUser = { id: "user-a" };
        localStorage.setItem(myListKey("guest"), JSON.stringify(["first", "second"]));
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(10) as never);
        const view = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(view.result.current.hydrationStatus).toBe("ready"));
        const actual = await vi.importActual<typeof import("@/lib/user-library-mutation-client")>("@/lib/user-library-mutation-client");
        commitMutationMock.mockImplementation(actual.commitUserLibraryMutation);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), { status: 429, headers: { "Retry-After": "2" } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: { resetEpoch: 0, libraryRevision: 11, outcome: "applied" } })))
            .mockResolvedValueOnce(new Response(JSON.stringify({ data: { resetEpoch: 0, libraryRevision: 12, outcome: "applied" } })));
        vi.stubGlobal("fetch", fetchMock); vi.useFakeTimers();
        try {
            let importing!: Promise<void>;
            await act(async () => { importing = view.result.current.importGuestLibrary(); });
            expect(readLibraryIntents(localStorage, "user-a").entries).toHaveLength(2);
            expect(JSON.parse(localStorage.getItem(myListKey("guest"))!)).toEqual(["first", "second"]);
            await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
            expect(fetchMock).toHaveBeenCalledOnce();
            await act(async () => { await vi.advanceTimersByTimeAsync(1); await importing; });
            expect(fetchMock).toHaveBeenCalledTimes(3);
            expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
            expect(JSON.parse(fetchMock.mock.calls[2][1].body).baseRevision).toBe(11);
            expect(JSON.parse(localStorage.getItem(myListKey("guest"))!)).toEqual([]);
            expect(view.result.current.recovery.pending).toBe(0);
        } finally { view.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); }
    });

    it("resumes an interrupted guest batch without launching a competing snapshot", async () => {
        currentAuthUser = { id: "user-a" };
        localStorage.setItem(myListKey("guest"), JSON.stringify(["guest-first", "guest-second"]));
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(10) as never);
        let view = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(view.result.current.user?.id).toBe("user-a"); expect(view.result.current.hydrationStatus).toBe("ready"); });
        const initialSnapshotCalls = vi.mocked(fetchCompleteLibrarySnapshot).mock.calls.length;
        commitMutationMock.mockRejectedValueOnce(new TypeError("lost response"));
        await act(async () => { await view.result.current.importGuestLibrary(); });
        expect(view.result.current.recovery.pending).toBe(2);
        expect(vi.mocked(fetchCompleteLibrarySnapshot).mock.calls).toHaveLength(initialSnapshotCalls);
        const original = commitMutationMock.mock.calls[0][0];
        view.unmount();
        commitMutationMock.mockResolvedValueOnce({ resetEpoch: 0, libraryRevision: 11, outcome: "applied" })
            .mockResolvedValueOnce({ resetEpoch: 0, libraryRevision: 12, outcome: "applied" });
        view = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(3));
        expect(commitMutationMock.mock.calls[1][0]).toEqual(original);
        expect(commitMutationMock.mock.calls[2][0].baseRevision).toBe(11);
        await waitFor(() => expect(view.result.current.recovery.pending).toBe(0));
        expect(JSON.parse(localStorage.getItem(myListKey("guest"))!)).toEqual([]);
    });

    it("finishes acknowledged guest cleanup after a reload without another mutation", async () => {
        currentAuthUser = { id: "user-a" };
        localStorage.setItem(myListKey("guest"), JSON.stringify(["imported-item"]));
        writeLibraryIntent(localStorage, { version: 1, id: crypto.randomUUID(), accountId: "user-a",
            itemId: "imported-item", sequence: 1, createdAt: new Date().toISOString(),
            isBookmarked: true, progress: null, base: { resetEpoch: 0, libraryRevision: 10 },
            guestImport: { migrationId: crypto.randomUUID(), guestStorageId: crypto.randomUUID(), sourceRecordId: crypto.randomUUID() },
            acknowledgement: { resetEpoch: 0, libraryRevision: 11, outcome: "applied" }, status: "acknowledged" });
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(11) as never);
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(JSON.parse(localStorage.getItem(myListKey("guest"))!)).toEqual([]);
        expect(commitMutationMock).not.toHaveBeenCalled();
        expect(readLibraryIntents(localStorage, "user-a").entries).toHaveLength(0);
    });

    it("refuses network delivery when the intent cannot be persisted", async () => {
        currentAuthUser = { id: "user-a" };
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe(currentAuthUser?.id); expect(result.current.hydrationStatus).toBe("ready"); });
        const original = localStorageMock.setItem.getMockImplementation()!;
        localStorageMock.setItem.mockImplementation((key, value) => {
            if (key.startsWith("netflux.library-mutation")) throw new DOMException("full", "QuotaExceededError");
            return original(key, value);
        });
        try {
            await act(async () => { expect(await result.current.addToMyList("not-durable")).toBe(false); });
            expect(commitMutationMock).not.toHaveBeenCalled();
            expect(result.current.recovery.storageError).toBe(true);
        } finally { localStorageMock.setItem.mockImplementation(original); }
    });

    it("preserves a based pending save through stale snapshots until its exact acknowledgement is included", async () => {
        let resolveSave!: (value: unknown) => void;
        commitMutationMock.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(10) as never);
        currentAuthUser = { id: "user-a" };
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        act(() => { void result.current.addToMyList("new-local-item"); });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledWith(expect.objectContaining({
            expectedAccountId: "user-a", baseRevision: 10, resetEpoch: 0,
        }), expect.any(AbortSignal), expect.any(Function)));
        act(() => result.current.retryHydration());
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual(["new-local-item"]);
        await act(async () => resolveSave({ resetEpoch: 0, libraryRevision: 11 }));
        act(() => result.current.retryHydration());
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual(["new-local-item"]);
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(11, true) as never);
        act(() => result.current.retryHydration());
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual(["new-local-item"]);
    });

    it("does not submit a cached action before the initial server boundary is known", async () => {
        let resolveSnapshot!: (value: Awaited<ReturnType<typeof fetchCompleteLibrarySnapshot>>) => void;
        vi.mocked(fetchCompleteLibrarySnapshot).mockImplementationOnce(() => new Promise(resolve => { resolveSnapshot = resolve; }));
        currentAuthUser = { id: "user-a" };
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(result.current.hydrationStatus).toBe("hydrating"));
        expect(result.current.isLoaded).toBe(false);
        await act(async () => { expect(await result.current.addToMyList("new-local-item")).toBe(false); });
        expect(commitMutationMock).not.toHaveBeenCalled();
        expect(result.current.syncNeedsAttention).toBe(true);
        await act(async () => resolveSnapshot(snapshotAt(2) as never));
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual([]);
    });

    it("finishes pending hydration when auth emits a new object for the same user", async () => {
        let resolveSnapshot!: (value: Awaited<ReturnType<typeof fetchCompleteLibrarySnapshot>>) => void;
        vi.mocked(fetchCompleteLibrarySnapshot).mockImplementationOnce(() => new Promise(resolve => { resolveSnapshot = resolve; }));
        currentAuthUser = { id: "user-a" };
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(result.current.hydrationStatus).toBe("hydrating"));
        act(() => authStateChangeHandler?.("INITIAL_SESSION", { user: { id: "user-a" } }));
        act(() => authStateChangeHandler?.("TOKEN_REFRESHED", { user: { id: "user-a" } }));
        await act(async () => resolveSnapshot(snapshotAt(2) as never));
        await waitFor(() => { expect(result.current.user?.id).toBe(currentAuthUser?.id); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.isLoaded).toBe(true);
        expect(fetchCompleteLibrarySnapshot).toHaveBeenCalledTimes(1);
        await act(async () => { await result.current.addToMyList("new-local-item"); });
        expect(commitMutationMock).toHaveBeenCalledWith(expect.objectContaining({ baseRevision: 2 }), expect.any(AbortSignal), expect.any(Function));
    });

    it("marks conflicts as needing attention and refreshes without replaying rejected saves", async () => {
        currentAuthUser = { id: "user-a" };
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(10) as never);
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        commitMutationMock.mockRejectedValueOnce(new LibraryMutationConflictError({ resetEpoch: 0, libraryRevision: 12 }));
        await act(async () => { expect(await result.current.addToMyList("new-local-item")).toBe(false); });
        expect(result.current.syncNeedsAttention).toBe(true);
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(12) as never);
        act(() => result.current.retryHydration());
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual([]);
        expect(commitMutationMock).toHaveBeenCalledTimes(1);
        commitMutationMock.mockResolvedValueOnce({ resetEpoch: 0, libraryRevision: 13 });
        await act(async () => { expect(await result.current.addToMyList("new-local-item")).toBe(true); });
        expect(commitMutationMock).toHaveBeenLastCalledWith(expect.objectContaining({ baseRevision: 12 }), expect.any(AbortSignal), expect.any(Function));
    });

    it("keeps a newer pending removal ahead of an older acknowledged save during hydration", async () => {
        let resolveRemoval!: (value: unknown) => void;
        const pendingRemoval = new Promise((resolve) => { resolveRemoval = resolve; });
        const emptySnapshot = {
            manifest: { snapshotId: "base", recordCount: 0, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 0, expiresAt: "2030-01-01T00:00:00.000Z" },
            records: [],
        };
        const savedSnapshot = {
            manifest: { snapshotId: "saved", recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" },
            records: [{ ordinal: 1, payloadHash: "hash", content_id: "item-ordered", is_bookmarked: true, progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: 1 }],
        };
        (fetchCompleteLibrarySnapshot as unknown as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce(emptySnapshot)
            .mockResolvedValueOnce(savedSnapshot);
        commitMutationMock
            .mockResolvedValueOnce({ resetEpoch: 0, libraryRevision: 1 })
            .mockImplementationOnce(() => pendingRemoval);

        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(result.current.isLoaded).toBe(true));
        currentAuthUser = { id: "user-a" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });

        act(() => { void result.current.addToMyList("item-ordered"); });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(1));
        act(() => { void result.current.removeFromMyList("item-ordered"); });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(2));

        act(() => result.current.retryHydration());
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual([]);

        await act(async () => { resolveRemoval({ resetEpoch: 0, libraryRevision: 2 }); });
    });

    it("serializes save then removal even when the first acknowledgement is delayed", async () => {
        let resolveSave!: (value: unknown) => void;
        currentAuthUser = { id: "user-a" };
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(0) as never);
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        commitMutationMock.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }))
            .mockResolvedValueOnce({ resetEpoch: 0, libraryRevision: 2 });
        act(() => { void result.current.addToMyList("new-local-item"); });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(1));
        act(() => { void result.current.removeFromMyList("new-local-item"); });
        expect(commitMutationMock).toHaveBeenCalledTimes(1);
        expect(result.current.myListIds).toEqual([]);
        await act(async () => resolveSave({ resetEpoch: 0, libraryRevision: 1 }));
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(2));
        expect(commitMutationMock).toHaveBeenLastCalledWith(expect.objectContaining({ baseRevision: 1, isBookmarked: false }), expect.any(AbortSignal), expect.any(Function));
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(2) as never);
        act(() => result.current.retryHydration());
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual([]);
    });

    it("does not dispatch queued actions or accept late acknowledgements after account switching", async () => {
        let resolveSave!: (value: unknown) => void;
        currentAuthUser = { id: "user-a" };
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        commitMutationMock.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
        act(() => { void result.current.addToMyList("old-item"); });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(1));
        act(() => { void result.current.addToMyList("queued-item"); });
        currentAuthUser = { id: "user-b" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });
        await waitFor(() => expect(result.current.user?.id).toBe("user-b"));
        await act(async () => resolveSave({ resetEpoch: 0, libraryRevision: 100 }));
        expect(commitMutationMock).toHaveBeenCalledTimes(1);
        expect(result.current.myListIds).toEqual([]);
    });

    it("lets explicit post-reset writes proceed while ignoring an unresolved pre-reset response", async () => {
        let resolveOld!: (value: unknown) => void;
        currentAuthUser = { id: "user-a" };
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        commitMutationMock.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
            .mockResolvedValueOnce({ resetEpoch: 1, libraryRevision: 3 });
        act(() => { void result.current.addToMyList("old-item"); });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(1));
        act(() => window.dispatchEvent(new CustomEvent("netflux_library_reset", {
            detail: { scope: getStorageScope("user-a"), resetEpoch: 1, boundaryRevision: 2 },
        })));
        await act(async () => { expect(await result.current.addToMyList("post-reset-item")).toBe(true); });
        expect(commitMutationMock).toHaveBeenLastCalledWith(expect.objectContaining({ resetEpoch: 1, baseRevision: 2 }), expect.any(AbortSignal), expect.any(Function));
        await act(async () => resolveOld({ resetEpoch: 0, libraryRevision: 1 }));
        expect(result.current.syncNeedsAttention).toBe(false);
        expect(commitMutationMock.mock.calls[0][1].aborted).toBe(true);
        expect(readLibraryIntents(localStorage, "user-a").entries.some(entry => entry.itemId === "old-item")).toBe(false);
    });

    it("does not overlay a pending pre-reset save onto a newer epoch snapshot", async () => {
        let resolveOld!: (value: unknown) => void;
        currentAuthUser = { id: "user-a" };
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => { expect(result.current.user?.id).toBe("user-a"); expect(result.current.hydrationStatus).toBe("ready"); });
        commitMutationMock.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
        act(() => { void result.current.addToMyList("old-item"); });
        await waitFor(() => expect(commitMutationMock).toHaveBeenCalledTimes(1));
        vi.mocked(fetchCompleteLibrarySnapshot).mockResolvedValue(snapshotAt(2, false, 1) as never);
        act(() => result.current.retryHydration());
        await waitFor(() => { expect(result.current.user?.id).toBe(currentAuthUser?.id); expect(result.current.hydrationStatus).toBe("ready"); });
        expect(result.current.myListIds).toEqual([]);
        await act(async () => resolveOld({ resetEpoch: 0, libraryRevision: 1 }));
        expect(result.current.myListIds).toEqual([]);
    });

    it.each(["TIMED_OUT", "SNAPSHOT_FAILED", "SNAPSHOT_EXPIRED"])("uses a fresh snapshot key after terminal %s outcome", async (code) => {
        (fetchCompleteLibrarySnapshot as unknown as ReturnType<typeof vi.fn>)
            .mockRejectedValueOnce(new LibrarySnapshotClientError("Terminal snapshot outcome", code));
        const { result } = renderHook(() => useReadingProgress(), { wrapper });
        await waitFor(() => expect(result.current.isLoaded).toBe(true));
        currentAuthUser = { id: "user-a" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });

        await waitFor(() => expect(result.current.hydrationStatus).toBe("error"));
        expect(clearLibrarySnapshotIdempotencyKey).toHaveBeenCalledWith("user-a");
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
