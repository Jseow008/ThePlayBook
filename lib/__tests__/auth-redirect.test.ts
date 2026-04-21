import { describe, expect, it } from "vitest";
import {
    DEFAULT_LOGIN_REDIRECT_PATH,
    buildLoginHref,
    normalizeLoginNextPath,
    normalizeNextPath,
} from "@/lib/auth-redirect";

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

describe("normalizeLoginNextPath", () => {
    it("keeps a valid public app path", () => {
        expect(normalizeLoginNextPath("/read/abc?highlightId=123")).toBe("/read/abc?highlightId=123");
    });

    it("falls back for missing, landing, or auth callback routes", () => {
        expect(normalizeLoginNextPath(undefined)).toBe(DEFAULT_LOGIN_REDIRECT_PATH);
        expect(normalizeLoginNextPath("/")).toBe(DEFAULT_LOGIN_REDIRECT_PATH);
        expect(normalizeLoginNextPath("/login")).toBe(DEFAULT_LOGIN_REDIRECT_PATH);
        expect(normalizeLoginNextPath("/auth/callback?next=/read/abc")).toBe(DEFAULT_LOGIN_REDIRECT_PATH);
    });

    it("uses the provided fallback for malformed paths", () => {
        expect(normalizeLoginNextPath("https://example.com", "/preview/123")).toBe("/preview/123");
    });
});

describe("buildLoginHref", () => {
    it("encodes the normalized redirect target into the login href", () => {
        expect(buildLoginHref("/preview/123?tab=summary")).toBe("/login?next=%2Fpreview%2F123%3Ftab%3Dsummary");
    });

    it("falls back to browse for disallowed targets", () => {
        expect(buildLoginHref("/")).toBe("/login?next=%2Fbrowse");
        expect(buildLoginHref("/login")).toBe("/login?next=%2Fbrowse");
    });
});
