import { describe, expect, it } from "vitest";
import { buildSavedHighlightCopy } from "@/lib/saved-highlight-copy";

describe("saved highlight copy", () => {
    it("preserves the full persisted quotation and thought, including Unicode, whitespace and Markdown", () => {
        const quote = "  🌱 **Exact** words <unchanged>\r\nSecond line\n" + "Long passage. ".repeat(60);
        const thought = " \nMy _saved_ thought [with brackets].\n  ";
        expect(buildSavedHighlightCopy({
            highlighted_text: quote, note_body: thought,
            content_item: { title: "A book", author: "An author" }, segment: { title: "Section 2" },
        }, "/read/book/a-book?highlightId=owned-id", "https://www.netflux.blog")).toBe(
            `Passage:\n${quote}\n\nMy thought:\n${thought}\n\nSource: A book\nAuthor: An author\nSection: Section 2\nSaved passage: https://www.netflux.blog/read/book/a-book?highlightId=owned-id`
        );
    });

    it("keeps saved text copyable without source metadata or a located passage", () => {
        expect(buildSavedHighlightCopy({
            highlighted_text: "Original saved quote", note_body: "Original saved thought",
            content_item: null, segment: null,
        }, null, "https://www.netflux.blog")).toBe("Passage:\nOriginal saved quote\n\nMy thought:\nOriginal saved thought");
    });

    it.each([null, "", " \n "])("omits an absent thought and unavailable optional metadata (%j)", (note_body) => {
        expect(buildSavedHighlightCopy({
            highlighted_text: "Only the quote", note_body,
            content_item: { title: "A book", author: null }, segment: { title: null },
        }, "/read/book/a-book?highlightId=h", "http://localhost:3049")).toBe("Passage:\nOnly the quote\n\nSource: A book\nSaved passage: http://localhost:3049/read/book/a-book?highlightId=h");
    });
});
