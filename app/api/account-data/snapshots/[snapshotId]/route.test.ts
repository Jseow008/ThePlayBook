import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/account-data/snapshots/[snapshotId]/route";
import { getAccountDataSnapshotManifest } from "@/lib/server/account-data-snapshots";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";

vi.mock("@/lib/server/account-data-snapshot-auth", () => ({ getVerifiedAccountDataSession: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({
    AccountDataSnapshotError: class AccountDataSnapshotError extends Error {},
    getAccountDataSnapshotManifest: vi.fn(),
}));

describe("GET /api/account-data/snapshots/:snapshotId", () => {
    const snapshotId = "00000000-0000-4000-8000-000000000001";

    beforeEach(() => {
        vi.clearAllMocks();
        (getVerifiedAccountDataSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ accountId: "account-a", sessionId: "00000000-0000-4000-8000-000000000010" });
        (getAccountDataSnapshotManifest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ snapshotId, recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" });
    });

    it("returns only the manifest after binding the resume lookup to account and session", async () => {
        const response = await GET(new NextRequest(`http://localhost/api/account-data/snapshots/${snapshotId}`), {
            params: Promise.resolve({ snapshotId }),
        });

        expect(response.status).toBe(200);
        expect(getAccountDataSnapshotManifest).toHaveBeenCalledWith("account-a", snapshotId, "00000000-0000-4000-8000-000000000010");
        await expect(response.json()).resolves.toEqual({
            manifest: expect.objectContaining({ snapshotId }),
        });
    });

    it("does not reveal a resumable snapshot without a verified session", async () => {
        (getVerifiedAccountDataSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
        const response = await GET(new NextRequest(`http://localhost/api/account-data/snapshots/${snapshotId}`), {
            params: Promise.resolve({ snapshotId }),
        });

        expect(response.status).toBe(401);
        expect(getAccountDataSnapshotManifest).not.toHaveBeenCalled();
    });
});
