import { beforeEach, describe, expect, it, vi } from "vitest";

const { cacheStore, cacheOptions, fromMock, rpcMock, statsMock, recentResult } = vi.hoisted(() => ({
    cacheStore: new Map<string, unknown>(),
    cacheOptions: [] as Array<{ revalidate?: number; tags?: string[] }>,
    fromMock: vi.fn(),
    rpcMock: vi.fn(),
    statsMock: vi.fn(),
    recentResult: { current: { data: [] as Array<{ id: string }>, count: 0 as number | null, error: null as Error | null } },
}));

vi.mock("next/cache", () => ({
    unstable_cache: <TArgs extends unknown[], TResult>(
        read: (...args: TArgs) => Promise<TResult>,
        keyParts: string[],
        options: { revalidate?: number; tags?: string[] },
    ) => {
        cacheOptions.push(options);
        return async (...args: TArgs): Promise<TResult> => {
            const key = JSON.stringify([keyParts, args]);
            if (cacheStore.has(key)) {
                return cacheStore.get(key) as TResult;
            }
            const value = await read(...args);
            cacheStore.set(key, value);
            return value;
        };
    },
}));

vi.mock("@/lib/server/public-content", () => ({
    getCategoryStats: statsMock,
}));

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: () => ({
        rpc: rpcMock,
        from: fromMock,
    }),
}));

import { getPopularCatalogItems, getRecentCatalogPage, getSearchCategoryStats } from "@/lib/server/search-catalog";

function queryBuilder() {
    const builder = {
        select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn(), range: vi.fn(),
        then: vi.fn(),
    };
    for (const method of ["select", "eq", "in", "is", "order", "range"] as const) {
        builder[method].mockReturnValue(builder);
    }
    builder.then.mockImplementation((resolve: (value: typeof recentResult.current) => unknown) =>
        Promise.resolve(resolve(recentResult.current)));
    return builder;
}

describe("Search catalog data cache", () => {
    beforeEach(() => {
        cacheStore.clear();
        fromMock.mockReset().mockImplementation(() => queryBuilder());
        rpcMock.mockReset().mockResolvedValue({ data: [{ id: "popular" }], error: null });
        statsMock.mockReset().mockResolvedValue([{ category: "Business", count: 1 }]);
        recentResult.current = { data: [{ id: "recent" }], count: 1, error: null };
    });

    it("uses one-hour tagged entries for all three Search reads", async () => {
        expect(cacheOptions).toHaveLength(3);
        expect(cacheOptions).toEqual(Array(3).fill({ revalidate: 3600, tags: ["search-catalog-v1"] }));
        await getSearchCategoryStats();
        await getSearchCategoryStats();
        expect(statsMock).toHaveBeenCalledTimes(1);
    });

    it("reuses page-one Newest by normalized filters while later pages stay live", async () => {
        await getRecentCatalogPage({ categoryValues: ["Business", "'Business'"], type: "book", page: 1 });
        await getRecentCatalogPage({ categoryValues: ["'Business'", "Business"], type: "book", page: 1 });
        expect(fromMock).toHaveBeenCalledTimes(1);

        await getRecentCatalogPage({ categoryValues: ["Business"], type: "book", page: 1 });
        await getRecentCatalogPage({ categoryValues: ["Business"], type: "podcast", page: 1 });
        expect(fromMock).toHaveBeenCalledTimes(3);

        await getRecentCatalogPage({ categoryValues: ["Business"], type: "book", page: 2 });
        await getRecentCatalogPage({ categoryValues: ["Business"], type: "book", page: 2 });
        expect(fromMock).toHaveBeenCalledTimes(5);
    });

    it("keeps Popular filter keys separate and caches legitimate empty results", async () => {
        recentResult.current = { data: [], count: 0, error: null };
        expect(await getRecentCatalogPage({ categoryValues: ["Science"], page: 1 })).toMatchObject({ items: [], totalItems: 0 });
        await getRecentCatalogPage({ categoryValues: ["Science"], page: 1 });
        expect(fromMock).toHaveBeenCalledTimes(1);

        rpcMock.mockResolvedValue({ data: [], error: null });
        expect(await getPopularCatalogItems({ categoryValues: ["Business"], type: "book" })).toEqual([]);
        expect(await getPopularCatalogItems({ categoryValues: ["Business"], type: "book" })).toEqual([]);
        expect(rpcMock).toHaveBeenCalledTimes(1);
        await getPopularCatalogItems({ categoryValues: ["Business"], type: "podcast" });
        expect(rpcMock).toHaveBeenCalledTimes(2);
    });

    it("does not cache a failed database read", async () => {
        recentResult.current = { data: [], count: null, error: new Error("temporary catalog failure") };
        await expect(getRecentCatalogPage({ page: 1 })).rejects.toThrow("temporary catalog failure");
        recentResult.current = { data: [{ id: "recovered" }], count: 1, error: null };
        await expect(getRecentCatalogPage({ page: 1 })).resolves.toMatchObject({ totalItems: 1 });
        expect(fromMock).toHaveBeenCalledTimes(2);

        rpcMock.mockResolvedValueOnce({ data: null, error: new Error("temporary popular failure") });
        await expect(getPopularCatalogItems({})).rejects.toThrow("temporary popular failure");
        await getPopularCatalogItems({});
        expect(rpcMock).toHaveBeenCalledTimes(2);

        statsMock.mockRejectedValueOnce(new Error("temporary stats failure"));
        await expect(getSearchCategoryStats()).rejects.toThrow("temporary stats failure");
        await getSearchCategoryStats();
        expect(statsMock).toHaveBeenCalledTimes(2);
    });
});
