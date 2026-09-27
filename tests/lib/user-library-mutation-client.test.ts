// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { commitUserLibraryMutation } from "@/lib/user-library-mutation-client";

describe("commitUserLibraryMutation", () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

    it("sends the shared mutation wire format to the authenticated server route", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: { resetEpoch: 2, libraryRevision: 17 },
        }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(commitUserLibraryMutation({
            expectedAccountId: "account-a", baseRevision: 16, resetEpoch: 2,
            contentId: "00000000-0000-4000-8000-000000000001",
            isBookmarked: true,
            progress: null,
            lastInteractedAt: "2026-09-14T00:00:00.000Z",
            deleteIfEmpty: false,
        })).resolves.toEqual({ resetEpoch: 2, libraryRevision: 17 });
        expect(fetchMock).toHaveBeenCalledWith("/api/account-data/user_library/mutation", expect.objectContaining({ method: "POST" }));
    });
    const input = {
        expectedAccountId: "account-a", baseRevision: 16, resetEpoch: 2,
        mutationId: "00000000-0000-4000-8000-000000000003", createdAt: "2026-09-14T00:00:00.000Z",
        contentId: "00000000-0000-4000-8000-000000000001", isBookmarked: true,
        progress: null, lastInteractedAt: "2026-09-14T00:00:00.000Z", deleteIfEmpty: false,
    };
    const limited = (status = 429) => new Response(JSON.stringify({ error: {
        code: status === 429 ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE",
    } }), { status, headers: { "Retry-After": "2" } });
    it.each([429, 503])("honors retry time for %s and replays the exact frozen request", async status => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockResolvedValueOnce(limited(status)).mockResolvedValueOnce(new Response(JSON.stringify({ data: { resetEpoch: 2, libraryRevision: 17 } })));
        vi.stubGlobal("fetch", fetchMock);
        const onRetry = vi.fn();
        const promise = commitUserLibraryMutation(input, undefined, onRetry);
        await vi.advanceTimersByTimeAsync(1999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        await expect(promise).resolves.toEqual({ resetEpoch: 2, libraryRevision: 17 });
        expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    });
    it("cancels a throttled retry before another request on session change or unmount", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockResolvedValueOnce(limited()); vi.stubGlobal("fetch", fetchMock);
        const controller = new AbortController();
        const promise = commitUserLibraryMutation(input, controller.signal);
        const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
        await vi.advanceTimersByTimeAsync(1); controller.abort();
        await rejected; await vi.advanceTimersByTimeAsync(10000);
        expect(fetchMock).toHaveBeenCalledOnce();
    });
    it("bounds automatic retries during a sustained outage", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockImplementation(async () => limited(503)); vi.stubGlobal("fetch", fetchMock);
        const promise = commitUserLibraryMutation(input);
        const rejected = expect(promise).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(10000); await rejected;
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

});
