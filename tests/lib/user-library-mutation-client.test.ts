// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { commitUserLibraryMutation } from "@/lib/user-library-mutation-client";

describe("commitUserLibraryMutation", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends the shared mutation wire format to the authenticated server route", async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: { resetEpoch: 2, libraryRevision: 17 },
        }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(commitUserLibraryMutation({
            contentId: "00000000-0000-4000-8000-000000000001",
            isBookmarked: true,
            progress: null,
            lastInteractedAt: "2026-09-14T00:00:00.000Z",
            deleteIfEmpty: false,
        })).resolves.toEqual({ resetEpoch: 2, libraryRevision: 17 });
        expect(fetchMock).toHaveBeenCalledWith("/api/account-data/user_library/mutation", expect.objectContaining({ method: "POST" }));
    });
});
