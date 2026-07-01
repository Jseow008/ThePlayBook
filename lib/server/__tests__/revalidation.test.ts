import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import {
    revalidateContentBulkChanged,
    revalidateContentCreated,
    revalidateContentDeleted,
    revalidateContentFeaturedChanged,
    revalidateContentUpdated,
    revalidateNarrationContentChanged,
    revalidatePaths,
    revalidateSeriesAdminSurfaces,
} from "@/lib/server/revalidation";

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const revalidatePathMock = vi.mocked(revalidatePath);

function revalidatedPaths() {
    return revalidatePathMock.mock.calls.map(([path]) => path);
}

describe("revalidation helpers", () => {
    beforeEach(() => {
        revalidatePathMock.mockClear();
    });

    it("dedupes direct path lists", () => {
        revalidatePaths(["/", "/browse", "/", null, undefined, "/browse"]);

        expect(revalidatedPaths()).toEqual(["/", "/browse"]);
    });

    it("revalidates create surfaces without the admin edit page", () => {
        revalidateContentCreated({
            id: "item-1",
            title: "A Great Read",
            seriesSlugs: ["series-one"],
        });

        expect(revalidatedPaths()).toEqual([
            "/",
            "/browse",
            "/search",
            "/admin",
            "/admin/content",
            "/preview/item-1",
            "/read/item-1",
            "/read/item-1/a-great-read",
            "/series/series-one",
        ]);
        expect(revalidatedPaths()).not.toContain("/admin/content/item-1/edit");
    });

    it("revalidates update surfaces with old and new canonical read paths", () => {
        revalidateContentUpdated({
            id: "item-2",
            previousTitle: "Old Title",
            nextTitle: "New Title",
            seriesSlugs: ["old-series", "new-series"],
        });

        expect(revalidatedPaths()).toEqual([
            "/",
            "/browse",
            "/search",
            "/admin",
            "/admin/content",
            "/preview/item-2",
            "/read/item-2",
            "/read/item-2/old-title",
            "/read/item-2/new-title",
            "/admin/content/item-2/edit",
            "/series/old-series",
            "/series/new-series",
        ]);
    });

    it("revalidates delete surfaces without admin edit churn", () => {
        revalidateContentDeleted({
            id: "item-3",
            title: "Deleted Read",
            seriesSlugs: ["series-one"],
        });

        expect(revalidatedPaths()).toEqual([
            "/",
            "/browse",
            "/search",
            "/admin",
            "/admin/content",
            "/preview/item-3",
            "/read/item-3",
            "/read/item-3/deleted-read",
            "/series/series-one",
        ]);
        expect(revalidatedPaths()).not.toContain("/admin/content/item-3/edit");
    });

    it("can include or skip admin edit pages for bulk changes", () => {
        revalidateContentBulkChanged({
            items: [
                { id: "item-4", title: "Bulk One" },
                { id: "item-5", title: "Bulk Two" },
            ],
            includeAdminEditPaths: false,
            seriesSlugs: ["series-one"],
        });

        expect(revalidatedPaths()).toEqual([
            "/",
            "/browse",
            "/search",
            "/admin",
            "/admin/content",
            "/preview/item-4",
            "/read/item-4",
            "/read/item-4/bulk-one",
            "/preview/item-5",
            "/read/item-5",
            "/read/item-5/bulk-two",
            "/series/series-one",
        ]);
    });

    it("keeps featured changes scoped to featured collection and admin surfaces", () => {
        revalidateContentFeaturedChanged({ ids: ["item-6"] });

        expect(revalidatedPaths()).toEqual([
            "/",
            "/browse",
            "/admin",
            "/admin/content",
            "/admin/content/item-6/edit",
        ]);
        expect(revalidatedPaths()).not.toContain("/search");
        expect(revalidatedPaths()).not.toContain("/read/item-6");
    });

    it("revalidates narration content with canonical read paths when title is known", () => {
        revalidateNarrationContentChanged([{ id: "item-7", title: "Narrated Read" }]);

        expect(revalidatedPaths()).toEqual([
            "/",
            "/browse",
            "/search",
            "/admin",
            "/admin/content",
            "/preview/item-7",
            "/read/item-7",
            "/read/item-7/narrated-read",
            "/admin/content/item-7/edit",
        ]);
    });

    it("revalidates series admin surfaces and series pages", () => {
        revalidateSeriesAdminSurfaces(["series-one", null, "series-one"]);

        expect(revalidatedPaths()).toEqual([
            "/admin/series",
            "/admin/content/new",
            "/series/series-one",
        ]);
    });
});
