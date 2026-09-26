import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
    PersonalEvidenceScopeSchema,
    type PersonalEvidenceCandidate,
    type PersonalEvidenceScope,
    type PersonalEvidenceSource,
} from "@/lib/personal-evidence";
import type { Database } from "@/types/database";

export const PERSONAL_EVIDENCE_PAGE_SIZE = 200;
export const PERSONAL_EVIDENCE_MAX_RECORDS = 10_000;
export const PERSONAL_EVIDENCE_MAX_BYTES = 25 * 1024 * 1024;
export const PERSONAL_EVIDENCE_TIMEOUT_MS = 20_000;

export class PersonalEvidenceRetrievalError extends Error {
    constructor(readonly code: "INVALID_SCOPE" | "INVALID_DATA" | "UNAVAILABLE" | "TOO_LARGE" | "CANCELLED" | "TIMED_OUT" | "STALE_EVIDENCE") {
        super({
            INVALID_SCOPE: "The personal evidence scope is invalid.",
            INVALID_DATA: "Personal evidence could not be verified.",
            UNAVAILABLE: "Personal evidence is temporarily unavailable. Please retry.",
            TOO_LARGE: "This evidence scope is too large to search completely. Narrow the filters and retry.",
            CANCELLED: "Personal evidence retrieval was cancelled.",
            TIMED_OUT: "Personal evidence retrieval did not finish in time. Please retry.",
            STALE_EVIDENCE: "Personal evidence changed while answering. Please retry with the current evidence.",
        }[code]);
        this.name = "PersonalEvidenceRetrievalError";
    }
}

type EvidenceTable = "user_highlights" | "user_reflections";
type EvidenceClient = Pick<SupabaseClient<Database>, "from">;
type LoadInput = {
    /** Must be the ordinary authenticated client, never an admin client. */
    supabase: EvidenceClient;
    /** Derived by the caller from the verified session, never from request JSON. */
    userId: string;
    scope: PersonalEvidenceScope;
    signal?: AbortSignal;
};

const sourceSchema = z.object({
    id: z.string().uuid(), title: z.string(), author: z.string().nullable(),
    status: z.string(), deleted_at: z.string().nullable(), updated_at: z.string(),
});
const segmentSchema = z.object({
    id: z.string().uuid(), item_id: z.string().uuid(), title: z.string().nullable(),
    markdown_body: z.string(), deleted_at: z.string().nullable(), updated_at: z.string(),
});
const relation = <T extends z.ZodTypeAny>(schema: T) => z.union([schema, z.array(schema).max(1)]).nullable();
const commonShape = {
    id: z.string().uuid(), user_id: z.string().uuid(), content_item_id: z.string().uuid(),
    created_at: z.string().nullable(), updated_at: z.string().nullable(),
    content_item: relation(sourceSchema),
};
const highlightSchema = z.object({
    ...commonShape,
    highlighted_text: z.string(), note_body: z.string().nullable(), color: z.string().nullable(),
    segment_id: z.string().uuid().nullable(), anchor_start: z.number().int().nullable(),
    anchor_end: z.number().int().nullable(), segment: relation(segmentSchema),
});
const reflectionSchema = z.object({
    ...commonShape, prompt: z.string(), reflection_text: z.string(),
});

const SOURCE_FIELDS = "content_item(id,title,author,status,deleted_at,updated_at)";
const SELECT_FIELDS = {
    user_highlights: `id,user_id,content_item_id,segment_id,highlighted_text,note_body,color,anchor_start,anchor_end,created_at,updated_at,${SOURCE_FIELDS},segment(id,item_id,title,markdown_body,deleted_at,updated_at)`,
    user_reflections: `id,user_id,content_item_id,prompt,reflection_text,created_at,updated_at,${SOURCE_FIELDS}`,
};

function firstRelation<T>(value: T | T[] | null): T | null {
    return Array.isArray(value) ? value[0] ?? null : value;
}

function fingerprint(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function verifiedSource(value: z.infer<typeof sourceSchema> | null, contentId: string): PersonalEvidenceSource | null {
    if (!value || value.id !== contentId || value.status !== "verified" || value.deleted_at !== null) return null;
    return { id: value.id, title: value.title, author: value.author, updatedAt: value.updated_at };
}

function candidateFromRow(table: EvidenceTable, value: unknown, userId: string): PersonalEvidenceCandidate {
    if (table === "user_highlights") {
        const parsed = highlightSchema.safeParse(value);
        if (!parsed.success || parsed.data.user_id !== userId) throw new PersonalEvidenceRetrievalError("INVALID_DATA");
        const row = parsed.data;
        const source = verifiedSource(firstRelation(row.content_item), row.content_item_id);
        const rawSegment = firstRelation(row.segment);
        // Independent content/segment FKs do not prove that they belong together.
        const eligibleSegment = source && rawSegment && rawSegment.id === row.segment_id
            && rawSegment.item_id === row.content_item_id && rawSegment.deleted_at === null ? rawSegment : null;
        const segment = eligibleSegment ? {
            id: eligibleSegment.id, contentItemId: eligibleSegment.item_id, title: eligibleSegment.title,
            updatedAt: eligibleSegment.updated_at, fingerprint: fingerprint(eligibleSegment),
        } : null;
        const candidate: Omit<Extract<PersonalEvidenceCandidate, { type: "highlight" }>, "fingerprint"> = {
            type: "highlight", evidenceId: `highlight:${row.id}`, id: row.id, userId,
            contentItemId: row.content_item_id, createdAt: row.created_at, updatedAt: row.updated_at,
            highlightedText: row.highlighted_text, noteBody: row.note_body, color: row.color,
            segmentId: row.segment_id, anchorStart: row.anchor_start, anchorEnd: row.anchor_end,
            sourceStatus: source ? "available" : "unavailable", source, segment,
            readerAnchor: segment && row.anchor_start !== null && row.anchor_end !== null
                && row.anchor_start >= 0 && row.anchor_end > row.anchor_start
                ? { start: row.anchor_start, end: row.anchor_end } : null,
        };
        return { ...candidate, fingerprint: fingerprint(candidate) };
    }

    const parsed = reflectionSchema.safeParse(value);
    if (!parsed.success || parsed.data.user_id !== userId) throw new PersonalEvidenceRetrievalError("INVALID_DATA");
    const row = parsed.data;
    const source = verifiedSource(firstRelation(row.content_item), row.content_item_id);
    const candidate: Omit<Extract<PersonalEvidenceCandidate, { type: "reflection" }>, "fingerprint"> = {
        type: "reflection", evidenceId: `reflection:${row.id}`, id: row.id, userId,
        contentItemId: row.content_item_id, createdAt: row.created_at, updatedAt: row.updated_at,
        prompt: row.prompt, reflectionText: row.reflection_text,
        sourceStatus: source ? "available" : "unavailable", source,
    };
    return { ...candidate, fingerprint: fingerprint(candidate) };
}

function matchesScope(candidate: PersonalEvidenceCandidate, scope: PersonalEvidenceScope): boolean {
    if (scope.contentItemId && candidate.contentItemId !== scope.contentItemId) return false;
    const hasNote = candidate.type === "highlight" && Boolean(candidate.noteBody?.trim());
    if (scope.itemType === "reflection" && candidate.type !== "reflection") return false;
    if (scope.itemType === "note" && !hasNote) return false;
    if (scope.itemType === "highlight" && (candidate.type !== "highlight" || hasNote)) return false;
    // Reflections have no color; they cannot match a color-filtered collection.
    if (scope.color && (candidate.type !== "highlight" || candidate.color !== scope.color)) return false;
    const query = scope.filterQuery?.toLowerCase();
    if (!query) return true;
    const fields = candidate.type === "highlight"
        ? [candidate.highlightedText, candidate.noteBody, candidate.source?.title, candidate.source?.author, candidate.segment?.title]
        : [candidate.prompt, candidate.reflectionText, candidate.source?.title, candidate.source?.author];
    // Literal substring semantics mirror Notes search. Never interpolate user text into PostgREST grammar.
    return fields.some((field) => field?.toLowerCase().includes(query));
}

function tablesForScope(scope: PersonalEvidenceScope): EvidenceTable[] {
    if (scope.itemType === "reflection") return scope.color ? [] : ["user_reflections"];
    if (scope.itemType === "note" || scope.itemType === "highlight" || scope.color) return ["user_highlights"];
    return ["user_highlights", "user_reflections"];
}

function assertActive(signal: AbortSignal) {
    if (signal.aborted) {
        throw new PersonalEvidenceRetrievalError(signal.reason?.name === "TimeoutError" ? "TIMED_OUT" : "CANCELLED");
    }
}

function normalizeInput(input: LoadInput) {
    const parsed = PersonalEvidenceScopeSchema.safeParse(input.scope);
    if (!parsed.success || !z.string().uuid().safeParse(input.userId).success) throw new PersonalEvidenceRetrievalError("INVALID_SCOPE");
    const deadline = AbortSignal.timeout(PERSONAL_EVIDENCE_TIMEOUT_MS);
    return { scope: parsed.data, signal: input.signal ? AbortSignal.any([input.signal, deadline]) : deadline };
}

async function fetchRows(input: LoadInput, table: EvidenceTable, scope: PersonalEvidenceScope, signal: AbortSignal, afterId?: string, ids?: string[]): Promise<unknown[]> {
    assertActive(signal);
    let query = input.supabase.from(table).select(SELECT_FIELDS[table])
        .eq("user_id", input.userId).order("id", { ascending: true }).limit(PERSONAL_EVIDENCE_PAGE_SIZE);
    if (scope.contentItemId) query = query.eq("content_item_id", scope.contentItemId);
    if (table === "user_highlights" && scope.color) query = query.filter("color", "eq", scope.color);
    if (afterId) query = query.gt("id", afterId);
    if (ids) query = query.in("id", ids);
    try {
        const { data, error } = await query.abortSignal(signal);
        assertActive(signal);
        if (error || !Array.isArray(data)) throw new PersonalEvidenceRetrievalError("UNAVAILABLE");
        return data;
    } catch (error) {
        assertActive(signal);
        if (error instanceof PersonalEvidenceRetrievalError) throw error;
        throw new PersonalEvidenceRetrievalError("UNAVAILABLE");
    }
}

function accountForPage(rows: unknown[], budget: { records: number; bytes: number }) {
    budget.records += rows.length;
    budget.bytes += Buffer.byteLength(JSON.stringify(rows), "utf8");
    if (budget.records > PERSONAL_EVIDENCE_MAX_RECORDS || budget.bytes > PERSONAL_EVIDENCE_MAX_BYTES) {
        throw new PersonalEvidenceRetrievalError("TOO_LARGE");
    }
}

/** Live interactive traversal, not an export snapshot. No partial result is ever returned. */
export async function loadPersonalEvidenceCandidates(input: LoadInput): Promise<PersonalEvidenceCandidate[]> {
    const { scope, signal } = normalizeInput(input);
    const candidates: PersonalEvidenceCandidate[] = [];
    const budget = { records: 0, bytes: 0 };
    assertActive(signal);
    for (const table of tablesForScope(scope)) {
        let afterId: string | undefined;
        while (true) {
            const rows = await fetchRows(input, table, scope, signal, afterId);
            if (rows.length === 0) break;
            accountForPage(rows, budget);
            for (const row of rows) {
                assertActive(signal);
                const candidate = candidateFromRow(table, row, input.userId);
                if (afterId && candidate.id <= afterId) throw new PersonalEvidenceRetrievalError("INVALID_DATA");
                afterId = candidate.id;
                if (matchesScope(candidate, scope)) candidates.push(candidate);
            }
            // An empty page is the completion proof. A short page might instead
            // be a lower hosted Data API cap, so it must not truncate traversal.
        }
    }
    return candidates;
}

/** Reject removed/edited evidence before the caller builds a provider prompt. */
export async function recheckPersonalEvidenceCandidates(input: LoadInput & { candidates: readonly PersonalEvidenceCandidate[] }): Promise<PersonalEvidenceCandidate[]> {
    const { scope, signal } = normalizeInput(input);
    const budget = { records: 0, bytes: 0 };
    const fresh = new Map<string, PersonalEvidenceCandidate>();
    assertActive(signal);
    if (input.candidates.length > PERSONAL_EVIDENCE_MAX_RECORDS) throw new PersonalEvidenceRetrievalError("TOO_LARGE");
    if (input.candidates.some((candidate) => candidate.userId !== input.userId || !matchesScope(candidate, scope))) {
        throw new PersonalEvidenceRetrievalError("STALE_EVIDENCE");
    }
    for (const table of tablesForScope(scope)) {
        const type = table === "user_highlights" ? "highlight" : "reflection";
        const ids = [...new Set(input.candidates.filter((candidate) => candidate.type === type).map((candidate) => candidate.id))];
        for (let offset = 0; offset < ids.length; offset += PERSONAL_EVIDENCE_PAGE_SIZE) {
            const batchIds = ids.slice(offset, offset + PERSONAL_EVIDENCE_PAGE_SIZE);
            let afterId: string | undefined;
            while (true) {
                const rows = await fetchRows(input, table, scope, signal, afterId, batchIds);
                if (rows.length === 0) break;
                accountForPage(rows, budget);
                for (const row of rows) {
                    const candidate = candidateFromRow(table, row, input.userId);
                    if (afterId && candidate.id <= afterId) throw new PersonalEvidenceRetrievalError("INVALID_DATA");
                    afterId = candidate.id;
                    if (!batchIds.includes(candidate.id)) throw new PersonalEvidenceRetrievalError("INVALID_DATA");
                    if (matchesScope(candidate, scope)) fresh.set(candidate.evidenceId, candidate);
                }
            }
        }
    }
    assertActive(signal);
    return input.candidates.map((previous) => {
        const current = fresh.get(previous.evidenceId);
        if (!current || current.fingerprint !== previous.fingerprint) throw new PersonalEvidenceRetrievalError("STALE_EVIDENCE");
        return current;
    });
}

/** Materialize only server-ranked IDs through the ordinary account's live RLS view. */
export async function loadSelectedPersonalEvidence(input: LoadInput & {
    selected: readonly { type: 'highlight' | 'reflection'; id: string }[];
}): Promise<PersonalEvidenceCandidate[]> {
    const { scope, signal } = normalizeInput(input);
    if (input.selected.length > 64 || input.selected.some((item) => !z.string().uuid().safeParse(item.id).success)) {
        throw new PersonalEvidenceRetrievalError('INVALID_SCOPE');
    }
    const found = new Map<string, PersonalEvidenceCandidate>();
    for (const table of tablesForScope(scope)) {
        const type = table === 'user_highlights' ? 'highlight' : 'reflection';
        const ids = [...new Set(input.selected.filter((item) => item.type === type).map((item) => item.id))];
        if (!ids.length) continue;
        let afterId: string | undefined;
        while (true) {
            const rows = await fetchRows(input, table, scope, signal, afterId, ids);
            if (!rows.length) break;
            for (const row of rows) {
                const candidate = candidateFromRow(table, row, input.userId);
                if ((afterId && candidate.id <= afterId) || !ids.includes(candidate.id)) throw new PersonalEvidenceRetrievalError('INVALID_DATA');
                afterId = candidate.id;
                if (matchesScope(candidate, scope)) found.set(candidate.evidenceId, candidate);
            }
        }
    }
    return input.selected.map((item) => {
        const evidence = found.get(`${item.type}:${item.id}`);
        if (!evidence) throw new PersonalEvidenceRetrievalError('STALE_EVIDENCE');
        return evidence;
    });
}
