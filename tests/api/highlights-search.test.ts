import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    getVerifiedAccountDataSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("@/lib/server/account-data-snapshot-auth", () => ({ getVerifiedAccountDataSession: mocks.getVerifiedAccountDataSession }));
vi.mock("@/lib/server/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ success: true })) }));

import { GET } from "@/app/api/library/highlights/route";

const accountId = "00000000-0000-0000-0000-000000000010";
const sessionOne = "00000000-0000-0000-0000-000000000011";
const sessionTwo = "00000000-0000-0000-0000-000000000012";
const contentId = "00000000-0000-0000-0000-000000000013";

function searchRow(index: number) {
    return {
        id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
        user_id: accountId,
        content_item_id: contentId,
        segment_id: null,
        anchor_start: null,
        anchor_end: null,
        highlighted_text: `saved highlight ${index}`,
        note_body: null,
        color: "yellow",
        created_at: "2026-09-17T00:00:00.123456Z",
        cursor_created_at: "2026-09-17 00:00:00.123456+00",
        updated_at: null,
        content_title: "Source item",
        content_author: "Author",
        content_cover_image_url: null,
        segment_title: null,
    };
}

describe("GET /api/library/highlights search cursors", () => {
    beforeEach(() => {
        process.env.ACCOUNT_DATA_CURSOR_SECRET = "highlight-search-unit-test-secret";
        mocks.rpc.mockReset();
        mocks.getVerifiedAccountDataSession.mockReset();
        mocks.getVerifiedAccountDataSession.mockResolvedValue({ accountId, sessionId: sessionOne });
    });

    it("binds the opaque cursor to the session and does not call the database after a session replacement", async () => {
        mocks.rpc.mockResolvedValueOnce({ data: Array.from({ length: 31 }, (_, index) => searchRow(index + 1)), error: null });
        const first = await GET(new NextRequest("http://localhost/api/library/highlights?q=saved&sort=newest"));
        expect(first.status).toBe(200);
        const firstBody = await first.json() as { nextCursor: string | null };
        expect(firstBody.nextCursor).toEqual(expect.any(String));

        mocks.getVerifiedAccountDataSession.mockResolvedValue({ accountId, sessionId: sessionTwo });
        const replacedSession = await GET(new NextRequest(`http://localhost/api/library/highlights?q=saved&sort=newest&cursor=${encodeURIComponent(firstBody.nextCursor!)}`));
        expect(replacedSession.status).toBe(400);
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
    });

    it("preserves the database timestamp text in the next-page cursor", async () => {
        mocks.rpc.mockResolvedValueOnce({ data: Array.from({ length: 31 }, (_, index) => searchRow(index + 1)), error: null });
        const first = await GET(new NextRequest("http://localhost/api/library/highlights?q=saved&sort=newest"));
        const firstBody = await first.json() as { nextCursor: string | null };
        mocks.rpc.mockResolvedValueOnce({ data: [], error: null });

        await GET(new NextRequest(`http://localhost/api/library/highlights?q=saved&sort=newest&cursor=${encodeURIComponent(firstBody.nextCursor!)}`));

        expect(mocks.rpc).toHaveBeenLastCalledWith("search_user_highlights", expect.objectContaining({
            p_after_created_at: "2026-09-17 00:00:00.123456+00",
        }));
    });

    it("does not turn an authorization failure into an empty page", async () => {
        mocks.getVerifiedAccountDataSession.mockResolvedValue(null);
        const response = await GET(new NextRequest("http://localhost/api/library/highlights?q=saved"));
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
    });
});
