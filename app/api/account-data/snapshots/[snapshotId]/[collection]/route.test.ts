import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/account-data/snapshots/[snapshotId]/[collection]/route";
import { createClient } from "@/lib/supabase/server";
import { getAccountDataSnapshotPage, getLibrarySnapshotPage } from "@/lib/server/account-data-snapshots";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({
    LIBRARY_SNAPSHOT_COLLECTION: "user_library",
    AccountDataSnapshotError: class AccountDataSnapshotError extends Error {},
    getAccountDataSnapshotPage: vi.fn(),
    getLibrarySnapshotPage: vi.fn(),
}));

describe("GET /api/account-data/snapshots/:snapshotId/user_library", () => {
    const snapshotId = "00000000-0000-4000-8000-000000000001";
    const getUser = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ACCOUNT_DATA_CURSOR_SECRET = "test-secret";
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: { getUser } });
        getUser.mockResolvedValue({ data: { user: { id: "account-b" } } });
        (getLibrarySnapshotPage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            manifest: { snapshotId, recordCount: 0, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 0, expiresAt: "2030-01-01T00:00:00.000Z" },
            records: [],
            hasNextPage: false,
        });
        (getAccountDataSnapshotPage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            manifest: { snapshotId, recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 0, expiresAt: "2030-01-01T00:00:00.000Z" },
            records: [{ ordinal: 1, recordId: "reflection-a", payload: { id: "reflection-a", reflection_text: "Fixture" }, payloadHash: "hash" }],
            hasNextPage: false,
        });
    });

    it("binds snapshot reads to the authenticated account", async () => {
        const record = {
            ordinal: 1,
            payloadHash: "payload-hash",
            content_id: "00000000-0000-4000-8000-000000000010",
            is_bookmarked: true,
            progress: null,
            last_interacted_at: null,
            library_updated_at: "2026-09-14T09:00:00.123456+00",
            library_revision: 7,
        };
        (getLibrarySnapshotPage as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            manifest: { snapshotId, recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 7, expiresAt: "2030-01-01T00:00:00.000Z" },
            records: [record],
            hasNextPage: false,
        });
        const response = await GET(
            new NextRequest(`http://localhost/api/account-data/snapshots/${snapshotId}/user_library`),
            { params: Promise.resolve({ snapshotId, collection: "user_library" }) },
        );

        expect(response.status).toBe(200);
        expect(getLibrarySnapshotPage).toHaveBeenCalledWith("account-b", snapshotId, 0, 100);
        await expect(response.json()).resolves.toMatchObject({ data: [record] });
    });

    it("rejects a cursor that was not issued for this account and snapshot", async () => {
        const response = await GET(
            new NextRequest(`http://localhost/api/account-data/snapshots/${snapshotId}/user_library?cursor=forged.signature`),
            { params: Promise.resolve({ snapshotId, collection: "user_library" }) },
        );

        expect(response.status).toBe(400);
        expect(getLibrarySnapshotPage).not.toHaveBeenCalled();
    });

    it("returns generic export records only for an allowlisted collection", async () => {
        const response = await GET(
            new NextRequest(`http://localhost/api/account-data/snapshots/${snapshotId}/reflections`),
            { params: Promise.resolve({ snapshotId, collection: "reflections" }) },
        );

        expect(response.status).toBe(200);
        expect(getAccountDataSnapshotPage).toHaveBeenCalledWith("account-b", snapshotId, "reflections", 0, 100);
        await expect(response.json()).resolves.toMatchObject({
            data: [{ recordId: "reflection-a", payload: { reflection_text: "Fixture" } }],
        });
    });
});
