import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    rpc: vi.fn(),
    from: vi.fn(),
    replacementLookup: vi.fn(),
    getVerifiedAccountDataSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(async () => ({ rpc: mocks.rpc, from: mocks.from })),
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
        mocks.from.mockReset().mockReturnValue({ select: vi.fn(() => ({
            in: (...args: unknown[]) => ({ returns: () => mocks.replacementLookup(...args) }),
        })) });
        mocks.replacementLookup.mockReset().mockResolvedValue({ data: [], error: null });
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

    it("keeps the reader's 50-highlight page intact and exposes its continuation", async () => {
        mocks.rpc.mockResolvedValueOnce({ data: Array.from({ length: 51 }, (_, index) => searchRow(index + 1)), error: null });

        const response = await GET(new NextRequest("http://localhost/api/library/highlights?limit=50"));
        const body = await response.json() as { data: unknown[]; nextCursor: string | null };

        expect(response.status).toBe(200);
        expect(body.data).toHaveLength(50);
        expect(body.nextCursor).toEqual(expect.any(String));
        expect(mocks.rpc).toHaveBeenCalledWith("search_user_highlights", expect.objectContaining({ p_limit: 51 }));
    });

    it("does not turn an authorization failure into an empty page", async () => {
        mocks.getVerifiedAccountDataSession.mockResolvedValue(null);
        const response = await GET(new NextRequest("http://localhost/api/library/highlights?q=saved"));
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it("retains only the original public source identity for an owned note with an accessible replacement", async () => {
        const row = { ...searchRow(1), content_title: null, content_author: null,
            note_body: "Exact original thought.\nSecond line stays here.", segment_title: null };
        mocks.rpc.mockResolvedValue({ data: [row], error: null });
        mocks.replacementLookup.mockResolvedValue({ data: [{ source_id: contentId, source_title: "Original edition" }], error: null });

        const response = await GET(new NextRequest("http://localhost/api/library/highlights"));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(mocks.from).toHaveBeenCalledWith("content_replacement");
        expect(mocks.replacementLookup).toHaveBeenCalledWith("source_id", [contentId]);
        expect(body.data[0]).toMatchObject({
            id: row.id, content_item_id: contentId, highlighted_text: row.highlighted_text,
            note_body: row.note_body, anchor_start: row.anchor_start, anchor_end: row.anchor_end,
            source_replaced: true,
            content_item: { id: contentId, title: "Original edition", author: null, cover_image_url: null },
        });
    });

    it("leaves normal source metadata intact without an extra replacement lookup", async () => {
        mocks.rpc.mockResolvedValue({ data: [searchRow(1)], error: null });
        const response = await GET(new NextRequest("http://localhost/api/library/highlights"));
        expect((await response.json()).data[0]).toMatchObject({ source_replaced: false,
            content_item: { id: contentId, title: "Source item", author: "Author" } });
        expect(mocks.from).not.toHaveBeenCalled();
    });

    it("does not invent source metadata when replacement RLS returns no accessible successor", async () => {
        const row = { ...searchRow(1), content_title: null };
        mocks.rpc.mockResolvedValue({ data: [row], error: null });
        const response = await GET(new NextRequest("http://localhost/api/library/highlights"));
        expect((await response.json()).data[0]).toMatchObject({ id: row.id,
            content_item_id: contentId, content_item: null, source_replaced: false });
    });

    it("reports lookup failure instead of silently removing a replacement source link", async () => {
        mocks.rpc.mockResolvedValue({ data: [{ ...searchRow(1), content_title: null }], error: null });
        mocks.replacementLookup.mockResolvedValue({ data: null, error: { code: "08006", message: "Connection lost" } });
        const response = await GET(new NextRequest("http://localhost/api/library/highlights"));
        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    });

    it("looks up only returned notes, with deduplicated original IDs and no cursor lookahead", async () => {
        mocks.rpc.mockResolvedValue({ data: [
            { ...searchRow(1), content_title: null },
            { ...searchRow(2), content_title: null },
            { ...searchRow(3), content_title: null, content_item_id: "00000000-0000-0000-0000-000000000099" },
        ], error: null });
        const response = await GET(new NextRequest("http://localhost/api/library/highlights?limit=2"));
        const body = await response.json();
        expect(body.data).toHaveLength(2);
        expect(body.nextCursor).toEqual(expect.any(String));
        expect(mocks.replacementLookup).toHaveBeenCalledWith("source_id", [contentId]);
    });
});
