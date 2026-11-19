import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLibraryForHydration } from "./live-library-client";
import { fetchCompleteLibrarySnapshot } from "./account-data-client";

vi.mock("./account-data-client", async (original) => ({
    ...await original<typeof import("./account-data-client")>(),
    fetchCompleteLibrarySnapshot: vi.fn(),
}));
const signal = new AbortController().signal;
const onBuilding = vi.fn();
function page(last: boolean, revision = 3, accountId = "a") {
    return Response.json({ accountId, boundary: { resetEpoch: 1, boundaryLibraryRevision: revision },
        data: [{ content_id: last ? "e643ba39-a765-40d9-a034-105de43cf31c" : "3f064112-2ff5-46bc-9017-e16fed26cc68", is_bookmarked: true, progress: null }],
        pageInfo: { hasNextPage: !last, endCursor: last ? null : "next" } });
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("fresh-session library hydration", () => {
    it("reads every live page without requesting a snapshot", async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(page(false)).mockResolvedValueOnce(page(true));
        vi.stubGlobal("fetch", fetcher);
        const result = await fetchLibraryForHydration("a", "key", onBuilding, signal);
        expect(result.records).toHaveLength(2);
        expect(fetcher.mock.calls[1][0]).toContain("cursor=next");
        expect(fetchCompleteLibrarySnapshot).not.toHaveBeenCalled();
    });
    it("discards a mixed revision and uses the immutable snapshot", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page(false)).mockResolvedValueOnce(page(true, 4)));
        await fetchLibraryForHydration("a", "key", onBuilding, signal);
        expect(fetchCompleteLibrarySnapshot).toHaveBeenCalledWith("key", onBuilding, signal);
    });
    it("rejects pages from a changed session", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(page(false)).mockResolvedValueOnce(page(true, 3, "b")));
        await expect(fetchLibraryForHydration("a", "key", onBuilding, signal)).rejects.toThrow("account changed");
    });
});
