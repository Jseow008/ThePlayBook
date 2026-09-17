import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("verified account-data snapshot sessions", () => {
    const getUser = vi.fn();
    const getClaims = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: { getUser, getClaims } });
        getUser.mockResolvedValue({ data: { user: { id: "account-a" } }, error: null });
        getClaims.mockResolvedValue({ data: { claims: { sub: "account-a", session_id: "00000000-0000-4000-8000-000000000020" } }, error: null });
    });

    it("requires verified claims that belong to the current account", async () => {
        await expect(getVerifiedAccountDataSession()).resolves.toEqual({
            accountId: "account-a",
            sessionId: "00000000-0000-4000-8000-000000000020",
        });
        expect(getUser).toHaveBeenCalledTimes(1);
        expect(getClaims).toHaveBeenCalledTimes(1);
    });

    it("rejects claims from another account", async () => {
        getClaims.mockResolvedValueOnce({ data: { claims: { sub: "account-b", session_id: "00000000-0000-4000-8000-000000000020" } }, error: null });
        await expect(getVerifiedAccountDataSession()).resolves.toBeNull();
    });
});
