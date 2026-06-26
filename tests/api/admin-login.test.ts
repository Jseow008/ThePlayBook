import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin-login/route";
import { createClient } from "@/lib/supabase/server";
import { RateLimitBackendUnavailableError, rateLimit } from "@/lib/server/rate-limit";
import { recordAdminAuthFailure, recordSecuritySignal } from "@/lib/server/security-telemetry";

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    RateLimitBackendUnavailableError: class RateLimitBackendUnavailableError extends Error { },
    rateLimit: vi.fn(),
}));

vi.mock("@/lib/server/security-telemetry", () => ({
    recordAdminAuthFailure: vi.fn(),
    recordSecuritySignal: vi.fn(),
}));

describe("Admin login API", () => {
    const signInWithPasswordMock = vi.fn();
    const signOutMock = vi.fn();
    const profileSingleMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            success: true,
            retryAfterMs: 0,
        });
        signInWithPasswordMock.mockResolvedValue({
            data: { user: { id: "admin-user" } },
            error: null,
        });
        signOutMock.mockResolvedValue({ error: null });
        profileSingleMock.mockResolvedValue({
            data: { role: "admin" },
            error: null,
        });
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            auth: {
                signInWithPassword: signInWithPasswordMock,
                signOut: signOutMock,
            },
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: profileSingleMock,
                    })),
                })),
            })),
        });
    });

    function adminLoginRequest(body: unknown) {
        return new NextRequest("http://localhost/api/admin-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    it("signs in admin users", async () => {
        const response = await POST(adminLoginRequest({
            email: "admin@example.com",
            password: "correct-password",
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
        expect(rateLimit).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({
            limit: 5,
            windowMs: 600_000,
            key: "admin-login",
        }));
        expect(signInWithPasswordMock).toHaveBeenCalledWith({
            email: "admin@example.com",
            password: "correct-password",
        });
        expect(signOutMock).not.toHaveBeenCalled();
        expect(recordAdminAuthFailure).not.toHaveBeenCalled();
    });

    it("records invalid credential failures without logging credentials", async () => {
        signInWithPasswordMock.mockResolvedValueOnce({
            data: { user: null },
            error: { message: "Invalid login credentials" },
        });

        const response = await POST(adminLoginRequest({
            email: "admin@example.com",
            password: "wrong-password",
        }));

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: "INVALID_LOGIN",
                message: "Invalid email or password.",
            },
        });
        expect(recordAdminAuthFailure).toHaveBeenCalledWith(expect.objectContaining({
            route: "/api/admin-login",
            reason: "admin_login_invalid_credentials",
        }));
        expect(JSON.stringify(vi.mocked(recordAdminAuthFailure).mock.calls)).not.toContain("wrong-password");
        expect(JSON.stringify(vi.mocked(recordAdminAuthFailure).mock.calls)).not.toContain("admin@example.com");
    });

    it("records missing user after successful credential exchange", async () => {
        signInWithPasswordMock.mockResolvedValueOnce({
            data: { user: null },
            error: null,
        });

        const response = await POST(adminLoginRequest({
            email: "admin@example.com",
            password: "password",
        }));

        expect(response.status).toBe(401);
        expect(recordAdminAuthFailure).toHaveBeenCalledWith(expect.objectContaining({
            route: "/api/admin-login",
            reason: "admin_login_missing_user",
        }));
    });

    it("signs out and records users without admin profiles", async () => {
        profileSingleMock.mockResolvedValueOnce({
            data: null,
            error: { code: "PGRST116" },
        });

        const response = await POST(adminLoginRequest({
            email: "reader@example.com",
            password: "password",
        }));

        expect(response.status).toBe(403);
        expect(signOutMock).toHaveBeenCalledTimes(1);
        expect(recordAdminAuthFailure).toHaveBeenCalledWith(expect.objectContaining({
            route: "/api/admin-login",
            reason: "admin_login_missing_profile",
            userId: "admin-user",
        }));
    });

    it("signs out and records non-admin users", async () => {
        profileSingleMock.mockResolvedValueOnce({
            data: { role: "reader" },
            error: null,
        });

        const response = await POST(adminLoginRequest({
            email: "reader@example.com",
            password: "password",
        }));

        expect(response.status).toBe(403);
        expect(signOutMock).toHaveBeenCalledTimes(1);
        expect(recordAdminAuthFailure).toHaveBeenCalledWith(expect.objectContaining({
            route: "/api/admin-login",
            reason: "admin_login_not_admin",
            userId: "admin-user",
        }));
    });

    it("rate limits repeated attempts before calling Supabase Auth", async () => {
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            success: false,
            retryAfterMs: 30_000,
        });

        const response = await POST(adminLoginRequest({
            email: "admin@example.com",
            password: "password",
        }));

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("30");
        expect(signInWithPasswordMock).not.toHaveBeenCalled();
        expect(recordSecuritySignal).toHaveBeenCalledWith(expect.objectContaining({
            signal: "admin_auth_failure",
            category: "admin",
            route: "/api/admin-login",
            reason: "admin_login_rate_limited",
            metadata: expect.objectContaining({
                limit: 5,
                blocked_window: 600_000,
                reset_after_seconds: 30,
            }),
        }));
    });

    it("fails closed when admin login rate limiting is unavailable", async () => {
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new RateLimitBackendUnavailableError("redis unavailable"),
        );

        const response = await POST(adminLoginRequest({
            email: "admin@example.com",
            password: "password",
        }));

        expect(response.status).toBe(503);
        expect(response.headers.get("Retry-After")).toBe("60");
        expect(signInWithPasswordMock).not.toHaveBeenCalled();
        expect(recordSecuritySignal).toHaveBeenCalledWith(expect.objectContaining({
            signal: "admin_auth_failure",
            category: "admin",
            route: "/api/admin-login",
            reason: "admin_login_rate_limit_unavailable",
        }));
    });
});
