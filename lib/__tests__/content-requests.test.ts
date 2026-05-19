import { afterEach, describe, expect, it, vi } from "vitest";
import { inferContentType, normalizeText, normalizeUrl, splitTitleAndAuthor } from "@/lib/content-requests";
import { fetchRequestMetadata } from "@/lib/server/content-request-metadata";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("content request helpers", () => {
    it("normalizes source URLs for duplicate detection", () => {
        expect(normalizeUrl("https://www.youtube.com/watch?v=abc&utm_source=newsletter#intro"))
            .toBe("https://youtube.com/watch?v=abc");
    });

    it("normalizes titles and authors for duplicate detection", () => {
        expect(normalizeText("  The Psychology of Money: Timeless lessons! "))
            .toBe("the psychology of money timeless lessons");
    });

    it("splits simple title by author submissions", () => {
        expect(splitTitleAndAuthor("Atomic Habits by James Clear")).toEqual({
            title: "Atomic Habits",
            author: "James Clear",
        });
    });

    it("infers URL-backed content types", () => {
        expect(inferContentType("https://youtu.be/example")).toBe("video");
        expect(inferContentType("https://podcasts.apple.com/us/podcast/example")).toBe("podcast");
        expect(inferContentType("https://example.com/essay")).toBe("article");
    });

    it("blocks direct private-network metadata fetches", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        await expect(fetchRequestMetadata("http://127.0.0.1:54321/private")).resolves.toEqual({});
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
