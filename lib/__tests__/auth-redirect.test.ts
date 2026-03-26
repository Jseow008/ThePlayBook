import { describe, expect, it } from "vitest";
import { normalizeNextPath } from "@/lib/auth-redirect";

describe("normalizeNextPath", () => {
    it("keeps a valid internal path", () => {
        expect(normalizeNextPath("/notes?ask=1#latest")).toBe("/notes?ask=1#latest");
    });

    it("falls back for external or malformed paths", () => {
        expect(normalizeNextPath("https://example.com")).toBe("/");
        expect(normalizeNextPath("//example.com")).toBe("/");
        expect(normalizeNextPath("notes")).toBe("/");
    });

    it("uses the provided fallback when next is missing", () => {
        expect(normalizeNextPath(undefined, "/browse")).toBe("/browse");
    });
});
