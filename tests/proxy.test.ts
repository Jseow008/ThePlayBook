import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";
import { config } from "@/proxy";
import { updateSession } from "@/lib/supabase/middleware";

const getUserMock = vi.fn();
const profileSingleMock = vi.fn();
const legacyMaybeSingleMock = vi.fn();

vi.mock("@/lib/supabase/middleware", () => ({
    updateSession: vi.fn(async (request: NextRequest) => NextResponse.next({ request })),
}));

vi.mock("@supabase/ssr", () => ({
    createServerClient: vi.fn(() => ({
        auth: {
            getUser: getUserMock,
        },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: profileSingleMock,
                })),
            })),
        })),
    })),
}));

vi.mock("@supabase/supabase-js", () => ({
    createClient: vi.fn(() => ({
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        is: vi.fn(() => ({
                            maybeSingle: legacyMaybeSingleMock,
                        })),
                    })),
                })),
            })),
        })),
    })),
}));

describe("proxy auth routing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        getUserMock.mockResolvedValue({ data: { user: null }, error: null });
        profileSingleMock.mockResolvedValue({ data: null, error: null });
        legacyMaybeSingleMock.mockResolvedValue({ data: null, error: null });
        process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
        delete process.env.ADMIN_ALLOWED_IPS;
        delete process.env.CRON_SECRET;
    });

    it("does not require an existing admin session to reach the admin login page", async () => {
        const response = await proxy(new NextRequest("http://localhost/admin-login"));

        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
        expect(getUserMock).not.toHaveBeenCalled();
    });

    it("redirects unauthenticated admin pages to the public login flow", async () => {
        const response = await proxy(new NextRequest("http://localhost/admin/content"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fadmin%2Fcontent");
        expect(getUserMock).toHaveBeenCalledTimes(1);
    });

    it("blocks production admin paths when ADMIN_ALLOWED_IPS is unset", async () => {
        vi.stubEnv("NODE_ENV", "production");

        const response = await proxy(new NextRequest("http://localhost/admin/content"));

        expect(response.status).toBe(404);
        expect(getUserMock).not.toHaveBeenCalled();
        expect(updateSession).not.toHaveBeenCalled();
    });

    it("allows configured production admin IPs to reach admin auth checks", async () => {
        vi.stubEnv("NODE_ENV", "production");
        process.env.ADMIN_ALLOWED_IPS = "203.0.113.42";

        const response = await proxy(new NextRequest("http://localhost/admin/content", {
            headers: { "x-forwarded-for": "203.0.113.42" },
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fadmin%2Fcontent");
        expect(getUserMock).toHaveBeenCalledTimes(1);
    });

    it("hides production admin paths from non-allowlisted IPs", async () => {
        vi.stubEnv("NODE_ENV", "production");
        process.env.ADMIN_ALLOWED_IPS = "203.0.113.42";

        const response = await proxy(new NextRequest("http://localhost/admin/content", {
            headers: { "x-forwarded-for": "198.51.100.10" },
        }));

        expect(response.status).toBe(404);
        expect(getUserMock).not.toHaveBeenCalled();
        expect(updateSession).not.toHaveBeenCalled();
    });

    it("lets authorized cron processors bypass the admin IP gate", async () => {
        vi.stubEnv("NODE_ENV", "production");
        process.env.CRON_SECRET = "cron-secret";

        const response = await proxy(new NextRequest("http://localhost/api/admin/narration/process", {
            headers: { authorization: "Bearer cron-secret" },
        }));

        expect(response.status).toBe(200);
        expect(getUserMock).not.toHaveBeenCalled();
        expect(updateSession).not.toHaveBeenCalled();
    });

    it("refreshes sessions on read routes after legacy redirect checks", async () => {
        const response = await proxy(new NextRequest("http://localhost/read/current-story/slug"));

        expect(response.status).toBe(200);
        expect(updateSession).toHaveBeenCalledTimes(1);
    });

    it("preserves legacy read redirects before session refresh", async () => {
        legacyMaybeSingleMock.mockResolvedValue({
            data: {
                id: "story-123",
                title: "A Better Path",
            },
            error: null,
        });

        const response = await proxy(new NextRequest("http://localhost/read/story-123"));

        expect(response.status).toBe(308);
        expect(response.headers.get("location")).toBe("http://localhost/read/story-123/a-better-path");
        expect(updateSession).not.toHaveBeenCalled();
    });

    it("matches the routes that need auth cookie refresh coverage", () => {
        expect(config.matcher).toEqual(expect.arrayContaining([
            "/login",
            "/auth/callback",
            "/browse",
            "/read/:path*",
            "/library/:path*",
            "/requests",
            "/api/activity/:path*",
            "/api/chat/:path*",
            "/api/content-requests/:path*",
            "/api/feedback/:path*",
            "/api/library/:path*",
            "/api/notification-preferences/:path*",
        ]));
    });

    it("keeps the Next 16 proxy entrypoint covering admin routes", () => {
        expect(typeof proxy).toBe("function");
        expect(config.matcher).toEqual(expect.arrayContaining([
            "/admin/:path*",
            "/api/admin/:path*",
        ]));
    });
});
