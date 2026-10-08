import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/account-data/snapshots/[snapshotId]/route";
import { AccountDataSnapshotError, getAccountDataSnapshotManifest, getLibrarySnapshotStatus } from "@/lib/server/account-data-snapshots";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";

vi.mock("@/lib/server/account-data-snapshot-auth", () => ({ getVerifiedAccountDataSession: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({
    AccountDataSnapshotError: class AccountDataSnapshotError extends Error {
        constructor(readonly code: string, message: string) { super(message); }
    },
    getAccountDataSnapshotManifest: vi.fn(),
    getLibrarySnapshotStatus: vi.fn(),
}));

describe("GET /api/account-data/snapshots/:snapshotId", () => {
    const snapshotId = "00000000-0000-4000-8000-000000000001";

    beforeEach(() => {
        vi.clearAllMocks();
        (getVerifiedAccountDataSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ accountId: "account-a", sessionId: "00000000-0000-4000-8000-000000000010" });
        (getAccountDataSnapshotManifest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ snapshotId, recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" });
        vi.mocked(getLibrarySnapshotStatus).mockRejectedValue(new AccountDataSnapshotError("NOT_FOUND", "Not a library-only snapshot"));
    });

    it("checks the existing library snapshot while it is building without creating another one", async () => {
        vi.mocked(getLibrarySnapshotStatus).mockResolvedValueOnce({ state: "building", snapshotId });
        const response = await GET(new NextRequest(`http://localhost/api/account-data/snapshots/${snapshotId}`), {
            params: Promise.resolve({ snapshotId }),
        });
        expect(response.status).toBe(202);
        expect(response.headers.get("Retry-After")).toBe("1");
        expect(getLibrarySnapshotStatus).toHaveBeenCalledWith("account-a", snapshotId);
        expect(getAccountDataSnapshotManifest).not.toHaveBeenCalled();
    });

    it("returns a completed library snapshot without an export session", async () => {
        const manifest = { snapshotId, recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 38, expiresAt: "2030-01-01T00:00:00.000Z" };
        vi.mocked(getLibrarySnapshotStatus).mockResolvedValueOnce({ state: "ready", manifest });
        const response = await GET(new NextRequest(`http://localhost/api/account-data/snapshots/${snapshotId}`), {
            params: Promise.resolve({ snapshotId }),
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ state: "ready", manifest });
        expect(getAccountDataSnapshotManifest).not.toHaveBeenCalled();
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
