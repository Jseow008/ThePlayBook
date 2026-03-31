import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/monitor/exceptions/route";
import { reportException } from "@/lib/server/error-reporting";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/server/error-reporting", () => ({
    reportException: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    bestEffortRateLimit: vi.fn(),
}));

describe("Client exception monitor API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (bestEffortRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
        });
        (reportException as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            configured: true,
            delivered: true,
        });
    });

    it("accepts a valid client exception payload", async () => {
        const req = new NextRequest(new URL("http://localhost/api/monitor/exceptions"), {
            method: "POST",
            headers: {
                "user-agent": "Vitest Browser",
            },
            body: JSON.stringify({
                boundary: "app-error-boundary",
                digest: "digest-123",
                message: "render failed",
                name: "TypeError",
                pathname: "/browse",
                href: "http://localhost/browse",
                stack: "TypeError: render failed",
            }),
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(202);
        expect(json.ok).toBe(true);
        expect(reportException).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "app-error-boundary",
                digest: "digest-123",
                pathname: "/browse",
                url: "http://localhost/browse",
                context: expect.objectContaining({
                    client_error_name: "TypeError",
                    user_agent: "Vitest Browser",
                }),
            })
        );
    });

    it("rejects an invalid payload", async () => {
        const req = new NextRequest(new URL("http://localhost/api/monitor/exceptions"), {
            method: "POST",
            body: JSON.stringify({
                boundary: "unknown-boundary",
                message: "",
            }),
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(reportException).not.toHaveBeenCalled();
    });

    it("returns 429 when the monitor route is throttled", async () => {
        (bestEffortRateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            success: false,
            retryAfterMs: 1_500,
        });

        const req = new NextRequest(new URL("http://localhost/api/monitor/exceptions"), {
            method: "POST",
            body: JSON.stringify({
                boundary: "global-error-boundary",
                digest: null,
                message: "critical render failed",
                name: "Error",
                pathname: "/",
                href: "http://localhost/",
                stack: null,
            }),
        });

        const res = await POST(req);

        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("2");
        expect(reportException).not.toHaveBeenCalled();
    });
});
