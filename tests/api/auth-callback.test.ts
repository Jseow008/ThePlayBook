import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/server/analytics", () => ({
    captureServerAnalyticsEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

describe("Auth callback redirects", () => {
    const originalEnv = { ...process.env };
    const exchangeCodeForSession = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = {
            ...originalEnv,
            NODE_ENV: "production",
            NEXT_PUBLIC_APP_URL: "https://app.netflux.example",
            NEXT_PUBLIC_SITE_URL: "https://www.netflux.example",
        };

        exchangeCodeForSession.mockResolvedValue({
            data: {
                user: {
                    id: "user-1",
                    created_at: "2020-01-01T00:00:00.000Z",
                },
                session: null,
            },
            error: null,
        });

        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            auth: {
                exchangeCodeForSession,
            },
        });
        (captureServerAnalyticsEvent as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    function buildRequest(headers: HeadersInit = {}) {
        return new Request("https://internal.vercel.app/auth/callback?code=abc&next=/settings", {
            headers,
        });
    }

    it("uses an allowed forwarded host for production redirects", async () => {
        const response = await GET(buildRequest({
            "x-forwarded-host": "app.netflux.example",
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://app.netflux.example/settings");
    });

    it("falls back to the canonical app origin for spoofed forwarded hosts", async () => {
        const response = await GET(buildRequest({
            "x-forwarded-host": "evil.example",
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://app.netflux.example/settings");
    });

    it("falls back to the canonical app origin for malformed forwarded hosts", async () => {
        const response = await GET(buildRequest({
            "x-forwarded-host": "app.netflux.example, evil.example",
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://app.netflux.example/settings");
    });

    it("keeps local development redirects on the request origin", async () => {
        process.env = {
            ...process.env,
            NODE_ENV: "development",
        };

        const response = await GET(new Request("http://localhost:3000/auth/callback?code=abc&next=/notes", {
            headers: {
                "x-forwarded-host": "app.netflux.example",
            },
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("http://localhost:3000/notes");
    });

    it("uses the site origin when it is the only configured production origin", async () => {
        delete process.env.NEXT_PUBLIC_APP_URL;

        const response = await GET(buildRequest({
            "x-forwarded-host": "www.netflux.example",
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://www.netflux.example/settings");
    });

    it("uses the app origin when it is the only configured production origin", async () => {
        delete process.env.NEXT_PUBLIC_SITE_URL;

        const response = await GET(buildRequest({
            "x-forwarded-host": "app.netflux.example",
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://app.netflux.example/settings");
    });

    it("fails closed in production when no configured auth redirect origin exists", async () => {
        delete process.env.NEXT_PUBLIC_APP_URL;
        delete process.env.NEXT_PUBLIC_SITE_URL;

        const response = await GET(buildRequest({
            "x-forwarded-host": "internal.vercel.app",
        }));
        const json = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get("location")).toBeNull();
        expect(json).toEqual({ error: "Auth redirect origin is not configured." });
        expect(exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it("fails closed in production when configured auth redirect origins are malformed", async () => {
        process.env.NEXT_PUBLIC_APP_URL = "not a url";
        process.env.NEXT_PUBLIC_SITE_URL = "also not a url";

        const response = await GET(buildRequest({
            "x-forwarded-host": "internal.vercel.app",
        }));
        const json = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get("location")).toBeNull();
        expect(json).toEqual({ error: "Auth redirect origin is not configured." });
        expect(exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it("uses the canonical app origin for auth error redirects in production", async () => {
        const response = await GET(new Request("https://internal.vercel.app/auth/callback", {
            headers: {
                "x-forwarded-host": "evil.example",
            },
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://app.netflux.example/login?error=AuthCodeError");
        expect(exchangeCodeForSession).not.toHaveBeenCalled();
    });
});
