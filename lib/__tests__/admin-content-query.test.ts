import {
    DEFAULT_ADMIN_CONTENT_PAGE_SIZE,
    DEFAULT_ADMIN_CONTENT_VIEW_STATE,
    getAdminContentViewStateFromSearchParams,
    normalizeAdminContentAiFilter,
    normalizeAdminContentPageSize,
    normalizeAdminContentStatus,
    normalizeAdminContentType,
    normalizeAdminContentVoiceFilter,
} from "@/lib/admin-content-query";

describe("admin content query helpers", () => {
    it("normalizes supported filter values", () => {
        expect(normalizeAdminContentStatus("verified")).toBe("verified");
        expect(normalizeAdminContentType("podcast")).toBe("podcast");
        expect(normalizeAdminContentAiFilter("stale")).toBe("stale");
        expect(normalizeAdminContentVoiceFilter("missing")).toBe("missing");
        expect(normalizeAdminContentPageSize("25")).toBe(25);
    });

    it("falls back to defaults for invalid values", () => {
        expect(normalizeAdminContentStatus("deleted")).toBe("all");
        expect(normalizeAdminContentType("essay")).toBe("all");
        expect(normalizeAdminContentAiFilter("ready")).toBe("all");
        expect(normalizeAdminContentVoiceFilter("ready")).toBe("all");
        expect(normalizeAdminContentPageSize("999")).toBe(DEFAULT_ADMIN_CONTENT_PAGE_SIZE);
    });

    it("builds a view state from search params", () => {
        expect(getAdminContentViewStateFromSearchParams({
            status: "draft",
            type: "book",
            featured: "true",
            sort: "updated_desc",
            ai: "stale",
            voice: "missing",
            page_size: "50",
        })).toEqual({
            status: "draft",
            type: "book",
            featured: true,
            sort: "updated_desc",
            ai: "stale",
            voice: "missing",
            pageSize: 50,
        });
    });

    it("returns the default view state when params are empty", () => {
        expect(getAdminContentViewStateFromSearchParams({})).toEqual(DEFAULT_ADMIN_CONTENT_VIEW_STATE);
    });
});
