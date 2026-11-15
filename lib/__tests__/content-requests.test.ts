import { afterEach, describe, expect, it, vi } from "vitest";
import { inferContentType, normalizeText, normalizeUrl, splitTitleAndAuthor } from "@/lib/content-requests";
import { normalizeContentRequestStatus } from "@/types/content-requests";

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

    it("maps legacy request statuses to the simplified lifecycle", () => {
        expect(normalizeContentRequestStatus("requested")).toBe("pending");
        expect(normalizeContentRequestStatus("under_review")).toBe("processing");
        expect(normalizeContentRequestStatus("in_progress")).toBe("processing");
        expect(normalizeContentRequestStatus("source_unavailable")).toBe("skipped");
        expect(normalizeContentRequestStatus("archived")).toBe("skipped");
        expect(normalizeContentRequestStatus("published")).toBe("published");
        expect(normalizeContentRequestStatus("unknown")).toBe("pending");
    });


});
