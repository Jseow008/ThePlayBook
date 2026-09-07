import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateSession } from "@/lib/supabase/middleware";

const { getClaimsMock } = vi.hoisted(() => ({
    getClaimsMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
    createServerClient: vi.fn(() => ({
        auth: {
            getClaims: getClaimsMock,
        },
    })),
}));

describe("updateSession", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    });

    it("does not verify a session when an auth cookie is absent", async () => {
        const { user } = await updateSession(new NextRequest("http://localhost/browse"));

        expect(user).toBeNull();
        expect(getClaimsMock).not.toHaveBeenCalled();
    });

    it("returns the verified subject from auth claims", async () => {
        getClaimsMock.mockResolvedValue({
            data: { claims: { sub: "user-123" } },
            error: null,
        });

        const { user } = await updateSession(new NextRequest("http://localhost/browse", {
            headers: { cookie: "sb-test-auth-token=session" },
        }));

        expect(getClaimsMock).toHaveBeenCalledTimes(1);
        expect(user).toEqual({ id: "user-123" });
    });
});
