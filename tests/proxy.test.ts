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
        getUserMock.mockResolvedValue({ data: { user: null }, error: null });
        profileSingleMock.mockResolvedValue({ data: null, error: null });
        legacyMaybeSingleMock.mockResolvedValue({ data: null, error: null });
        process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
        delete process.env.ADMIN_ALLOWED_IPS;
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
});
