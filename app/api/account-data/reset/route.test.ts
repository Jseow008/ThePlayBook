import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/account-data/reset/route";
import { createClient } from "@/lib/supabase/server";
import { resetLibraryForAccount } from "@/lib/server/account-data-snapshots";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({ resetLibraryForAccount: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({
    strictPublicRateLimit: vi.fn(),
    rateLimitFailureResponseWithTelemetry: vi.fn(() => new Response(null, { status: 429 })),
}));

describe("POST /api/account-data/reset", () => {
    const getUser = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: { getUser } });
        getUser.mockResolvedValue({ data: { user: { id: "account-a" } } });
        (strictPublicRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });
        (resetLibraryForAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ resetEpoch: 2, currentRevision: 9 });
    });

    it("uses only the authenticated account when recording a reset epoch", async () => {
        const response = await POST(new NextRequest("http://localhost/api/account-data/reset", { method: "POST" }));
        expect(response.status).toBe(200);
        expect(resetLibraryForAccount).toHaveBeenCalledWith("account-a");
    });

    it("does not run a reset for an unauthenticated request", async () => {
        getUser.mockResolvedValue({ data: { user: null } });
        const response = await POST(new NextRequest("http://localhost/api/account-data/reset", { method: "POST" }));
        expect(response.status).toBe(401);
        expect(resetLibraryForAccount).not.toHaveBeenCalled();
    });
});
