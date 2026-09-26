import { describe, expect, it, vi } from "vitest";
import { PersonalEvidenceScopeSchema, type PersonalEvidenceScope } from "@/lib/personal-evidence";
import {
    loadPersonalEvidenceCandidates,
    recheckPersonalEvidenceCandidates,
    PERSONAL_EVIDENCE_MAX_RECORDS,
} from "@/lib/server/personal-evidence-candidates";

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const USER = uuid(90_001);
const OTHER_USER = uuid(90_002);
const CONTENT = uuid(90_003);
const SEGMENT = uuid(90_004);
const scope: PersonalEvidenceScope = { version: 1, itemType: "all" };
const source = { id: CONTENT, title: "Stored source", author: "An author", status: "verified", deleted_at: null, updated_at: "2026-09-19T00:00:00Z" };
const segment = { id: SEGMENT, item_id: CONTENT, title: "Source section", markdown_body: "Original source body.", deleted_at: null, updated_at: "2026-09-19T00:00:00Z" };

function highlight(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: uuid(index), user_id: USER, content_item_id: CONTENT, segment_id: SEGMENT,
        highlighted_text: "Full stored selection", note_body: null, color: "yellow",
        anchor_start: 0, anchor_end: 21, created_at: null, updated_at: null,
        content_item: source, segment, ...overrides,
    };
}

function reflection(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: uuid(index), user_id: USER, content_item_id: CONTENT,
        prompt: "How will I use this?", reflection_text: "My independent interpretation.",
        created_at: "2026-09-19T00:00:00Z", updated_at: "2026-09-19T00:00:00Z",
        content_item: source, ...overrides,
    };
}

type Tables = { user_highlights: Record<string, unknown>[]; user_reflections: Record<string, unknown>[] };
type Client = Parameters<typeof loadPersonalEvidenceCandidates>[0]["supabase"];

function clientFor(tables: Partial<Tables>, options: { cap?: number; failOnCall?: number; ignoreFilters?: boolean; onCall?: (call: number) => void } = {}) {
    let calls = 0;
    const queries: Array<{ table: string; fields: string; signal?: AbortSignal }> = [];
    const from = vi.fn((table: keyof Tables) => {
        const filters: Array<(row: Record<string, unknown>) => boolean> = [];
        let limit = Infinity;
        const record: (typeof queries)[number] = { table, fields: "" };
        queries.push(record);
        const query = {
            select(fields: string) { record.fields = fields; return query; },
            eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
            filter(key: string, _operator: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
            order() { return query; },
            limit(value: number) { limit = value; return query; },
            gt(key: string, value: string) { filters.push((row) => String(row[key]) > value); return query; },
            in(key: string, values: string[]) { filters.push((row) => values.includes(String(row[key]))); return query; },
            abortSignal(signal: AbortSignal) { record.signal = signal; return query; },
            then(resolve: (value: { data: unknown[] | null; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) {
                calls += 1;
                options.onCall?.(calls);
                const result = calls === options.failOnCall
                    ? { data: null, error: { message: "private backend detail that must not escape" } }
                    : {
                        data: (tables[table] ?? [])
                            .filter((row) => options.ignoreFilters || filters.every((filter) => filter(row)))
                            .sort((left, right) => String(left.id).localeCompare(String(right.id)))
                            .slice(0, Math.min(limit, options.cap ?? Infinity)),
                        error: null,
                    };
                return Promise.resolve(result).then(resolve, reject);
            },
        };
        return query;
    });
    return { supabase: { from } as unknown as Client, from, queries };
}

describe("complete live personal evidence candidates", () => {
    it("traverses past 1,000 records and a lower API cap with equal/null timestamps", async () => {
        const client = clientFor({ user_highlights: Array.from({ length: 1_205 }, (_, index) => highlight(index + 1)) }, { cap: 73 });
        const rows = await loadPersonalEvidenceCandidates({ ...client, userId: USER, scope });
        expect(rows).toHaveLength(1_205);
        expect(new Set(rows.map((row) => row.evidenceId)).size).toBe(1_205);
        expect(rows.at(-1)?.id).toBe(uuid(1_205));
        expect(client.queries.every((query) => query.signal instanceof AbortSignal)).toBe(true);
    });

    it("applies complete-set literal filters without clipping decisive text or SQL-like characters", async () => {
        const rows = Array.from({ length: 240 }, (_, index) => highlight(index + 1));
        const text = `${"early irrelevant text ".repeat(60)}100%_literal`;
        rows.push(highlight(241, { highlighted_text: text }));
        const client = clientFor({ user_highlights: rows });
        const result = await loadPersonalEvidenceCandidates({ ...client, userId: USER, scope: { ...scope, filterQuery: "100%_literal" } });
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ id: uuid(241), highlightedText: text });
    });

    it("separates notes, bare highlights, and reflections with full stored fields", async () => {
        const tables = { user_highlights: [highlight(1), highlight(2, { note_body: "User disagrees with the author." })], user_reflections: [reflection(3)] };
        for (const [itemType, ids] of [
            ["all", [uuid(1), uuid(2), uuid(3)]], ["highlight", [uuid(1)]], ["note", [uuid(2)]], ["reflection", [uuid(3)]],
        ] as const) {
            const result = await loadPersonalEvidenceCandidates({ ...clientFor(tables), userId: USER, scope: { version: 1, itemType } });
            expect(result.map((row) => row.id)).toEqual(ids);
        }
        const result = await loadPersonalEvidenceCandidates({ ...clientFor(tables), userId: USER, scope });
        expect(result[1]).toMatchObject({ type: "highlight", noteBody: "User disagrees with the author.", highlightedText: "Full stored selection" });
        expect(result[2]).toMatchObject({ type: "reflection", prompt: "How will I use this?", reflectionText: "My independent interpretation." });
    });

    it("matches reflection prompt/body and excludes reflections from a color scope", async () => {
        const tables = { user_reflections: [reflection(1)] };
        const result = await loadPersonalEvidenceCandidates({ ...clientFor(tables), userId: USER, scope: { ...scope, filterQuery: "independent" } });
        expect(result).toHaveLength(1);
        await expect(loadPersonalEvidenceCandidates({ ...clientFor(tables), userId: USER, scope: { ...scope, color: "yellow" } })).resolves.toEqual([]);
    });

    it("keeps owned captures when sources are hidden and never invents withdrawal status", async () => {
        const client = clientFor({ user_highlights: [highlight(1, { content_item: null, segment: null })], user_reflections: [reflection(2, { content_item: null })] });
        const result = await loadPersonalEvidenceCandidates({ ...client, userId: USER, scope });
        expect(result).toHaveLength(2);
        expect(result.every((row) => row.sourceStatus === "unavailable" && row.source === null)).toBe(true);
        expect(result[0]).toMatchObject({ highlightedText: "Full stored selection", readerAnchor: null });
        expect(client.queries.some((query) => query.table === "user_library")).toBe(false);
    });

    it("suppresses draft/deleted source metadata and mismatched source anchors", async () => {
        const client = clientFor({ user_highlights: [
            highlight(1, { content_item: { ...source, status: "draft" } }),
            highlight(2, { content_item: { ...source, deleted_at: "2026-09-19" } }),
            highlight(3, { segment: { ...segment, item_id: uuid(77) } }),
            highlight(4, { segment: { ...segment, deleted_at: "2026-09-19" } }),
        ] });
        const result = await loadPersonalEvidenceCandidates({ ...client, userId: USER, scope });
        expect(result[0].source).toBeNull();
        expect(result[1].source).toBeNull();
        expect(result.every((row) => row.type === "highlight" && row.readerAnchor === null && row.segment === null)).toBe(true);
    });

    it("enforces user ownership in both database predicates and returned rows", async () => {
        const tables = { user_highlights: [highlight(1), highlight(2, { user_id: OTHER_USER })] };
        const result = await loadPersonalEvidenceCandidates({ ...clientFor(tables), userId: USER, scope });
        expect(result.map((row) => row.id)).toEqual([uuid(1)]);
        await expect(loadPersonalEvidenceCandidates({ ...clientFor(tables, { ignoreFilters: true }), userId: USER, scope })).rejects.toMatchObject({ code: "INVALID_DATA" });
    });

    it("rejects an interrupted traversal without returning its earlier successful page", async () => {
        const client = clientFor({ user_highlights: Array.from({ length: 201 }, (_, index) => highlight(index + 1)) }, { failOnCall: 2 });
        await expect(loadPersonalEvidenceCandidates({ ...client, userId: USER, scope })).rejects.toMatchObject({
            code: "UNAVAILABLE", message: "Personal evidence is temporarily unavailable. Please retry.",
        });
    });

    it("rejects over-cap collections instead of silently truncating", async () => {
        const client = clientFor({ user_highlights: Array.from({ length: PERSONAL_EVIDENCE_MAX_RECORDS + 1 }, (_, index) => highlight(index + 1)) });
        await expect(loadPersonalEvidenceCandidates({ ...client, userId: USER, scope })).rejects.toMatchObject({ code: "TOO_LARGE" });
    });

    it("enforces the UTF-8 byte cap even for a small record count", async () => {
        const client = clientFor({ user_highlights: [highlight(1, { note_body: "界".repeat(9 * 1024 * 1024) })] });
        await expect(loadPersonalEvidenceCandidates({ ...client, userId: USER, scope })).rejects.toMatchObject({ code: "TOO_LARGE" });
    });

    it("cancels before and during database traversal", async () => {
        const before = new AbortController();
        before.abort();
        const client = clientFor({});
        await expect(loadPersonalEvidenceCandidates({ ...client, userId: USER, scope, signal: before.signal })).rejects.toMatchObject({ code: "CANCELLED" });
        expect(client.from).not.toHaveBeenCalled();
        const during = new AbortController();
        const pending = clientFor({ user_highlights: [highlight(1)] }, { onCall: () => during.abort() });
        await expect(loadPersonalEvidenceCandidates({ ...pending, userId: USER, scope, signal: during.signal })).rejects.toMatchObject({ code: "CANCELLED" });
    });

    it("rejects malformed scope fields instead of silently broadening scope", () => {
        expect(PersonalEvidenceScopeSchema.safeParse({ version: 2, itemType: "all" }).success).toBe(false);
        expect(PersonalEvidenceScopeSchema.safeParse({ ...scope, userId: OTHER_USER }).success).toBe(false);
        expect(PersonalEvidenceScopeSchema.safeParse({ ...scope, filterQuery: "x".repeat(161) }).success).toBe(false);
    });
});

describe("freshness recheck before generation", () => {
    it("rechecks selected evidence in requested order, including a lower Data API cap", async () => {
        const tables = { user_highlights: [highlight(1), highlight(2)], user_reflections: [reflection(3)] };
        const candidates = await loadPersonalEvidenceCandidates({ ...clientFor(tables), userId: USER, scope });
        const ordered = [candidates[2], candidates[1], candidates[0]];
        const fresh = await recheckPersonalEvidenceCandidates({ ...clientFor(tables, { cap: 1 }), userId: USER, scope, candidates: ordered });
        expect(fresh.map((row) => row.evidenceId)).toEqual(ordered.map((row) => row.evidenceId));
    });

    it("rejects deleted records despite a previous successful retrieval", async () => {
        const candidates = await loadPersonalEvidenceCandidates({ ...clientFor({ user_highlights: [highlight(1)] }), userId: USER, scope });
        await expect(recheckPersonalEvidenceCandidates({ ...clientFor({}), userId: USER, scope, candidates })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
    });

    it("hashes actual text so edits with unchanged timestamps are rejected", async () => {
        const candidates = await loadPersonalEvidenceCandidates({ ...clientFor({ user_highlights: [highlight(1)] }), userId: USER, scope });
        const changed = clientFor({ user_highlights: [highlight(1, { note_body: "A changed opinion" })] });
        await expect(recheckPersonalEvidenceCandidates({ ...changed, userId: USER, scope, candidates })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
    });

    it("rejects changed source text or withdrawn source context", async () => {
        const candidates = await loadPersonalEvidenceCandidates({ ...clientFor({ user_highlights: [highlight(1)] }), userId: USER, scope });
        for (const row of [highlight(1, { segment: { ...segment, markdown_body: "Edited passage" } }), highlight(1, { content_item: null, segment: null })]) {
            await expect(recheckPersonalEvidenceCandidates({ ...clientFor({ user_highlights: [row] }), userId: USER, scope, candidates })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
        }
    });

    it("rejects cross-account or newly excluded candidates before querying", async () => {
        const candidates = await loadPersonalEvidenceCandidates({ ...clientFor({ user_reflections: [reflection(1)] }), userId: USER, scope });
        const client = clientFor({});
        await expect(recheckPersonalEvidenceCandidates({ ...client, userId: OTHER_USER, scope, candidates })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
        await expect(recheckPersonalEvidenceCandidates({ ...client, userId: USER, scope: { version: 1, itemType: "highlight" }, candidates })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
        expect(client.from).not.toHaveBeenCalled();
    });
});
