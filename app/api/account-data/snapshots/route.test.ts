import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/account-data/snapshots/route";
import { createAccountDataSnapshot } from "@/lib/server/account-data-snapshots";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";

vi.mock("@/lib/server/account-data-snapshot-auth", () => ({ getVerifiedAccountDataSession: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({
    AccountDataSnapshotError: class AccountDataSnapshotError extends Error {},
    createAccountDataSnapshot: vi.fn(),
}));
vi.mock("@/lib/server/rate-limit", () => ({
    strictPublicRateLimit: vi.fn(),
    rateLimitFailureResponseWithTelemetry: vi.fn(() => new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), { status: 429 })),
}));

describe("POST /api/account-data/snapshots", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (getVerifiedAccountDataSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ accountId: "account-a", sessionId: "00000000-0000-4000-8000-000000000010" });
        (strictPublicRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    });

    it("does not create a snapshot before authentication", async () => {
        (getVerifiedAccountDataSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

        const response = await POST(new NextRequest("http://localhost/api/account-data/snapshots", { method: "POST" }));

        expect(response.status).toBe(401);
        expect(createAccountDataSnapshot).not.toHaveBeenCalled();
    });

    it("creates a server-owned complete snapshot for the authenticated account", async () => {
        (createAccountDataSnapshot as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            state: "ready",
            manifest: { snapshotId: "snapshot-a", recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" },
        });

        const response = await POST(new NextRequest("http://localhost/api/account-data/snapshots", {
            method: "POST",
            body: JSON.stringify({ idempotencyKey: "00000000-0000-4000-8000-000000000001" }),
        }));

        expect(response.status).toBe(201);
        expect(createAccountDataSnapshot).toHaveBeenCalledWith("account-a", "00000000-0000-4000-8000-000000000001", undefined, undefined);
        expect(strictPublicRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({
            limit: 6,
            key: "account-data-snapshot",
        }));
    });

    it("bounds snapshot creation per authenticated account", async () => {
        (strictPublicRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, retryAfterMs: 60_000 });

        const response = await POST(new NextRequest("http://localhost/api/account-data/snapshots", { method: "POST" }));

        expect(response.status).toBe(429);
        expect(createAccountDataSnapshot).not.toHaveBeenCalled();
    });

    it("accepts only the documented export collection names", async () => {
        (createAccountDataSnapshot as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            state: "ready",
            manifest: { snapshotId: "snapshot-export", recordCount: 2, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" },
        });

        const response = await POST(new NextRequest("http://localhost/api/account-data/snapshots", {
            method: "POST",
            body: JSON.stringify({
                idempotencyKey: "00000000-0000-4000-8000-000000000002",
                collections: ["user_library", "reflections"],
            }),
        }));

        expect(response.status).toBe(201);
        expect(createAccountDataSnapshot).toHaveBeenCalledWith(
            "account-a",
            "00000000-0000-4000-8000-000000000002",
            ["user_library", "reflections"],
            undefined,
        );
    });

    it("keeps a complete account export in a separately bounded account bucket", async () => {
        (createAccountDataSnapshot as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            state: "ready",
            manifest: { snapshotId: "snapshot-export", recordCount: 2, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" },
        });

        const response = await POST(new NextRequest("http://localhost/api/account-data/snapshots", {
            method: "POST",
            body: JSON.stringify({
                idempotencyKey: "00000000-0000-4000-8000-000000000003",
                collections: [
                    "preferences", "user_library", "highlights", "reflections", "reading_activity", "feedback",
                    "submitted_requests", "request_votes", "notification_preferences", "request_notifications", "ai_usage",
                ],
            }),
        }));

        expect(response.status).toBe(201);
        expect(strictPublicRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({
            limit: 2,
            key: "account-data-export-snapshot",
            identifier: "account-a",
        }));
        expect(createAccountDataSnapshot).toHaveBeenCalledWith(
            "account-a",
            "00000000-0000-4000-8000-000000000003",
            expect.any(Array),
            { resumeSessionId: "00000000-0000-4000-8000-000000000010" },
        );
    });
});
