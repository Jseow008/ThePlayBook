import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCompleteLibrarySnapshot, LibrarySnapshotClientError } from "@/lib/account-data-client";

describe("library snapshot recovery", () => {
    beforeEach(() => vi.stubGlobal("crypto", webcrypto));
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("polls one building snapshot until ready without another creation request", async () => {
        vi.useFakeTimers();
        const snapshotId = "00000000-0000-4000-8000-000000000001";
        const manifest = {
            snapshotId, recordCount: 0, manifestHash: createHash("sha256").update("").digest("hex"),
            resetEpoch: 0, boundaryLibraryRevision: 38, expiresAt: "2030-01-01T00:00:00.000Z",
        };
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ state: "building", snapshotId }), { status: 202, headers: { "Retry-After": "1" } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ state: "building", snapshotId }), { status: 202, headers: { "Retry-After": "1" } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ state: "ready", manifest }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ manifest, data: [], pageInfo: { hasNextPage: false, endCursor: null } }), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const onBuilding = vi.fn();

        const result = fetchCompleteLibrarySnapshot("00000000-0000-4000-8000-000000000099", onBuilding);
        await vi.advanceTimersByTimeAsync(3000);

        await expect(result).resolves.toEqual({ manifest, records: [] });
        expect(onBuilding).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
            "/api/account-data/snapshots",
            `/api/account-data/snapshots/${snapshotId}`,
            `/api/account-data/snapshots/${snapshotId}`,
            expect.stringContaining(`/api/account-data/snapshots/${snapshotId}/user_library`),
        ]);
    });

    it("carries the server retry time on a rate-limited creation", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), {
            status: 429, headers: { "Retry-After": "120" },
        }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchCompleteLibrarySnapshot()).rejects.toMatchObject({
            code: "RATE_LIMITED", status: 429, retryAfterMs: 120_000,
        } satisfies Partial<LibrarySnapshotClientError>);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("keeps configuration failure distinct from a rate limit", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
            error: { code: "INTERNAL_ERROR", details: { snapshot_error: "CONFIGURATION" } },
        }), { status: 503 })));
        await expect(fetchCompleteLibrarySnapshot()).rejects.toMatchObject({ code: "CONFIGURATION", status: 503 });
    });
});
