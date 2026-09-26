import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/account-data/user_library/mutation/route";
import { createClient } from "@/lib/supabase/server";
import { LibraryMutationConflictError } from "@/lib/user-library-mutation-contract";
import { commitLibraryMutationForAccount } from "@/lib/server/account-data-snapshots";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({ commitLibraryMutationForAccount: vi.fn() }));

describe("POST /api/account-data/user_library/mutation", () => {
    const getUser = vi.fn();
    const mutation = {
        expectedAccountId: "account-a",
        baseRevision: 20,
        resetEpoch: 3,
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
        const { expectedAccountId, ...input } = mutation;
        expect(commitLibraryMutationForAccount).toHaveBeenCalledWith(expectedAccountId, input);
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
    it("rejects a queued action for another authenticated account before calling the worker", async () => {
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
            method: "POST", body: JSON.stringify({ ...mutation, expectedAccountId: "account-b" }),
        }));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: { code: "LIBRARY_CONFLICT" } });
        expect(commitLibraryMutationForAccount).not.toHaveBeenCalled();
    });

    it.each([
        { expectedAccountId: undefined }, { baseRevision: undefined }, { resetEpoch: undefined },
        { baseRevision: -1 }, { resetEpoch: -1 }, { baseRevision: 0.5 }, { resetEpoch: 0.5 },
        { baseRevision: Number.MAX_SAFE_INTEGER + 1 }, { resetEpoch: Number.MAX_SAFE_INTEGER + 1 },
    ])("requires valid account and safe integer boundaries: %j", async (invalid) => {
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
            method: "POST", body: JSON.stringify({ ...mutation, ...invalid }),
        }));
        expect(response.status).toBe(400);
        expect(commitLibraryMutationForAccount).not.toHaveBeenCalled();
    });

    it("returns a stale boundary conflict without retrying or rebasing", async () => {
        const current = { resetEpoch: 4, libraryRevision: 24 };
        vi.mocked(commitLibraryMutationForAccount).mockRejectedValueOnce(new LibraryMutationConflictError(current));
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
            method: "POST", body: JSON.stringify(mutation),
        }));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: { code: "LIBRARY_CONFLICT", current } });
        expect(commitLibraryMutationForAccount).toHaveBeenCalledTimes(1);
    });
});
