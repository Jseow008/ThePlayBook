import { strictPublicRateLimit } from "@/lib/server/rate-limit";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/account-data/user_library/mutation/route";
import { createClient } from "@/lib/supabase/server";
import { LibraryMutationConflictError, LibraryMutationReceiptError } from "@/lib/user-library-mutation-contract";
import { commitLibraryMutationForAccount } from "@/lib/server/account-data-snapshots";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/server/account-data-snapshots", () => ({ commitLibraryMutationForAccount: vi.fn() }));

vi.mock("@/lib/server/rate-limit", async (importOriginal) => ({
    ...await importOriginal<typeof import("@/lib/server/rate-limit")>(),
    strictPublicRateLimit: vi.fn(),
}));

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
        vi.mocked(strictPublicRateLimit).mockResolvedValue({ success: true });
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

    it("reports separate numeric phases without changing the acknowledgement or exposing data", async () => {
        let clock = 0;
        const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
        getUser.mockImplementationOnce(async () => { clock += 5; return { data: { user: { id: "account-a" } } }; });
        vi.mocked(strictPublicRateLimit).mockImplementationOnce(async () => { clock += 7; return { success: true }; });
        vi.mocked(commitLibraryMutationForAccount).mockImplementationOnce(async () => {
            clock += 13;
            return { resetEpoch: 3, libraryRevision: 21 };
        });
        try {
            const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
                method: "POST", body: JSON.stringify(mutation),
            }));
            expect(response.headers.get("server-timing")).toBe("auth;dur=5.0, admission;dur=7.0, library;dur=13.0, handler;dur=25.0");
            expect(response.headers.get("cache-control")).toBe("no-store");
            await expect(response.json()).resolves.toEqual({ data: { resetEpoch: 3, libraryRevision: 21 } });
        } finally { now.mockRestore(); }
    });

    it("rejects unauthenticated and malformed mutation attempts before the worker is called", async () => {
        getUser.mockResolvedValueOnce({ data: { user: null } });
        const unauthenticated = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
            method: "POST",
            body: JSON.stringify(mutation),
        }));
        expect(unauthenticated.status).toBe(401);
        expect(unauthenticated.headers.get("server-timing")).toBeNull();

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
    it.each([{ mutationId: "bad", createdAt: mutation.lastInteractedAt }, { mutationId: "00000000-0000-4000-8000-000000000001" }, { createdAt: mutation.lastInteractedAt }, { guestImport: {} }])("rejects malformed durable identity %j", async (extra) => {
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", { method: "POST", body: JSON.stringify({ ...mutation, ...extra }) }));
        expect(response.status).toBe(400);
        expect(commitLibraryMutationForAccount).not.toHaveBeenCalled();
    });
    it("bounds streamed request bytes before reaching the worker", async () => {
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", { method: "POST", body: JSON.stringify({ ...mutation, progress: { text: "x".repeat(70_000) } }) }));
        expect(response.status).toBe(413);
        expect(commitLibraryMutationForAccount).not.toHaveBeenCalled();
    });

    it("passes durable guest identity intact and preserves a skipped acknowledgement", async () => {
        const uuid = "00000000-0000-4000-8000-000000000001";
        const extra = { mutationId: uuid, createdAt: mutation.lastInteractedAt, guestImport: { migrationId: uuid, guestStorageId: uuid, sourceRecordId: uuid } };
        const ack = { resetEpoch: 3, libraryRevision: 20, outcome: "skipped" as const, reason: "destination_exists" as const };
        vi.mocked(commitLibraryMutationForAccount).mockResolvedValueOnce(ack);
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", { method: "POST", body: JSON.stringify({ ...mutation, ...extra }) }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ data: ack });
        expect(commitLibraryMutationForAccount).toHaveBeenCalledWith("account-a", expect.objectContaining(extra));
    });
    it.each([["LIBRARY_MUTATION_ID_REUSED", 409], ["LIBRARY_RECEIPT_LIMIT", 429]] as const)("returns typed receipt failure %s", async (code, status) => {
        vi.mocked(commitLibraryMutationForAccount).mockRejectedValueOnce(new LibraryMutationReceiptError(code, "Not saved."));
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", { method: "POST", body: JSON.stringify(mutation) }));
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ error: { code } });
    });

    it.each([
        [{ success: false, retryAfterMs: 5000 }, 429],
        [{ success: false, unavailable: true, retryAfterMs: 60000 }, 503],
    ] as const)("blocks worker dispatch when admission fails", async (admission, status) => {
        vi.mocked(strictPublicRateLimit).mockResolvedValueOnce(admission);
        const response = await POST(new NextRequest("http://localhost/api/account-data/user_library/mutation", {
            method: "POST", headers: { "x-forwarded-for": "forged" }, body: JSON.stringify(mutation),
        }));
        expect(response.status).toBe(status);
        expect(response.headers.get("Retry-After")).toBe(String(admission.retryAfterMs / 1000));
        expect(commitLibraryMutationForAccount).not.toHaveBeenCalled();
        expect(strictPublicRateLimit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ identifier: "account-a", limit: 120 }));
    });

});
