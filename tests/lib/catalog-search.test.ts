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

    it("traverses forward and backward pages without dropping the directional look-ahead row", async () => {
        const makeRows = (first: number, last: number, descending = false) => Array.from(
            { length: last - first + 1 },
            (_, offset) => {
                const index = descending ? last - offset : first + offset;
                return {
                    ...row,
                    content_id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
                    title: `Result ${index}`,
                    result_rank: 100 - index,
                    cursor_rank: String(100 - index),
                };
            },
        );

        // PostgreSQL returns a backwards page in reverse display order. The
        // second backwards response includes its look-ahead row; the first
        // one does not, because page one has no earlier page.
        rpc
            .mockResolvedValueOnce({ data: makeRows(1, 21), error: null })
            .mockResolvedValueOnce({ data: makeRows(21, 41), error: null })
            .mockResolvedValueOnce({ data: makeRows(41, 55), error: null })
            .mockResolvedValueOnce({ data: makeRows(20, 40, true), error: null })
            .mockResolvedValueOnce({ data: makeRows(1, 20, true), error: null })
            .mockResolvedValueOnce({ data: makeRows(21, 41), error: null });

        const pageOne = await searchCatalog({ query: "searchable" });
        const pageTwo = await searchCatalog({ query: "searchable", cursor: pageOne.pageInfo.nextCursor });
        const pageThree = await searchCatalog({ query: "searchable", cursor: pageTwo.pageInfo.nextCursor });
        const pageTwoAgain = await searchCatalog({ query: "searchable", cursor: pageThree.pageInfo.previousCursor });
        const pageOneAgain = await searchCatalog({ query: "searchable", cursor: pageTwoAgain.pageInfo.previousCursor });
        const pageTwoFinal = await searchCatalog({ query: "searchable", cursor: pageOneAgain.pageInfo.nextCursor });

        expect(pageOne.results.map((result) => result.title)).toEqual(Array.from({ length: 20 }, (_, index) => `Result ${index + 1}`));
        expect(pageTwo.results.map((result) => result.title)).toEqual(Array.from({ length: 20 }, (_, index) => `Result ${index + 21}`));
        expect(pageThree.results.map((result) => result.title)).toEqual(Array.from({ length: 15 }, (_, index) => `Result ${index + 41}`));
        expect(pageTwoAgain.results.map((result) => result.title)).toEqual(pageTwo.results.map((result) => result.title));
        expect(pageOneAgain.results.map((result) => result.title)).toEqual(pageOne.results.map((result) => result.title));
        expect(pageTwoFinal.results.map((result) => result.title)).toEqual(pageTwo.results.map((result) => result.title));
        expect(pageOne.pageInfo.previousCursor).toBeNull();
        expect(pageOneAgain.pageInfo.previousCursor).toBeNull();
        expect(pageOneAgain.pageInfo.nextCursor).toEqual(expect.any(String));
        expect(pageTwoAgain.pageInfo.nextCursor).toEqual(expect.any(String));
        expect(pageTwoAgain.pageInfo.previousCursor).toEqual(expect.any(String));
    });
});
