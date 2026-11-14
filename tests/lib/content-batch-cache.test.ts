import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ cache: new Map<string, { value: unknown; tags: string[] }>(), reads: vi.fn(), invalidate: vi.fn() }));
vi.mock("next/cache", () => ({
    unstable_cache: (fn: (...args: unknown[]) => unknown, keys: string[], options: {tags: string[]}) => async (...args: unknown[]) => {
        const key = JSON.stringify([keys, args]);
        if (mocks.cache.has(key)) return mocks.cache.get(key)!.value;
        const value = await fn(...args); mocks.cache.set(key, { value, tags: options.tags }); return value;
    },
    revalidatePath: vi.fn(),
    revalidateTag: (tag: string, profile: unknown) => { mocks.invalidate(tag, profile); for (const [key, entry] of mocks.cache) if (entry.tags.includes(tag)) mocks.cache.delete(key); },
}));
vi.mock("@/lib/supabase/public-server", () => ({ createPublicServerClient: () => ({ from: () => ({ select: () => ({ in: (_: string, ids: string[]) => ({ eq: () => ({ is: () => mocks.reads(ids) }) }) }) }) }) }));
import { getCachedContentBatch } from "@/lib/server/content-batch-cache";
import { revalidateContentCreated, revalidateContentUpdated, revalidateContentDeleted, revalidateContentBulkChanged, revalidateNarrationContentChanged } from "@/lib/server/revalidation";
beforeEach(() => { mocks.cache.clear(); mocks.reads.mockReset().mockImplementation(async (ids: string[]) => ({ data: ids.map(id => ({ id, title: "Old", quick_mode_json: {hook:"Hook",big_idea:"Private full summary"} })), error: null })); mocks.invalidate.mockClear(); vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => vi.useRealTimers());
describe("shared public batch cache", () => {
    it("canonicalizes IDs and reuses public projections across calls", async () => {
        expect((await getCachedContentBatch(["b", "a", "a"])).cache).toBe("miss");
        const hit = await getCachedContentBatch(["a", "b"]);
        expect(hit.cache).toBe("hit"); expect(mocks.reads).toHaveBeenCalledTimes(1);
        expect(hit.items[0].quick_mode_json).toEqual({ hook: "Hook" });
    });
    it.each(["create", "update", "delete", "bulk", "narration"])("hard-invalidates after %s", async kind => {
        await getCachedContentBatch(["a"]);
        mocks.reads.mockResolvedValue({ data: kind === "delete" ? [] : [{ id:"a", title:"New" }], error:null });
        if (kind === "create") revalidateContentCreated({id:"a"});
        if (kind === "update") revalidateContentUpdated({id:"a"});
        if (kind === "delete") revalidateContentDeleted({id:"a"});
        if (kind === "bulk") revalidateContentBulkChanged({items:[{id:"a"}]});
        if (kind === "narration") revalidateNarrationContentChanged([{id:"a"}]);
        const refreshed = await getCachedContentBatch(["a"]);
        expect(refreshed.cache).toBe("miss"); expect(mocks.invalidate).toHaveBeenCalledWith("search-catalog-v1", {expire:0});
        expect(refreshed.items).toEqual(kind === "delete" ? [] : [{ id:"a",title:"New",quick_mode_json:null }]);
    });
    it("does not serve expired content even if framework revalidation returns a stale entry", async () => {
        await getCachedContentBatch(["a"]); vi.setSystemTime(61_001);
        mocks.reads.mockResolvedValue({ data:[], error:null });
        expect(await getCachedContentBatch(["a"])).toMatchObject({items:[],cache:"refresh"});
    });
    it("never caches database failures or serves expired data during an outage", async () => {
        mocks.reads.mockResolvedValueOnce({data:null,error:new Error("DB down")});
        await expect(getCachedContentBatch(["a"])).rejects.toThrow("DB down");
        expect((await getCachedContentBatch(["a"])).cache).toBe("miss");
        vi.setSystemTime(61_001); mocks.reads.mockResolvedValue({data:null,error:new Error("DB down")});
        await expect(getCachedContentBatch(["a"])).rejects.toThrow("DB down");
    });
});
