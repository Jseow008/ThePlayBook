// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentItem } from "@/types/database";
import {
    recordCachedBrowseRecommendations,
} from "@/lib/browse-recommendation-cache";
import {
    readCachedRecommendations,
    recordCachedRecommendations,
    recordRecentRecommendations,
} from "@/lib/recommendation-memory";

const useReadingProgressMock = vi.fn(() => ({
    storageScope: "guest" as const,
}));

vi.mock("@/hooks/useReadingProgress", () => ({
    useReadingProgress: () => useReadingProgressMock(),
}));

async function loadUseRecommendations() {
    return import("../use-content-queries");
}

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                refetchOnWindowFocus: false,
            },
        },
    });
}

function createWrapper() {
    const queryClient = createQueryClient();

    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

function createLocalStorageMock() {
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
}

function createRecommendationItem(id: string, title: string): ContentItem {
    return {
        id,
        title,
        author: "Author",
        category: "Business",
        cover_image_url: null,
        audio_url: null,
        created_at: "2026-04-01T00:00:00.000Z",
        deleted_at: null,
        duration_seconds: 240,
        embedding: null,
        hero_image_url: null,
        is_featured: false,
        narration_completed_at: null,
        narration_error: null,
        narration_requested_at: null,
        narration_started_at: null,
        narration_status: "completed",
        quick_mode_json: null,
        series_id: null,
        series_order: null,
        source_url: null,
        status: "published",
        type: "book",
        updated_at: "2026-04-01T00:00:00.000Z",
    } as ContentItem;
}

function buildCacheKey(seedIds: string[], excludeIds: string[], matchCount: number) {
    return JSON.stringify({
        seedIds: [...seedIds].sort(),
        excludeIds: [...excludeIds].sort(),
        matchCount,
        storageScope: "guest",
    });
}

describe("useRecommendations", () => {
    const fetchMock = vi.fn();
    const localStorageMock = createLocalStorageMock();

    beforeEach(() => {
        Object.defineProperty(window, "localStorage", {
            value: localStorageMock,
            configurable: true,
        });
        window.localStorage.clear();
        useReadingProgressMock.mockClear();
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });

    it("hydrates from an exact persisted recommendation cache without refetching", async () => {
        const { useRecommendations } = await loadUseRecommendations();
        const wrapper = createWrapper();
        const seedIds = ["item-1"];
        const cachedItems = [
            createRecommendationItem("rec-1", "Cached recommendation"),
            createRecommendationItem("rec-2", "Second cached recommendation"),
        ];

        recordRecentRecommendations(window.localStorage, "guest", ["recent-1"]);
        const exactCacheKey = buildCacheKey(seedIds, ["recent-1"], 2);
        recordCachedRecommendations(
            window.localStorage,
            "guest",
            exactCacheKey,
            cachedItems,
            Date.now(),
        );

        const { result } = renderHook(
            () => useRecommendations(seedIds, { enabled: true, matchCount: 2 }),
            { wrapper },
        );

        expect(result.current.data).toEqual(cachedItems);
        expect(result.current.isFetching).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();

        const cachedEntry = readCachedRecommendations(window.localStorage, "guest", exactCacheKey);
        expect(cachedEntry?.items).toEqual(cachedItems);
    });

    it("returns stale cached recommendations immediately and refreshes them in the background", async () => {
        const { useRecommendations } = await loadUseRecommendations();
        const wrapper = createWrapper();
        const seedIds = ["item-2"];
        const staleItems = [createRecommendationItem("rec-old", "Stale cached recommendation")];
        const freshItems = [createRecommendationItem("rec-new", "Fresh recommendation")];
        const baselineCacheKey = buildCacheKey(seedIds, [], 1);

        recordCachedRecommendations(
            window.localStorage,
            "guest",
            baselineCacheKey,
            staleItems,
            Date.now() - (1000 * 60 * 3),
        );

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue(freshItems),
        });

        const { result } = renderHook(
            () => useRecommendations(seedIds, { enabled: true, matchCount: 1 }),
            { wrapper },
        );

        expect(result.current.data).toEqual(staleItems);
        expect(result.current.isFetching).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await waitFor(() => expect(result.current.data).toEqual(freshItems));

        const refreshedEntry = readCachedRecommendations(window.localStorage, "guest", baselineCacheKey);
        expect(refreshedEntry?.items).toEqual(freshItems);
    });

    it("filters fallback cached recommendations against current recent exclusions before rendering", async () => {
        const { useRecommendations } = await loadUseRecommendations();
        const wrapper = createWrapper();
        const seedIds = ["item-3"];
        const blockedItem = createRecommendationItem("recent-1", "Already shown");
        const allowedItem = createRecommendationItem("rec-allowed", "Allowed recommendation");
        const freshItems = [createRecommendationItem("rec-fresh", "Fresh recommendation")];
        const baselineCacheKey = buildCacheKey(seedIds, [], 2);

        recordRecentRecommendations(window.localStorage, "guest", ["recent-1"]);
        recordCachedRecommendations(
            window.localStorage,
            "guest",
            baselineCacheKey,
            [blockedItem, allowedItem],
            Date.now() - (1000 * 60 * 3),
        );

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue(freshItems),
        });

        const { result } = renderHook(
            () => useRecommendations(seedIds, { enabled: true, matchCount: 2 }),
            { wrapper },
        );

        expect(result.current.data).toEqual([allowedItem]);
        expect(result.current.isFetching).toBe(true);

        await waitFor(() => expect(result.current.data).toEqual(freshItems));
    });
});

describe("useBatchContentItems", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });

    it("chunks large library requests into 50-item batch calls and preserves input order", async () => {
        const { useBatchContentItems } = await loadUseRecommendations();
        const wrapper = createWrapper();
        const ids = Array.from({ length: 55 }, (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`);

        fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? "{}")) as { ids?: string[] };
            const chunkIds = body.ids ?? [];

            return {
                ok: true,
                json: vi.fn().mockResolvedValue(
                    chunkIds.map((id) => createRecommendationItem(id, `Item ${id}`)),
                ),
            };
        });

        const { result } = renderHook(
            () => useBatchContentItems(ids, { enabled: true }),
            { wrapper },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")).ids.length)).toEqual([50, 5]);
        expect(result.current.data?.map((item) => item.id)).toEqual(ids);
    });

    it("keeps previous batch data filtered to the latest ids while a new batch loads", async () => {
        const { useBatchContentItems } = await loadUseRecommendations();
        const wrapper = createWrapper();
        const firstIds = ["item-1", "item-2"];
        const nextIds = ["item-2"];

        fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? "{}")) as { ids?: string[] };
            const chunkIds = body.ids ?? [];

            return {
                ok: true,
                json: vi.fn().mockResolvedValue(
                    chunkIds.map((id) => createRecommendationItem(id, `Item ${id}`)),
                ),
            };
        });

        const { result, rerender } = renderHook(
            ({ ids }) => useBatchContentItems(ids, { enabled: true }),
            {
                initialProps: { ids: firstIds },
                wrapper,
            },
        );

        await waitFor(() => expect(result.current.data?.map((item) => item.id)).toEqual(firstIds));

        rerender({ ids: nextIds });

        expect(result.current.data?.map((item) => item.id)).toEqual(nextIds);
        expect(result.current.isLoading).toBe(false);

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });
});

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((nextResolve) => {
        resolve = nextResolve;
    });

    return { promise, resolve };
}

describe("useBrowseRecommendations", () => {
    const fetchMock = vi.fn();
    const localStorageMock = createLocalStorageMock();

    beforeEach(() => {
        Object.defineProperty(window, "localStorage", {
            value: localStorageMock,
            configurable: true,
        });
        window.localStorage.clear();
        useReadingProgressMock.mockClear();
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });

    it("posts one browse-specific request without recommendation memory side effects", async () => {
        const { useBrowseRecommendations } = await loadUseRecommendations();
        const wrapper = createWrapper();
        const recentItem = createRecommendationItem("rec-1", "Recent recommendation");
        const libraryItem = createRecommendationItem("lib-1", "Library recommendation");

        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: vi.fn().mockResolvedValue({
                recentItems: [recentItem],
                libraryItems: [libraryItem],
            }),
        });

        const { result } = renderHook(
            () => useBrowseRecommendations({
                recentSeedId: "seed-recent",
                librarySeedIds: ["seed-library", "seed-library"],
                excludeIds: ["known-1", "known-1"],
                enabled: true,
                targetCount: 10,
            }),
            { wrapper },
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith("/api/recommendations/browse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                recentSeedId: "seed-recent",
                librarySeedIds: ["seed-library"],
                excludeIds: ["known-1"],
                targetCount: 10,
            }),
        });
        expect(result.current.data).toEqual({
            recentItems: [recentItem],
            libraryItems: [libraryItem],
        });
        expect(window.localStorage.getItem).not.toHaveBeenCalledWith(
            expect.stringContaining("recent_recommendations"),
        );
        expect(window.localStorage.setItem).not.toHaveBeenCalledWith(
            expect.stringContaining("flux_recommendation_cache_"),
            expect.any(String),
        );
        expect(window.localStorage.setItem).toHaveBeenCalledWith(
            "flux_browse_recommendation_cache_guest",
            expect.any(String),
        );
        expect(useReadingProgressMock).toHaveBeenCalled();
    });

    it("stays disabled until a recent or library seed is available", async () => {
        const { useBrowseRecommendations } = await loadUseRecommendations();
        const wrapper = createWrapper();

        const { result } = renderHook(
            () => useBrowseRecommendations({
                recentSeedId: null,
                librarySeedIds: [],
                excludeIds: [],
                enabled: true,
            }),
            { wrapper },
        );

        expect(result.current.fetchStatus).toBe("idle");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows cached browse recommendations immediately while refreshing in the background", async () => {
        const { useBrowseRecommendations } = await loadUseRecommendations();
        const wrapper = createWrapper();
        const cachedRecentItem = createRecommendationItem("cached-rec", "Cached recent recommendation");
        const cachedLibraryItem = createRecommendationItem("cached-lib", "Cached library recommendation");
        const freshRecentItem = createRecommendationItem("fresh-rec", "Fresh recent recommendation");
        const freshLibraryItem = createRecommendationItem("fresh-lib", "Fresh library recommendation");
        const deferredResponse = createDeferred<{
            ok: boolean;
            json: () => Promise<{
                recentItems: ContentItem[];
                libraryItems: ContentItem[];
            }>;
        }>();
        const cacheKey = JSON.stringify({
            recentSeedId: "seed-recent",
            librarySeedIds: ["seed-library"],
            excludeIds: ["known-1"],
            targetCount: 10,
            storageScope: "guest",
        });

        recordCachedBrowseRecommendations(
            window.localStorage,
            "guest",
            cacheKey,
            {
                recentItems: [cachedRecentItem],
                libraryItems: [cachedLibraryItem],
            },
        );
        fetchMock.mockReturnValueOnce(deferredResponse.promise);

        const { result } = renderHook(
            () => useBrowseRecommendations({
                recentSeedId: "seed-recent",
                librarySeedIds: ["seed-library"],
                excludeIds: ["known-1"],
                enabled: true,
                targetCount: 10,
            }),
            { wrapper },
        );

        expect(result.current.data).toEqual({
            recentItems: [cachedRecentItem],
            libraryItems: [cachedLibraryItem],
        });
        expect(result.current.isFetching).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        deferredResponse.resolve({
            ok: true,
            json: vi.fn().mockResolvedValue({
                recentItems: [freshRecentItem],
                libraryItems: [freshLibraryItem],
            }),
        });

        await waitFor(() => expect(result.current.data).toEqual({
            recentItems: [freshRecentItem],
            libraryItems: [freshLibraryItem],
        }));
    });
});
