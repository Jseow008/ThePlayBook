import {
    DEFAULT_ADMIN_CONTENT_SORT,
    getAdminContentSortOrder,
    normalizeAdminContentSort,
} from "@/lib/admin-content-sort";

describe("normalizeAdminContentSort", () => {
    it("returns the default sort when the value is missing", () => {
        expect(normalizeAdminContentSort(undefined)).toBe(DEFAULT_ADMIN_CONTENT_SORT);
        expect(normalizeAdminContentSort(null)).toBe(DEFAULT_ADMIN_CONTENT_SORT);
        expect(normalizeAdminContentSort("")).toBe(DEFAULT_ADMIN_CONTENT_SORT);
    });

    it("keeps supported sort values", () => {
        expect(normalizeAdminContentSort("created_asc")).toBe("created_asc");
        expect(normalizeAdminContentSort("updated_desc")).toBe("updated_desc");
        expect(normalizeAdminContentSort("updated_asc")).toBe("updated_asc");
    });

    it("falls back when the value is invalid", () => {
        expect(normalizeAdminContentSort("title_desc")).toBe(DEFAULT_ADMIN_CONTENT_SORT);
    });
});

describe("getAdminContentSortOrder", () => {
    it("maps created sorts to the created_at column", () => {
        expect(getAdminContentSortOrder("created_desc")).toEqual({
            column: "created_at",
            ascending: false,
        });
        expect(getAdminContentSortOrder("created_asc")).toEqual({
            column: "created_at",
            ascending: true,
        });
    });

    it("maps updated sorts to the updated_at column", () => {
        expect(getAdminContentSortOrder("updated_desc")).toEqual({
            column: "updated_at",
            ascending: false,
        });
        expect(getAdminContentSortOrder("updated_asc")).toEqual({
            column: "updated_at",
            ascending: true,
        });
    });
});
