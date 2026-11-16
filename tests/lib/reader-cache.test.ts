import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ entries: new Map<string, { value: { item: unknown; checkedAt: number }; tags: string[] }>(), pending: [] as Promise<unknown>[], background: true, query: vi.fn(), invalidated: vi.fn(), publicClient: vi.fn() }));
vi.mock("next/cache", () => ({
    unstable_cache: (fn: (...args: string[]) => Promise<{ item: unknown; checkedAt: number }>, keys: string[], options: { tags: string[] }) => async (...args: string[]) => {
        const key = JSON.stringify([keys, args]), entry = mocks.entries.get(key);
        if (entry) {
            if (mocks.background && Date.now() - entry.value.checkedAt >= 60_000) mocks.pending.push(fn(...args).then(value => { mocks.entries.set(key, { value, tags: options.tags }); }).catch(() => {}));
            return entry.value;
        }
        const value = await fn(...args); mocks.entries.set(key, { value, tags: options.tags }); return value;
    },
    revalidatePath: vi.fn(),
    revalidateTag: (tag: string, profile: unknown) => { mocks.invalidated(tag, profile); for (const [key, entry] of mocks.entries) if (entry.tags.includes(tag)) mocks.entries.delete(key); },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("Private session must not enter the public cache"); } }));
vi.mock("@/lib/supabase/public-server", () => ({ createPublicServerClient: mocks.publicClient }));
import { getReadPageData } from "@/lib/server/public-content";
import { revalidateContentCreated, revalidateContentUpdated, revalidateContentDeleted, revalidateContentBulkChanged, revalidateNarrationContentChanged, revalidateSeriesAdminSurfaces, revalidateReplacementRoutes } from "@/lib/server/revalidation";
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = (overrides = {}) => ({ id, type: "article", title: "Published public title", status: "verified", source_url: null, quick_mode_json: null, duration_seconds: 60, author: "Public author", cover_image_url: null, category: null, audio_url: null, series_id: null, series_order: null, created_at: "2026-01-01", updated_at: "2026-11-16", reading_revision: "revision-one", segments: [{ id: "active", item_id: id, order_index: 1, title: "Public section", markdown_body: "Public text", deleted_at: null }, { id: "deleted", item_id: id, order_index: 0, title: "Removed section", markdown_body: "Removed text", deleted_at: "2026-11-15" }], artifacts: [{ id: "template", type: "checklist", payload_schema: { items: [] }, version: 1 }], ...overrides });
function publicClient() {
    return { from: (table: string) => ({ select: (select: string, options?: { head?: boolean }) => {
        const filters: Record<string, unknown> = {}, builder: Record<string, unknown> = {};
        for (const method of ["eq", "is", "lt", "gt", "order", "limit"]) builder[method] = (key: string, value: unknown) => { filters[method + ":" + key] = value; return builder; };
        const execute = () => mocks.query({ table, select, options, filters });
        builder.single = execute; builder.maybeSingle = execute;
        builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject);
        return builder;
    } }) };
}
beforeEach(() => {
    mocks.entries.clear(); mocks.pending = []; mocks.background = true; mocks.query.mockReset(); mocks.invalidated.mockClear(); mocks.publicClient.mockReset().mockImplementation(publicClient);
    mocks.query.mockImplementation(() => ({ data: row(), error: null })); vi.useFakeTimers(); vi.setSystemTime(1000);
});
afterEach(async () => { await Promise.all(mocks.pending); vi.useRealTimers(); vi.unstubAllEnvs(); });
describe("public Reader caching", () => {
    it("reuses public data across visits and strips account fields and removed segments", async () => {
        mocks.query.mockResolvedValue({ data: row({ progress: "PRIVATE-A", note_body: "PRIVATE-B", user_id: "private-account", highlights: ["PRIVATE-A"] }), error: null });
        const first = await getReadPageData(id); const next = await getReadPageData(id.toUpperCase());
        expect(next).toEqual(first); expect(mocks.query).toHaveBeenCalledTimes(1);
        expect(next?.segments.map(x => x.id)).toEqual(["active"]); expect(next?.artifacts[0].id).toBe("template");
        expect(next).toMatchObject({ reading_revision: "revision-one", created_at: "2026-01-01", updated_at: "2026-11-16" });
        expect(JSON.stringify([...mocks.entries.values()])).not.toContain("PRIVATE-");
        expect(JSON.stringify([...mocks.entries.values()])).not.toContain("private-account");
        const request = mocks.query.mock.calls[0][0];
        expect(request.filters).toMatchObject({ "eq:id": id, "eq:status": "verified", "is:deleted_at": null });
        expect(request.select).toContain("created_at, updated_at"); expect(request.select).not.toMatch(/user_library|user_highlights|note_body/);
    });
    it("separates content IDs and Supabase projects, but ignores incoming account state", async () => {
        await getReadPageData(id); await getReadPageData(second);
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://other-project.example.test"); await getReadPageData(id);
        expect(mocks.query).toHaveBeenCalledTimes(3);
    });
    it("does not query or cache malformed identifiers", async () => {
        expect(await getReadPageData("not-an-id")).toBeNull(); expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.entries.size).toBe(0);
    });
    it.each(["create", "update", "delete", "bulk", "narration", "series", "replacement"])("hard-invalidates cached public data after %s", async kind => {
        await getReadPageData(id); mocks.query.mockResolvedValue({ data: kind === "delete" ? null : row({ title: "Fresh title", reading_revision: "revision-two" }), error: null });
        if (kind === "create") revalidateContentCreated({ id });
        if (kind === "update") revalidateContentUpdated({ id });
        if (kind === "delete") revalidateContentDeleted({ id });
        if (kind === "bulk") revalidateContentBulkChanged({ items: [{ id }] });
        if (kind === "narration") revalidateNarrationContentChanged([{ id }]);
        if (kind === "series") revalidateSeriesAdminSurfaces(["new-slug", "old-slug"]);
        if (kind === "replacement") revalidateReplacementRoutes();
        const result = await getReadPageData(id); expect(result?.title ?? null).toBe(kind === "delete" ? null : "Fresh title");
        expect(mocks.query).toHaveBeenCalledTimes(2); expect(mocks.invalidated).toHaveBeenCalledWith("public-reader-v1", { expire: 0 });
    });
    it("makes a previously missing item visible immediately after publishing", async () => {
        mocks.query.mockResolvedValueOnce({ data: null, error: null }); expect(await getReadPageData(id)).toBeNull();
        revalidateContentUpdated({ id }); expect((await getReadPageData(id))?.title).toBe("Published public title");
    });
    it("waits at the exact expiration boundary and reuses the framework refresh", async () => {
        await getReadPageData(id); vi.setSystemTime(60_999); await getReadPageData(id); expect(mocks.query).toHaveBeenCalledTimes(1);
        vi.setSystemTime(61_000); const deferred = Promise.withResolvers<{ data: null; error: null }>(); mocks.query.mockReturnValue(deferred.promise);
        const lookup = getReadPageData(id); let settled = false; void lookup.then(() => { settled = true; });
        await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(2)); expect(settled).toBe(false); deferred.resolve({ data: null, error: null });
        expect(await lookup).toBeNull(); await Promise.all(mocks.pending); expect(await getReadPageData(id)).toBeNull(); expect(mocks.query).toHaveBeenCalledTimes(2);
    });
    it("refreshes an expired value when the framework does not start a refresh", async () => {
        await getReadPageData(id); mocks.background = false; vi.setSystemTime(61_000); mocks.query.mockResolvedValue({ data: null, error: null });
        expect(await getReadPageData(id)).toBeNull(); expect(mocks.query).toHaveBeenCalledTimes(2);
    });
    it("does not cache database failures as missing, or return expired content during failures", async () => {
        mocks.query.mockResolvedValueOnce({ data: null, error: new Error("database unavailable") }); await expect(getReadPageData(id)).rejects.toThrow("database unavailable");
        expect((await getReadPageData(id))?.id).toBe(id); vi.setSystemTime(61_000); mocks.query.mockResolvedValue({ data: null, error: new Error("database unavailable") });
        await expect(getReadPageData(id)).rejects.toThrow("database unavailable");
    });
    it("does not cache incomplete series context on an upstream failure", async () => {
        mocks.query.mockImplementation(({ table, select }) => select.includes("reading_revision") ? { data: row({ series_id: "series", series_order: 2 }), error: null } : { data: table === "content_series" ? null : [], error: new Error("series unavailable") });
        await expect(getReadPageData(id)).rejects.toThrow("series unavailable"); expect(mocks.entries.size).toBe(0);
    });
});
