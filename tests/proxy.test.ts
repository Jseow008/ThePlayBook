import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";

const getUserMock = vi.fn();
const profileSingleMock = vi.fn();

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
                            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
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
});
