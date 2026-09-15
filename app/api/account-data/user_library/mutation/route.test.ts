import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/account-data/user_library/mutation/route";
import { createClient } from "@/lib/supabase/server";
import { commitLibraryMutationForAccount } from "@/lib/server/account-data-snapshots";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({ commitLibraryMutationForAccount: vi.fn() }));

describe("POST /api/account-data/user_library/mutation", () => {
    const getUser = vi.fn();
    const mutation = {
        contentId: "00000000-0000-4000-8000-000000000001",
        isBookmarked: true,
        progress: null,
        lastInteractedAt: "2026-09-14T00:00:00.000Z",
        deleteIfEmpty: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        getUser.mockResolvedValue({ data: { user: { id: "account-a" } } });
        (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: { getUser } });
        (commitLibraryMutationForAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            resetEpoch: 3,
            libraryRevision: 21,
        });
    });

    it("binds the server-side mutation to the authenticated account and returns its exact boundary", async () => {
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
            method: "POST",
            body: JSON.stringify({ ...mutation, accountId: "account-b" }),
            headers: { "Content-Type": "application/json" },
        }));

        expect(response.status).toBe(200);
        expect(commitLibraryMutationForAccount).toHaveBeenCalledWith("account-a", mutation);
        await expect(response.json()).resolves.toEqual({ data: { resetEpoch: 3, libraryRevision: 21 } });
    });

    it("rejects unauthenticated and malformed mutation attempts before the worker is called", async () => {
        getUser.mockResolvedValueOnce({ data: { user: null } });
        const unauthenticated = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
            method: "POST",
            body: JSON.stringify(mutation),
        }));
        expect(unauthenticated.status).toBe(401);

        const malformed = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
            method: "POST",
            body: JSON.stringify({ ...mutation, contentId: "not-a-uuid" }),
        }));
        expect(malformed.status).toBe(400);
        expect(commitLibraryMutationForAccount).not.toHaveBeenCalled();
    });
});
