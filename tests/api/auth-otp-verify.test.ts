import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/otp/verify/route";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { createClient } from "@/lib/supabase/server";
import { resolvePostAuthDestination } from "@/lib/auth-activation";

vi.mock("@/lib/server/analytics", () => ({
    captureServerAnalyticsEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("@/lib/auth-activation", () => ({
    resolvePostAuthDestination: vi.fn(),
}));

describe("POST /api/auth/otp/verify", () => {
    const verifyOtp = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        verifyOtp.mockResolvedValue({
            data: {
                user: { id: "user-1", created_at: new Date().toISOString() },
                session: null,
            },
            error: null,
        });
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: { verifyOtp } });
        (captureServerAnalyticsEvent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (resolvePostAuthDestination as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("/welcome?next=%2Fnotes%3Fask%3D1");
    });

    it("verifies an email code, records a new signup, and returns a safe redirect", async () => {
        const response = await POST(new Request("http://localhost/api/auth/otp/verify", {
            method: "POST",
            body: JSON.stringify({ email: " reader@example.com ", token: "123456", next: "/notes?ask=1" }),
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ next: "/welcome?next=%2Fnotes%3Fask%3D1" });
        expect(verifyOtp).toHaveBeenCalledWith({ email: "reader@example.com", token: "123456", type: "email" });
        expect(captureServerAnalyticsEvent).toHaveBeenCalledWith(expect.objectContaining({
            event: "signup_completed",
            distinctId: "user-1",
            properties: expect.objectContaining({ auth_method: "email" }),
        }));
    });

    it("does not return Supabase errors to the browser", async () => {
        verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: new Error("Token expired") });

        const response = await POST(new Request("http://localhost/api/auth/otp/verify", {
            method: "POST",
            body: JSON.stringify({ email: "reader@example.com", token: "123456" }),
        }));

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: "That code is invalid or has expired. Please try again." });
    });
});
