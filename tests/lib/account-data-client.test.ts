import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCompleteLibrarySnapshot, LibrarySnapshotClientError } from "@/lib/account-data-client";

const manifestHash = createHash("sha256").update("one\ntwo").digest("hex");
const manifest = {
    snapshotId: "00000000-0000-4000-8000-000000000001",
    recordCount: 2,
    manifestHash,
    resetEpoch: 0,
    boundaryLibraryRevision: 2,
    expiresAt: "2030-01-01T00:00:00.000Z",
};

function response(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("complete library snapshot hydration", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("installs only a fully paged, exactly-once manifest", async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response({ state: "ready", manifest }, 201))
            .mockResolvedValueOnce(response({
                data: [{ ordinal: 1, payloadHash: "one", content_id: "a", is_bookmarked: true, progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: 2 }],
                manifest,
                pageInfo: { hasNextPage: true, endCursor: "next" },
            }))
            .mockResolvedValueOnce(response({
                data: [{ ordinal: 2, payloadHash: "two", content_id: "b", is_bookmarked: false, progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: 1 }],
                manifest,
                pageInfo: { hasNextPage: false, endCursor: "done" },
            }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchCompleteLibrarySnapshot()).resolves.toMatchObject({ manifest, records: [{ content_id: "a" }, { content_id: "b" }] });
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("rejects duplicate records even when a page claims completion", async () => {
        const duplicateManifest = { ...manifest, recordCount: 2 };
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce(response({ state: "ready", manifest: duplicateManifest }, 201))
            .mockResolvedValueOnce(response({
                data: [
                    { ordinal: 1, payloadHash: "one", content_id: "a", is_bookmarked: true, progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: 2 },
                    { ordinal: 2, payloadHash: "two", content_id: "a", is_bookmarked: false, progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: 1 },
                ],
                manifest: duplicateManifest,
                pageInfo: { hasNextPage: false, endCursor: null },
            })));

        await expect(fetchCompleteLibrarySnapshot()).rejects.toBeInstanceOf(LibrarySnapshotClientError);
    });

    it("traverses beyond the configured response cap without dropping timestamp ties", async () => {
        const records = Array.from({ length: 201 }, (_, index) => ({
            ordinal: index + 1,
            payloadHash: `record-${index + 1}`,
            content_id: `item-${index + 1}`,
            is_bookmarked: index % 2 === 0,
            progress: null,
            // Every record deliberately has the same timestamp.
            last_interacted_at: "2026-01-01T00:00:00.000Z",
            library_updated_at: "2026-01-01T00:00:00.000Z",
            library_revision: 201 - index,
        }));
        const largeManifest = {
            ...manifest,
            recordCount: records.length,
            manifestHash: createHash("sha256").update(records.map((record) => record.payloadHash).join("\n")).digest("hex"),
        };
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce(response({ state: "ready", manifest: largeManifest }, 201))
            .mockResolvedValueOnce(response({ data: records.slice(0, 200), manifest: largeManifest, pageInfo: { hasNextPage: true, endCursor: "page-2" } }))
            .mockResolvedValueOnce(response({ data: records.slice(200), manifest: largeManifest, pageInfo: { hasNextPage: false, endCursor: null } })));

        const result = await fetchCompleteLibrarySnapshot();

        expect(result.records).toHaveLength(201);
        expect(result.records.at(-1)?.content_id).toBe("item-201");
    });

    it("refuses to report success when traversal is interrupted", async () => {
        vi.stubGlobal("fetch", vi.fn()
            .mockResolvedValueOnce(response({ state: "ready", manifest }, 201))
            .mockResolvedValueOnce(response({
                data: [{ ordinal: 1, payloadHash: "one", content_id: "a", is_bookmarked: true, progress: null, last_interacted_at: null, library_updated_at: "2026-01-01T00:00:00.000Z", library_revision: 2 }],
                manifest,
                pageInfo: { hasNextPage: true, endCursor: null },
            })));

        await expect(fetchCompleteLibrarySnapshot()).rejects.toMatchObject({ code: "SNAPSHOT_INVALID" });
    });
});
