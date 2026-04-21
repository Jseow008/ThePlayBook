import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/narration/reset/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { resetStaleNarrationProcessingJobs } from "@/lib/server/narration-processor";
import { rateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

vi.mock("@/lib/server/narration-processor", () => ({
    resetStaleNarrationProcessingJobs: vi.fn(),
}));

describe("Admin narration reset API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (verifyAdminSession as any).mockResolvedValue(true);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        (resetStaleNarrationProcessingJobs as any).mockResolvedValue({
            resetCount: 1,
            jobs: [
                {
                    id: "11111111-1111-1111-1111-111111111111",
                    title: "The Singapore Story",
                    author: "Lee Kuan Yew",
                    requestedAt: "2026-04-10T10:18:24.891Z",
                    startedAt: "2026-04-10T10:18:25.116Z",
                    ageMs: 172800000,
                    isStale: true,
                },
            ],
        });
    });

    it("resets stale processing jobs for an authenticated admin", async () => {
        const req = new NextRequest("http://localhost/api/admin/narration/reset", {
            method: "POST",
            body: JSON.stringify({
                jobIds: ["11111111-1111-1111-1111-111111111111"],
            }),
            headers: {
                "Content-Type": "application/json",
            },
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(rateLimit).toHaveBeenCalledWith(req, expect.objectContaining({
            limit: 10,
            windowMs: 60_000,
            key: "reset",
        }));
        expect(resetStaleNarrationProcessingJobs).toHaveBeenCalledWith(
            expect.any(String),
            ["11111111-1111-1111-1111-111111111111"]
        );
        expect(json.data.resetCount).toBe(1);
    });

    it("rejects invalid reset payloads", async () => {
        const req = new NextRequest("http://localhost/api/admin/narration/reset", {
            method: "POST",
            body: JSON.stringify({
                jobIds: ["not-a-uuid"],
            }),
            headers: {
                "Content-Type": "application/json",
            },
        });

        const res = await POST(req);

        expect(res.status).toBe(400);
        expect(resetStaleNarrationProcessingJobs).not.toHaveBeenCalled();
    });
});
