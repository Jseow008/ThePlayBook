import { describe, expect, it } from "vitest";
import { normalizeAdminReturnTo, withNarrationWarning } from "@/lib/admin-return-to";

describe("normalizeAdminReturnTo", () => {
    it("keeps valid admin destinations", () => {
        expect(normalizeAdminReturnTo("/admin")).toBe("/admin");
        expect(normalizeAdminReturnTo("/admin/content?page=6&status=draft")).toBe("/admin/content?page=6&status=draft");
        expect(normalizeAdminReturnTo("/admin/content/abc/edit?returnTo=%2Fadmin")).toBe("/admin/content/abc/edit?returnTo=%2Fadmin");
    });

    it("rejects malformed or non-admin destinations", () => {
        expect(normalizeAdminReturnTo(undefined)).toBe("/admin/content");
        expect(normalizeAdminReturnTo("https://example.com/admin")).toBe("/admin/content");
        expect(normalizeAdminReturnTo("//example.com/admin")).toBe("/admin/content");
        expect(normalizeAdminReturnTo("/browse")).toBe("/admin/content");
        expect(normalizeAdminReturnTo("/admin-login")).toBe("/admin/content");
        expect(normalizeAdminReturnTo("/adminfoo")).toBe("/admin/content");
    });
});

describe("withNarrationWarning", () => {
    it("adds the warning while preserving existing query params", () => {
        expect(
            withNarrationWarning("/admin/content?page=6&status=draft", "Queued narration job.")
        ).toBe("/admin/content?page=6&status=draft&narration_warning=Queued+narration+job.");
    });

    it("removes a stale warning when the latest save has no warning", () => {
        expect(
            withNarrationWarning("/admin/content?page=6&narration_warning=Old", "")
        ).toBe("/admin/content?page=6");
    });

    it("falls back to the content workbench for invalid destinations", () => {
        expect(withNarrationWarning("/browse", "Queued narration job.")).toBe(
            "/admin/content?narration_warning=Queued+narration+job."
        );
    });
});
