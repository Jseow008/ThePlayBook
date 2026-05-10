import { describe, expect, it } from "vitest";
import {
    applyAdminContentViewStateToParams,
    hasExplicitAdminContentParams,
    parseAdminContentPermanentFilters,
    serializeAdminContentPermanentFilters,
} from "@/lib/admin-content-permanent-filters";

describe("admin content permanent filters", () => {
    it("round trips normalized permanent filter state", () => {
        const encoded = serializeAdminContentPermanentFilters({
            status: "verified",
            type: "book",
            featured: true,
            sort: "updated_desc",
            ai: "stale",
            voice: "missing",
            pageSize: 25,
        });

        expect(parseAdminContentPermanentFilters(encoded)).toEqual({
            status: "verified",
            type: "book",
            featured: true,
            sort: "updated_desc",
            ai: "stale",
            voice: "missing",
            pageSize: 25,
        });
    });

    it("detects explicit URL state before cookie restore", () => {
        expect(hasExplicitAdminContentParams({})).toBe(false);
        expect(hasExplicitAdminContentParams({ narration_warning: "queued" })).toBe(false);
        expect(hasExplicitAdminContentParams({ status: "draft" })).toBe(true);
        expect(hasExplicitAdminContentParams({ q: "focus" })).toBe(true);
    });

    it("applies non-default view state without preserving stale page", () => {
        const params = new URLSearchParams("page=4&narration_warning=queued");

        applyAdminContentViewStateToParams(params, {
            status: "draft",
            type: "all",
            featured: false,
            sort: "created_desc",
            ai: "all",
            voice: "stale",
            pageSize: 50,
        });

        expect(params.toString()).toBe("narration_warning=queued&status=draft&voice=stale&page_size=50");
    });
});
