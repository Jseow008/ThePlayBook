import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedContentBatch, fetchContentBatch, invalidateContentRecords } from "@/lib/content-record-cache";
import type { ContentItem } from "@/types/database";
const item = (id: string, title = id) => ({ id, title } as ContentItem);
let client: QueryClient;
const signal = () => new AbortController().signal;
beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.useFakeTimers(); vi.setSystemTime(1000);
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => Response.json(JSON.parse(init.body as string).ids.map((id: string) => item(id)))));
});
afterEach(() => { client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("shared public content records", () => {
    it("does not add a browser lifetime to an already aged server result", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(Response.json([item("a")], { headers: { "X-Content-Fresh-For": "1000" } }));
        const result = await fetchContentBatch(client, ["a"], signal());
        expect(result.expiresAt).toBe(2000);
        vi.setSystemTime(2001);
        expect(cachedContentBatch(client, ["a"])).toBeUndefined();
        await fetchContentBatch(client, ["a"], signal());
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it("reuses overlapping lists and fetches only missing records", async () => {
        await fetchContentBatch(client, ["a", "b"], signal());
        const next = await fetchContentBatch(client, ["b", "c"], signal());
        expect(next.items.map(x => x.id)).toEqual(["b", "c"]);
        expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).ids).toEqual(["c"]);
        await fetchContentBatch(client, ["a"], signal());
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it("does not extend freshness through overlapping batches", async () => {
        await fetchContentBatch(client, ["a"], signal());
        vi.setSystemTime(60_000);
        const next = await fetchContentBatch(client, ["a", "b"], signal());
        expect(next.expiresAt).toBe(61_000);
        vi.setSystemTime(61_001);
        await fetchContentBatch(client, ["a", "b"], signal());
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as string).ids).toEqual(["a"]);
    });
    it("remembers authoritative absence, but refresh can discover a new publication", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(Response.json([]));
        const absent = await fetchContentBatch(client, ["a"], signal());
        expect(absent.items).toEqual([]);
        client.setQueryData(["content-batch", ["a"]], absent);
        expect(cachedContentBatch(client, ["a"])?.items).toEqual([]);
        invalidateContentRecords(client, ["a"]);
        expect(cachedContentBatch(client, ["a"])).toBeUndefined();
        await fetchContentBatch(client, ["a"], signal());
        expect(client.getQueryData<{items: ContentItem[]}>(["content-batch", ["a"]])?.items.map(x => x.id)).toEqual(["a"]);
    });
    it("propagates changed metadata and removals to already cached lists", async () => {
        const old = await fetchContentBatch(client, ["a", "b"], signal());
        client.setQueryData(["content-batch", ["a", "b"]], old);
        vi.mocked(fetch).mockResolvedValueOnce(Response.json([item("a", "Updated")]));
        await fetchContentBatch(client, ["a", "b"], signal(), true);
        expect(client.getQueryData<{items: ContentItem[]}>(["content-batch", ["a", "b"]])?.items.map(x => x.title)).toEqual(["Updated"]);
    });
    it("does not install aborted or partially failed reads", async () => {
        const controller = new AbortController();
        vi.mocked(fetch).mockImplementationOnce(async () => { controller.abort(); return Response.json([item("a")]); });
        await expect(fetchContentBatch(client, ["a"], controller.signal)).rejects.toThrow();
        expect(cachedContentBatch(client, ["a"])).toBeUndefined();
        vi.mocked(fetch).mockResolvedValueOnce(Response.json([item("a")])).mockResolvedValueOnce(new Response(null, { status: 503 }));
        await expect(fetchContentBatch(client, Array.from({length:51},(_,i)=>String(i)), signal())).rejects.toThrow();
        expect(cachedContentBatch(client, ["0"])).toBeUndefined();
    });
    it("never replaces a newer result with an older delayed response", async () => {
        let resolve!: (r: Response) => void;
        vi.mocked(fetch).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        const older = fetchContentBatch(client, ["a"], signal());
        vi.mocked(fetch).mockResolvedValueOnce(Response.json([item("a", "New")]));
        await fetchContentBatch(client, ["a"], signal(), true);
        resolve(Response.json([item("a", "Old")]));
        expect((await older).items[0].title).toBe("New");
    });
    it("keeps public caches confined to the owning query client", async () => {
        await fetchContentBatch(client, ["a"], signal());
        const other = new QueryClient();
        expect(cachedContentBatch(other, ["a"])).toBeUndefined(); other.clear();
    });
});
