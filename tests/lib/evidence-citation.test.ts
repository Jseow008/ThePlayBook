import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { RankedPersonalEvidence } from "@/lib/server/personal-evidence-ranking";
import { issueEvidenceCitations, resolveEvidenceCitation } from "@/lib/server/evidence-citation";
import { loadSelectedPersonalEvidence, PersonalEvidenceRetrievalError } from "@/lib/server/personal-evidence-candidates";
import { retrievalTextResponse } from "@/lib/server/retrieval-response";
import { getMessageCitations } from "@/lib/evidence-citation";
vi.mock("@/lib/server/personal-evidence-candidates", async (original) => ({ ...await original<typeof import("@/lib/server/personal-evidence-candidates")>(), loadSelectedPersonalEvidence: vi.fn() }));
const userId = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const contentItemId = "33333333-3333-4333-8333-333333333333";
const text = "before 🌱 exact <script> & **words**\nafter";
const selected = (): RankedPersonalEvidence => ({ evidence: {
    type: "highlight", id, evidenceId: `highlight:${id}`, userId, contentItemId,
    createdAt: "2026-09-26", updatedAt: "2026-09-26", fingerprint: "revision-one", sourceStatus: "available",
    source: { id: contentItemId, title: "Source", author: null, updatedAt: "2026-09-26" },
    highlightedText: "highlight", noteBody: text, color: null, segmentId: null, anchorStart: null, anchorEnd: null, segment: null, readerAnchor: null,
}, score: 1, exactQuote: null, spans: [{ field: "noteBody", start: 7, end: text.length - 6, text: text.slice(7, -6), score: 1 }] });
let rows: unknown[];
const query = () => {
    const builder = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn(), abortSignal: vi.fn() };
    for (const method of [builder.select, builder.eq, builder.is, builder.abortSignal]) method.mockReturnValue(builder);
    builder.maybeSingle.mockImplementation(async () => ({ data: rows.shift(), error: null }));
    return builder;
};
const client = { from: vi.fn(() => query()) } as unknown as Pick<SupabaseClient<Database>, "from">;
const tokenFor = (item = selected()) => issueEvidenceCitations({ userId, personal: [item] })[0].href.split("#")[1];
const resolve = (token: string, owner = userId) => resolveEvidenceCitation({ token, userId: owner, supabase: client, signal: new AbortController().signal });
beforeEach(() => { vi.stubEnv("ACCOUNT_DATA_CURSOR_SECRET", "citation-test-secret-only-32-characters-long"); vi.clearAllMocks(); rows = []; vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([selected().evidence]); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("response-scoped evidence references", () => {
    it("resolves exact UTF-16 slices with literal context", async () => {
        const result = await resolve(tokenFor());
        expect(result).toMatchObject({ state: "available", passages: [{ text: text.slice(7, -6), before: "before ", after: "\nafter" }] });
        expect(JSON.stringify(result)).not.toContain("<a ");
    });
    it("encrypts capture text and mints separate opaque references per response", () => {
        const one = tokenFor(); expect(tokenFor()).not.toBe(one);
        expect(Buffer.from(one, "base64url").toString("utf8")).not.toContain("exact");
    });
    it("rejects tampered, expired and foreign-account references before database reads", async () => {
        const token = tokenFor();
        expect(await resolve(`A${token.slice(1, -1)}B`)).toEqual({ state: "unavailable" });
        expect(await resolve(token, contentItemId)).toEqual({ state: "unavailable" });
        vi.useFakeTimers(); vi.setSystemTime(Date.now() + 86_400_001);
        expect(await resolve(token)).toEqual({ state: "unavailable" });
        expect(loadSelectedPersonalEvidence).not.toHaveBeenCalled();
    });
    it("rejects invented, ambiguous and non-owned selections", () => {
        expect(() => issueEvidenceCitations({ userId, personal: [selected()], evidenceIds: ["invented"] })).toThrow();
        expect(() => issueEvidenceCitations({ userId, personal: [selected(), selected()] })).toThrow();
        expect(() => issueEvidenceCitations({ userId: contentItemId, personal: [selected()] })).toThrow();
        const bad = selected(); bad.spans[0].text = "invented quote";
        expect(() => tokenFor(bad)).toThrow();
    });
    it("does not serve an excerpt after record or note-field deletion", async () => {
        const token = tokenFor();
        vi.mocked(loadSelectedPersonalEvidence).mockRejectedValueOnce(new PersonalEvidenceRetrievalError("STALE_EVIDENCE"));
        expect(await resolve(token)).toEqual({ state: "unavailable" });
        const current = selected().evidence;
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([{ ...current, ...current.type === "highlight" ? { noteBody: null } : {} }]);
        expect(await resolve(token)).toEqual({ state: "unavailable" });
    });
    it("labels still-owned changed context; never substitutes edited text", async () => {
        const token = tokenFor(); const current = selected().evidence;
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([{ ...current, fingerprint: "revision-two", ...current.type === "highlight" ? { noteBody: "replaced" } : {} }]);
        expect(await resolve(token)).toMatchObject({ state: "changed", passages: [{ text: text.slice(7, -6), before: "", after: "" }] });
    });
    it("withdrawn sources expose only personal context without a reader link", async () => {
        const token = tokenFor();
        vi.mocked(loadSelectedPersonalEvidence).mockResolvedValue([{ ...selected().evidence, sourceStatus: "unavailable", source: null, fingerprint: "withdrawn" }]);
        const result = await resolve(token);
        expect(result).toMatchObject({ state: "withdrawn", title: "Saved personal evidence" });
        expect(result.sourceHref).toBeUndefined();
    });
    it("keeps database failure distinct from unavailable evidence", async () => {
        vi.mocked(loadSelectedPersonalEvidence).mockRejectedValue(new PersonalEvidenceRetrievalError("UNAVAILABLE"));
        await expect(resolve(tokenFor())).rejects.toThrow();
    });
    it("checks current source membership, revision, publication and deletion", async () => {
        const source = { type: "source_segment" as const, id, evidenceId: `source_segment:${id}`, contentItemId, title: "Source", text,
            fingerprint: createHash("sha256").update(JSON.stringify([id, contentItemId, "Source", text])).digest("hex"), score: 1,
            span: { start: 7, end: text.length - 6, text: text.slice(7, -6) } };
        const token = issueEvidenceCitations({ userId, personal: [], sources: [source], evidenceIds: [source.evidenceId] })[0].href.split("#")[1];
        rows = [null]; expect(await resolve(token)).toEqual({ state: "unavailable" });
        rows = [{ content_item_id: contentItemId }, null]; expect(await resolve(token)).toEqual({ state: "withdrawn" });
        const row = { id, item_id: contentItemId, markdown_body: text, content_item: { id: contentItemId, title: "Source", status: "verified", deleted_at: null } };
        rows = [{ content_item_id: contentItemId }, row]; expect(await resolve(token)).toMatchObject({ state: "available", passages: [{ text: source.span.text }] });
        rows = [{ content_item_id: contentItemId }, { ...row, markdown_body: "edited" }];
        expect(await resolve(token)).toEqual({ state: "changed", kind: "source_segment", title: "Source" });
        rows = [{ content_item_id: contentItemId }, { ...row, content_item: { ...row.content_item, status: "draft" } }];
        expect(await resolve(token)).toEqual({ state: "withdrawn" });
    });
    it("transports citations separately without rewriting exact quotation text", async () => {
        const links = issueEvidenceCitations({ userId, personal: [selected()] });
        const stream = await retrievalTextResponse(text, "ui", links).text();
        const events = stream.split("\n").filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
        expect(events.filter((event) => event.type === "text-delta").map((event) => event.delta).join("")).toBe(text);
        expect(getMessageCitations({ parts: events })).toEqual(links);
        expect(getMessageCitations({ parts: [{ type: "text", text: "[fake](/evidence#fake)" }, { type: "data-citations", data: [{ label: "x", href: "javascript:bad" }] }] })).toEqual([]);
        expect(await retrievalTextResponse(text, "text", links).text()).toBe(text);
    });
});
