import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildChatExportMarkdown, buildChatExportMessageMarkdown, getChatExportMessages, type ChatExportPayload } from "@/lib/chat-export";
import { encryptChatExport, decryptChatExport } from "@/lib/chat-export-crypto";
import { issueEvidenceCitations } from "@/lib/server/evidence-citation";
import { renderEvidenceExtracts, renderEvidenceExtractsWithRanges } from "@/lib/server/evidence-extract-response";
import { selectedPersonalEvidence } from "../helpers/selected-personal-evidence";

const owner = "11111111-1111-4111-8111-111111111111";
const book = "22222222-2222-4222-8222-222222222222";
function selection() {
    return [1, 2, 3].map((number) => {
        const item = selectedPersonalEvidence();
        const id = `33333333-3333-4333-8333-${String(number).padStart(12, "0")}`;
        Object.assign(item.evidence, { userId: owner, id, evidenceId: `highlight:${id}`, contentItemId: book });
        // Repeated wording and headings must still retain distinct passage identities.
        const text = "Same words 🌱\n### Not a source heading\n```\n---";
        if (item.evidence.type === "highlight") item.evidence.noteBody = text;
        item.spans = [{ field: "noteBody", start: 0, end: text.length, text, score: 1 }];
        return item;
    });
}
function exported() {
    const items = selection();
    const rendered = renderEvidenceExtractsWithRanges({ personal: items });
    const citations = issueEvidenceCitations({ userId: owner, personal: items, exportContent: rendered });
    return { items, rendered, citations, message: getChatExportMessages([{ role: "assistant", content: rendered.text, citations }])[0] };
}
function payload(): ChatExportPayload {
    return { version: 1, title: "Ask These Notes", assistantLabel: "Ask These Notes", createdAt: "2026-10-28T12:00:00Z", messages: [exported().message] };
}
afterEach(() => vi.unstubAllEnvs());

describe("passage references in exports", () => {
    it("attaches three distinct destinations to the corresponding blocks, even with identical quotations", () => {
        vi.stubEnv("ACCOUNT_DATA_CURSOR_SECRET", "export-test-citation-secret-at-least-32");
        const { items, rendered, citations, message } = exported();
        expect(rendered.text).toBe(renderEvidenceExtracts({ personal: items }));
        expect(citations.map((citation) => citation.exportPassage?.sourceHref)).toEqual(items.map((item) => `/read/${book}?highlightId=${item.evidence.id}`));
        const result = buildChatExportMessageMarkdown(message);
        const root = document.createElement("div");
        root.innerHTML = renderToStaticMarkup(createElement(ReactMarkdown, null, result));
        const links = [...root.querySelectorAll("a")];
        expect(links).toHaveLength(3);
        links.forEach((link, index) => {
            expect(link.getAttribute("href")).toBe(`/read/${book}?highlightId=${items[index].evidence.id}`);
            const quote = link.parentElement!.previousElementSibling!;
            expect(quote.tagName).toBe("PRE");
            expect(quote.textContent).toBe(items[index].spans[0].text + "\n");
        });
        expect(result).toContain("another person's private highlights or notes");
        expect(JSON.stringify(message)).not.toContain("/evidence#");
        expect(message.content).toBe(rendered.text);
    });

    it("preserves metadata through actual encryption and uses absolute destinations in Markdown", async () => {
        vi.stubEnv("ACCOUNT_DATA_CURSOR_SECRET", "export-test-citation-secret-at-least-32");
        vi.stubGlobal("crypto", webcrypto);
        try {
            const original = payload();
            const { encrypted, key } = await encryptChatExport(original);
            const recovered = await decryptChatExport(encrypted, key);
            expect(recovered).toEqual(original);
            const markdown = buildChatExportMarkdown(recovered, "https://www.netflux.blog");
            expect(markdown.match(/\[Open source passage\]\(https:\/\/www.netflux.blog\/read\//g)).toHaveLength(3);
            expect(markdown).not.toContain("/evidence#");
        } finally { vi.unstubAllGlobals(); }
    });

    it("preserves an unavailable source's text without exporting a stale or invented destination", () => {
        vi.stubEnv("ACCOUNT_DATA_CURSOR_SECRET", "export-test-citation-secret-at-least-32");
        const items = selection(); items.forEach((item) => { item.evidence.sourceStatus = "unavailable"; });
        const rendered = renderEvidenceExtractsWithRanges({ personal: items });
        const citations = issueEvidenceCitations({ userId: owner, personal: items, exportContent: rendered });
        const [message] = getChatExportMessages([{ role: "assistant", content: rendered.text, citations }]);
        expect(buildChatExportMessageMarkdown(message)).toContain("Source unavailable.");
        expect(buildChatExportMessageMarkdown(message)).not.toContain("[Open source passage]");
        expect(message.content).toContain(items[0].spans[0].text);
    });

    it("does not promote old expiring verification links to permanent references", () => {
        const [message] = getChatExportMessages([{ role: "assistant", content: "An existing answer.", citations: [{ label: "Old source", href: "/evidence#oldtoken" }] }]);
        expect(buildChatExportMessageMarkdown(message)).toContain("Get a fresh answer");
        expect(JSON.stringify(message)).not.toContain("oldtoken");
        expect(buildChatExportMessageMarkdown({ role: "assistant", content: "An old export without metadata." })).toBe("An old export without metadata.");
    });

    it.each(["/evidence#temporary", "javascript:alert(1)", `https://evil.test/read/${book}`, `//evil.test/read/${book}`, `/read/${book}?highlightId=${owner}&other=1`])("rejects an unsupported export destination: %s", (sourceHref) => {
        const message = { role: "assistant" as const, content: "Quotation", sources: [{ label: "Source", start: 0, end: 9, sourceHref }] };
        const result = buildChatExportMessageMarkdown(message);
        expect(result).toContain("source links are unavailable");
        expect(result).not.toContain("[Open source passage]");
    });

    it("refuses overlapping or out-of-bounds associations rather than attaching a different passage", () => {
        const message = { role: "assistant" as const, content: "First. Second.", sources: [
            { label: "First", start: 0, end: 6, sourceHref: `/read/${book}` },
            { label: "Second", start: 5, end: 14, sourceHref: `/read/${book}` },
        ] };
        expect(buildChatExportMessageMarkdown(message)).not.toContain("[Open source passage]");
        expect(buildChatExportMessageMarkdown({ ...message, sources: [{ ...message.sources[0], end: 100 }] })).not.toContain("[Open source passage]");
    });
});
