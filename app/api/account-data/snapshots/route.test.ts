import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/account-data/snapshots/route";
import { createClient } from "@/lib/supabase/server";
import { createLibrarySnapshot } from "@/lib/server/account-data-snapshots";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({
    AccountDataSnapshotError: class AccountDataSnapshotError extends Error {},
    createLibrarySnapshot: vi.fn(),
}));
vi.mock("@/lib/server/rate-limit", () => ({
    strictPublicRateLimit: vi.fn(),
    rateLimitFailureResponseWithTelemetry: vi.fn(() => new Response(JSON.stringify({ error: { code: "RATE_LIMITED" } }), { status: 429 })),
}));

describe("POST /api/account-data/snapshots", () => {
    const getUser = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: { getUser } });
        getUser.mockResolvedValue({ data: { user: { id: "account-a" } } });
        (strictPublicRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
    });

    it("does not create a snapshot before authentication", async () => {
        getUser.mockResolvedValueOnce({ data: { user: null } });

        const response = await POST(new NextRequest("http://localhost/api/account-data/snapshots", { method: "POST" }));

        expect(response.status).toBe(401);
        expect(createLibrarySnapshot).not.toHaveBeenCalled();
    });

    it("creates a server-owned complete snapshot for the authenticated account", async () => {
        (createLibrarySnapshot as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            state: "ready",
            manifest: { snapshotId: "snapshot-a", recordCount: 1, manifestHash: "hash", resetEpoch: 0, boundaryLibraryRevision: 1, expiresAt: "2030-01-01T00:00:00.000Z" },
        });

        const response = await POST(new NextRequest("http://localhost/api/account-data/snapshots", {
            method: "POST",
            body: JSON.stringify({ idempotencyKey: "00000000-0000-4000-8000-000000000001" }),
        }));

        expect(response.status).toBe(201);
        expect(createLibrarySnapshot).toHaveBeenCalledWith("account-a", "00000000-0000-4000-8000-000000000001");
    });

    it("bounds snapshot creation per authenticated account", async () => {
        (strictPublicRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, retryAfterMs: 60_000 });

        const response = await POST(new NextRequest("http://localhost/api/account-data/snapshots", { method: "POST" }));

        expect(response.status).toBe(429);
        expect(createLibrarySnapshot).not.toHaveBeenCalled();
    });
});
