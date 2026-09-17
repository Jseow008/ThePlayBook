import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: () => ({ rpc }),
}));

import { parseCatalogSearchHeadline, searchCatalog } from "@/lib/server/catalog-search";

const row = {
    query_state: "results" as const,
    content_id: "00000000-0000-0000-0000-000000000001",
    content_type: "article" as const,
    title: "A searchable title",
    author: "An author",
    category: "Technology",
    cover_image_url: null,
    duration_seconds: null,
    audio_url: null,
    created_at: "2026-09-17T00:00:00.000000Z",
    quick_mode_json: {},
    result_rank: 0.75,
    cursor_rank: "0.75",
    snippet_source: "Summary",
    snippet_headline: "A <<NF_HL>>searchable<</NF_HL>> result",
};

describe("catalog search server contract", () => {
    beforeEach(() => {
        process.env.CATALOG_SEARCH_CURSOR_SECRET = "catalog-search-unit-test-secret";
        rpc.mockReset();
    });

    it("keeps marker highlights as text ranges rather than HTML", () => {
        expect(parseCatalogSearchHeadline("Before <<NF_HL>>match<</NF_HL>> after")).toEqual({
            text: "Before match after",
            highlights: [{ start: 7, end: 12 }],
        });
        expect(parseCatalogSearchHeadline("Before <<NF_HL>>unterminated")).toEqual({
            text: "Before unterminated",
            highlights: [],
        });
    });

    it("binds a signed continuation cursor to its exact filters", async () => {
        rpc.mockResolvedValueOnce({ data: [...Array(21)].map((_, index) => ({
            ...row,
            content_id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
            result_rank: 1 - index / 100,
            cursor_rank: String(1 - index / 100),
        })), error: null });
        const firstPage = await searchCatalog({ query: "searchable", categories: ["Technology"], type: "article" });
        expect(firstPage.results).toHaveLength(20);
        expect(firstPage.pageInfo.nextCursor).toEqual(expect.any(String));

        await expect(searchCatalog({
            query: "different query",
            categories: ["Technology"],
            type: "article",
            cursor: firstPage.pageInfo.nextCursor,
        })).rejects.toMatchObject({ code: "CURSOR_INVALID" });
    });

    it("returns the exact PostgreSQL rank text to the next keyset request", async () => {
        rpc.mockResolvedValueOnce({ data: [...Array(21)].map((_, index) => ({
            ...row,
            content_id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
            result_rank: 0.125,
            cursor_rank: "0.1250000149011612",
        })), error: null });
        const firstPage = await searchCatalog({ query: "searchable" });
        rpc.mockResolvedValueOnce({ data: [], error: null });

        await searchCatalog({ query: "searchable", cursor: firstPage.pageInfo.nextCursor });

        expect(rpc).toHaveBeenLastCalledWith("search_catalog", expect.objectContaining({
            p_after_rank: "0.1250000149011612",
        }));
    });

    it("returns a deliberate input outcome for stop-word-only input", async () => {
        rpc.mockResolvedValueOnce({ data: [{ ...row, query_state: "input_empty", content_id: null }], error: null });
        await expect(searchCatalog({ query: "the and or" })).resolves.toMatchObject({
            outcome: "input_empty",
            results: [],
        });
    });
});
