import { structuralSelectionOutput } from "@/tests/fixtures/retrieval/selection-output";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool, type PoolClient } from "pg";
import { createClient as createSupabaseClient, type Session } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { PersonalEvidenceScope } from "@/lib/personal-evidence";
import { loadPersonalEvidenceCandidates, recheckPersonalEvidenceCandidates } from "@/lib/server/personal-evidence-candidates";
import { rankPersonalEvidence, chunkPersonalEvidenceText, PersonalEvidenceVectorCache, PERSONAL_EMBEDDING_DIMENSIONS } from "@/lib/server/personal-evidence-ranking";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";
import { retrievePersonalEvidence } from "@/lib/server/personal-retrieval";
import { assertActivePersonalRetrievalSession } from "@/lib/server/personal-retrieval-session";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const databaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
const workerDatabaseUrl = process.env.SNAPSHOT_WORKER_DATABASE_URL;
const apiUrl = process.env.DB107_SUPABASE_URL;
const anonKey = process.env.DB107_SUPABASE_ANON_KEY;
const configured = Boolean(databaseUrl && workerDatabaseUrl && apiUrl && anonKey);
if (process.env.PERSONAL_EVIDENCE_RUNTIME_REQUIRED === "1" && !configured) {
    throw new Error("Personal evidence runtime checks require the existing disposable DB107 database, worker, URL and anon key.");
}
// Fixtures must never run against a linked/hosted project, even when an operator
// accidentally provides a production connection string to this test command.
for (const value of [databaseUrl, workerDatabaseUrl, apiUrl].filter((value): value is string => Boolean(value))) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) {
        throw new Error("Personal evidence runtime fixtures require loopback-only disposable Supabase URLs.");
    }
}
const describeDatabase = configured ? describe : describe.skip;
const apiCap = Number(readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8").match(/^max_rows\s*=\s*(\d+)/m)?.[1]);
if (!Number.isInteger(apiCap) || apiCap < 1 || apiCap > 9_900) throw new Error("Review the personal evidence fixture size against the configured Data API cap.");

function authClient() {
    return createSupabaseClient<Database>(apiUrl!, anonKey!, {
        auth: { storageKey: `personal-runtime-${randomUUID()}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
}

// These deliberately synthetic vectors test complete candidate delivery and
// deterministic ranking mechanics. They make no semantic-quality claim and
// never call a paid embedding or generation provider.
async function deterministicEmbeddings(texts: string[]) {
    return texts.map((text) => {
        const vector = Array<number>(PERSONAL_EMBEDDING_DIMENSIONS).fill(0);
        vector[text.includes("late personal needle") ? 0 : 1] = 1;
        return vector;
    });
}

describeDatabase("typed personal retrieval through real ordinary-account Supabase clients", () => {
    const db = new Pool({ connectionString: databaseUrl, max: 2 });
    const contentId = randomUUID();
    const otherContentId = randomUUID();
    const withdrawnContentId = randomUUID();
    const segmentId = randomUUID();
    const otherSegmentId = randomUUID();
    const prefix = randomUUID().slice(0, 8);
    const evidenceId = (index: number) => `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const noiseCount = apiCap + 1;
    const lateNoteId = evidenceId(noiseCount + 1);
    const lateHighlightId = evidenceId(noiseCount + 2);
    const mismatchId = evidenceId(noiseCount + 3);
    const withdrawnHighlightId = evidenceId(noiseCount + 4);
    const reflectionId = evidenceId(noiseCount + 5);
    const withdrawnReflectionId = evidenceId(noiseCount + 6);
    const otherHighlightId = evidenceId(noiseCount + 7);
    const otherReflectionId = evidenceId(noiseCount + 8);
    const fullQuote = `${"Unrelated introduction. ".repeat(35)}late personal needle: exact 100%_kept quotation.`;
    const allScope: PersonalEvidenceScope = { version: 1, itemType: "all" };
    let clientA: ReturnType<typeof authClient>;
    let clientB: ReturnType<typeof authClient>;
    let accountA: string;
    let accountB: string;
    let sessionB: Session;
    let workerToken: string | undefined;
    let resetLibraryForAccount: typeof import("@/lib/server/account-data-snapshots").resetLibraryForAccount;
    let resetAccountDataSnapshotPoolForTests: typeof import("@/lib/server/account-data-snapshots").resetAccountDataSnapshotPoolForTests;

    beforeAll(async () => {
        clientA = authClient();
        clientB = authClient();
        for (const [client, label] of [[clientA, "a"], [clientB, "b"]] as const) {
            const signup = await client.auth.signUp({ email: `personal-${label}-${randomUUID()}@example.invalid`, password: `fixture-${randomUUID()}-Aa1!` });
            expect(signup.error).toBeNull();
            if (!signup.data.user || !signup.data.session) throw new Error("Disposable ordinary-user signup did not establish a session.");
            if (label === "a") accountA = signup.data.user.id;
            else { accountB = signup.data.user.id; sessionB = signup.data.session; }
            const verified = await client.auth.getUser();
            expect(verified.error).toBeNull();
            expect(verified.data.user?.id).toBe(signup.data.user.id);
        }
        const roles = await db.query<{ role: string }>("SELECT role FROM public.profiles WHERE id = ANY($1::uuid[])", [[accountA, accountB]]);
        expect(roles.rows).toHaveLength(2);
        expect(roles.rows.every((row) => row.role === "user")).toBe(true);
        await db.query(
            `INSERT INTO public.content_item (id, type, title, author, status)
             VALUES ($1, 'article', 'Personal runtime source', 'Fixture author', 'verified'),
                    ($2, 'article', 'Other runtime source', 'Other fixture author', 'verified'),
                    ($3, 'article', 'Withdrawable runtime source', 'Withdrawable author', 'verified')`,
            [contentId, otherContentId, withdrawnContentId],
        );
        await db.query(
            `INSERT INTO public.segment (id, item_id, order_index, title, markdown_body)
             VALUES ($1, $2, 0, 'Owned source context', $3), ($4, $5, 0, 'Wrong source context', 'Unrelated source passage')`,
            [segmentId, contentId, fullQuote, otherSegmentId, otherContentId],
        );
        await db.query(
            `INSERT INTO public.user_highlights (id, user_id, content_item_id, highlighted_text, color, created_at, updated_at)
             SELECT value::uuid, $1, $2, 'Noise passage ' || ordinality, 'blue',
                    CASE WHEN ordinality % 2 = 0 THEN NULL ELSE '2026-01-01'::timestamptz END, '2026-01-01'
             FROM unnest($3::text[]) WITH ORDINALITY AS fixture(value, ordinality)`,
            [accountA, contentId, Array.from({ length: noiseCount }, (_, index) => evidenceId(index + 1))],
        );
        await db.query(
            `INSERT INTO public.user_highlights (id, user_id, content_item_id, segment_id, highlighted_text, note_body, color, anchor_start, anchor_end, created_at, updated_at)
             VALUES ($1, $2, $3, NULL, 'A source claim', 'My late personal needle interpretation', 'yellow', NULL, NULL, '2000-01-01', '2000-01-01'),
                    ($4, $2, $3, $5, $6, NULL, 'green', 0, $7, '2000-01-01', '2000-01-01'),
                    ($8, $2, $3, $9, 'Retained mismatched capture', NULL, 'yellow', 0, 10, '2000-01-01', '2000-01-01'),
                    ($10, $2, $11, NULL, 'Retained withdrawn capture', 'Personal withdrawn-source opinion', 'pink', NULL, NULL, '2000-01-01', '2000-01-01'),
                    ($12, $13, $3, NULL, 'Other account private capture', 'Private late personal needle', 'yellow', NULL, NULL, '2000-01-01', '2000-01-01')`,
            [lateNoteId, accountA, contentId, lateHighlightId, segmentId, fullQuote, fullQuote.length, mismatchId, otherSegmentId, withdrawnHighlightId, withdrawnContentId, otherHighlightId, accountB],
        );
        await db.query(
            `INSERT INTO public.user_reflections (id, user_id, content_item_id, prompt, reflection_text)
             VALUES ($1, $2, $3, 'How will I use this?', 'A late personal needle reflection'),
                    ($4, $2, $5, 'What will remain?', 'My retained withdrawn-source reflection'),
                    ($6, $7, $3, 'Private prompt', 'Other account private reflection')`,
            [reflectionId, accountA, contentId, withdrawnReflectionId, withdrawnContentId, otherReflectionId, accountB],
        );
        await db.query("INSERT INTO public.user_library (user_id, content_id, is_bookmarked) VALUES ($1, $2, true)", [accountA, contentId]);
        ({ resetLibraryForAccount, resetAccountDataSnapshotPoolForTests } = await import("@/lib/server/account-data-snapshots"));
    }, 30_000);

    afterAll(async () => {
        if (workerToken) await releaseWorker(workerToken);
        if (resetAccountDataSnapshotPoolForTests) await resetAccountDataSnapshotPoolForTests();
        await db.query("DELETE FROM public.content_item WHERE id = ANY($1::uuid[])", [[contentId, otherContentId, withdrawnContentId]]);
        await db.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[accountA, accountB].filter(Boolean)]);
        await db.end();
    }, 30_000);

    const loadA = (scope = allScope) => loadPersonalEvidenceCandidates({ supabase: clientA, userId: accountA, scope });

    type IndexJob = {
        evidence_type: "highlight" | "reflection"; evidence_id: string; user_id: string;
        revision: string; lease_token: string; attempts: number;
        highlighted_text: string | null; note_body: string | null; prompt: string | null; reflection_text: string | null;
    };
    type IndexResult = {
        status: "ready" | "pending" | "failed"; total_records: number; ready_records: number; pending_records: number; failed_records: number;
        matches: Array<{ evidence_type: string; evidence_id: string; revision: string; field: string; start_offset: number; end_offset: number; similarity: number }>;
    };
    const queryVector = Array.from({ length: PERSONAL_EMBEDDING_DIMENSIONS }, (_, index) => index === 0 ? 1 : 0);
    async function asService<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await db.connect();
        await client.query("BEGIN");
        try {
            await client.query("SET LOCAL ROLE service_role");
            await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
            const result = await work(client);
            await client.query("COMMIT");
            return result;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally { client.release(); }
    }
    async function claimIndex(limit = 10): Promise<IndexJob[]> {
        if (!workerToken) {
            const lease = await acquireWorker();
            if (!lease) throw new Error("Disposable fixture worker lease was not available.");
            workerToken = lease.worker_token;
        }
        return asService(async (client) => (await client.query<{ result: IndexJob[] }>("SELECT public.claim_personal_evidence_index($1, $2, 90) AS result", [workerToken, limit])).rows[0].result);
    }
    async function acquireWorker() {
        return asService(async (client) => (await client.query<{ result: { worker_token: string; worker_expires_at: string } | null }>(
            "SELECT public.acquire_personal_evidence_worker(90) AS result",
        )).rows[0].result);
    }
    async function releaseWorker(token: string) {
        return asService(async (client) => (await client.query<{ result: boolean }>(
            "SELECT public.release_personal_evidence_worker($1) AS result", [token],
        )).rows[0].result);
    }
    async function indexChunks(job: IndexJob) {
        const fields = job.evidence_type === "highlight"
            ? [["highlightedText", job.highlighted_text], ["noteBody", job.note_body]] as const
            : [["prompt", job.prompt], ["reflectionText", job.reflection_text]] as const;
        const chunks = fields.flatMap(([field, text]) => !text?.trim() ? [] : chunkPersonalEvidenceText(text).map((span, chunk_index) => ({ field, chunk_index, start_offset: span.start, end_offset: span.end, text: span.text })));
        const vectors = await deterministicEmbeddings(chunks.map((chunk) => chunk.text));
        return chunks.map((chunk, index) => ({
            field: chunk.field, chunk_index: chunk.chunk_index, start_offset: chunk.start_offset,
            end_offset: chunk.end_offset, embedding: vectors[index],
        }));
    }
    async function completeIndex(job: IndexJob, chunks?: Awaited<ReturnType<typeof indexChunks>>) {
        const payload = chunks ?? await indexChunks(job);
        return asService(async (client) => (await client.query<{ result: boolean }>(
            "SELECT public.complete_personal_evidence_index($1,$2,$3,$4,$5::jsonb) AS result",
            [job.evidence_type, job.evidence_id, job.revision, job.lease_token, JSON.stringify(payload)],
        )).rows[0].result);
    }
    async function drainIndex() {
        for (let round = 0; round < 200; round++) {
            const jobs = await claimIndex();
            if (jobs.length === 0) return;
            for (const job of jobs) expect(await completeIndex(job)).toBe(true);
        }
        throw new Error("Disposable personal index drain exceeded its fixture bound.");
    }
    async function indexedSearch(scope = allScope, client = clientA, field?: string): Promise<IndexResult> {
        const result = await client.rpc("match_personal_evidence", {
            p_scope: scope, p_query_embedding: JSON.stringify(queryVector), ...(field ? { p_field: field } : {}),
        });
        expect(result.error).toBeNull();
        return result.data as unknown as IndexResult;
    }
    async function makePendingCapture(text: string) {
        const id = randomUUID();
        await db.query("INSERT INTO public.user_highlights(id,user_id,content_item_id,highlighted_text) VALUES ($1,$2,$3,$4)", [id, accountA, contentId, text]);
        return id;
    }

    it("traverses beyond the real API cap with timestamp ties/nulls, then ranks and rechecks late evidence", async () => {
        const firstApiPage = await clientA.from("user_highlights").select("id").eq("user_id", accountA);
        expect(firstApiPage.error).toBeNull();
        expect(firstApiPage.data).toHaveLength(apiCap);
        const candidates = await loadA();
        expect(candidates).toHaveLength(noiseCount + 6);
        expect(new Set(candidates.map((candidate) => candidate.evidenceId)).size).toBe(noiseCount + 6);
        expect(candidates.find((candidate) => candidate.id === lateNoteId)?.createdAt).toContain("2000-01-01");
        expect(candidates.some((candidate) => candidate.createdAt === null)).toBe(true);
        const ranked = await rankPersonalEvidence({
            candidates, ownerId: accountA, question: "late personal needle", embedBatch: deterministicEmbeddings,
            cache: new PersonalEvidenceVectorCache(),
        });
        expect(ranked.stats).toMatchObject({ complete: true, candidateCount: noiseCount + 6 });
        expect(ranked.items.map((item) => item.evidence.id)).toEqual(expect.arrayContaining([lateNoteId, lateHighlightId, reflectionId]));
        expect(ranked.items.every((item) => item.evidence.userId === accountA)).toBe(true);
        const checked = await recheckPersonalEvidenceCandidates({ supabase: clientA, userId: accountA, scope: allScope, candidates: ranked.items.map((item) => item.evidence) });
        expect(checked.map((candidate) => candidate.evidenceId)).toEqual(ranked.items.map((item) => item.evidence.evidenceId));
    }, 15_000);

    it("enforces owner RLS even when a different account ID is supplied", async () => {
        const other = await loadPersonalEvidenceCandidates({ supabase: clientB, userId: accountB, scope: allScope });
        expect(other.map((candidate) => candidate.id).sort()).toEqual([otherHighlightId, otherReflectionId].sort());
        await expect(loadPersonalEvidenceCandidates({ supabase: clientA, userId: accountB, scope: allScope })).resolves.toEqual([]);
        await expect(recheckPersonalEvidenceCandidates({ supabase: clientA, userId: accountA, scope: allScope, candidates: other })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
    });

    it("applies reflection, note, source, color and literal filters across the complete owned collection", async () => {
        expect((await loadA({ version: 1, itemType: "reflection" })).map((candidate) => candidate.id).sort()).toEqual([reflectionId, withdrawnReflectionId].sort());
        expect((await loadA({ version: 1, itemType: "note", contentItemId: contentId, color: "yellow" })).map((candidate) => candidate.id)).toEqual([lateNoteId]);
        expect((await loadA({ version: 1, itemType: "all", filterQuery: "100%_kept" })).map((candidate) => candidate.id)).toEqual([lateHighlightId]);
        expect((await loadA({ version: 1, itemType: "all", filterQuery: "late personal needle" })).map((candidate) => candidate.id).sort()).toEqual([lateHighlightId, lateNoteId, reflectionId].sort());
    });

    it("preserves the exact stored quote beyond the previous clipping threshold", async () => {
        const candidates = await loadA({ version: 1, itemType: "highlight", filterQuery: "100%_kept" });
        const ranked = await rankPersonalEvidence({
            candidates, ownerId: accountA, question: "late personal needle", embedBatch: deterministicEmbeddings,
            cache: new PersonalEvidenceVectorCache(), exactQuote: { evidenceId: `highlight:${lateHighlightId}`, field: "highlightedText" },
        });
        expect(ranked.items[0].exactQuote).toBe(fullQuote);
        expect(ranked.items[0].evidence).toMatchObject({ segmentId, readerAnchor: { start: 0, end: fullQuote.length } });
    });

    it("rejects a live edit with unchanged timestamp and deletion after selection", async () => {
        const selected = await loadA({ version: 1, itemType: "note", contentItemId: contentId });
        await db.query("UPDATE public.user_highlights SET note_body = 'Changed personal judgment' WHERE id = $1", [lateNoteId]);
        await expect(recheckPersonalEvidenceCandidates({ supabase: clientA, userId: accountA, scope: allScope, candidates: selected })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
        await db.query("UPDATE public.user_highlights SET note_body = 'My late personal needle interpretation' WHERE id = $1", [lateNoteId]);
        const beforeDeletion = await loadA({ version: 1, itemType: "reflection", contentItemId: withdrawnContentId });
        await db.query("DELETE FROM public.user_reflections WHERE id = $1", [withdrawnReflectionId]);
        try {
            await expect(recheckPersonalEvidenceCandidates({ supabase: clientA, userId: accountA, scope: allScope, candidates: beforeDeletion })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
            expect((await loadA()).some((candidate) => candidate.id === withdrawnReflectionId)).toBe(false);
        } finally {
            await db.query("INSERT INTO public.user_reflections (id, user_id, content_item_id, prompt, reflection_text) VALUES ($1, $2, $3, 'What will remain?', 'My retained withdrawn-source reflection')", [withdrawnReflectionId, accountA, withdrawnContentId]);
        }
    });

    it("retains personal captures across the real library reset operation", async () => {
        const before = await loadA();
        const reset = await resetLibraryForAccount(accountA);
        expect(reset.resetEpoch).toBeGreaterThan(0);
        const library = await clientA.from("user_library").select("content_id").eq("user_id", accountA);
        expect(library.error).toBeNull();
        expect(library.data).toEqual([]);
        expect((await loadA()).map((candidate) => candidate.evidenceId)).toEqual(before.map((candidate) => candidate.evidenceId));
    });

    it("never attaches a mismatched source segment or anchor", async () => {
        const rows = await loadA({ version: 1, itemType: "highlight", filterQuery: "Retained mismatched capture" });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: mismatchId, segmentId: otherSegmentId, highlightedText: "Retained mismatched capture", segment: null, readerAnchor: null });
    });

    it("hides current editorial context after withdrawal while retaining owned text", async () => {
        const retainedScope: PersonalEvidenceScope = { version: 1, itemType: "all", contentItemId: withdrawnContentId };
        const before = await loadA(retainedScope);
        expect(before).toHaveLength(2);
        await db.query("UPDATE public.content_item SET deleted_at = now() WHERE id = $1", [withdrawnContentId]);
        try {
            await expect(recheckPersonalEvidenceCandidates({ supabase: clientA, userId: accountA, scope: retainedScope, candidates: before })).rejects.toMatchObject({ code: "STALE_EVIDENCE" });
            const retained = await loadA(retainedScope);
            expect(retained).toHaveLength(2);
            expect(retained.every((candidate) => candidate.source === null && candidate.sourceStatus === "unavailable")).toBe(true);
            expect(retained.find((candidate) => candidate.type === "highlight")).toMatchObject({ highlightedText: "Retained withdrawn capture", noteBody: "Personal withdrawn-source opinion", readerAnchor: null });
            expect(retained.find((candidate) => candidate.type === "reflection")).toMatchObject({ reflectionText: "My retained withdrawn-source reflection" });
        } finally {
            await db.query("UPDATE public.content_item SET deleted_at = NULL WHERE id = $1", [withdrawnContentId]);
        }
    });

    it("withholds all matches until every live scope record is indexed, including an unseeded late capture", async () => {
        await db.query("DELETE FROM private.personal_evidence_index WHERE evidence_type = 'highlight' AND evidence_id = $1", [lateHighlightId]);
        const pending = await indexedSearch();
        expect(pending).toMatchObject({ status: "pending", total_records: noiseCount + 6, ready_records: 0, matches: [] });
        expect(pending.pending_records).toBe(noiseCount + 6);
        const seeded = await asService(async (client) => (await client.query("SELECT public.seed_personal_evidence_index(500) AS result")).rows[0].result);
        expect(seeded.seeded_records).toBeGreaterThanOrEqual(1);
        await drainIndex();
        const ready = await indexedSearch();
        expect(ready).toMatchObject({ status: "ready", total_records: noiseCount + 6, ready_records: noiseCount + 6, pending_records: 0 });
        expect(ready.matches.map((match) => match.evidence_id)).toEqual(expect.arrayContaining([lateNoteId, lateHighlightId, reflectionId]));
        expect(ready.matches.some((match) => [otherHighlightId, otherReflectionId].includes(match.evidence_id))).toBe(false);
        expect(ready.matches.find((match) => match.evidence_id === lateNoteId && match.field === "highlightedText")?.similarity).toBe(0);
        expect(ready.matches.find((match) => match.evidence_id === reflectionId && match.field === "prompt")?.similarity).toBe(0);
        expect(ready.matches.find((match) => match.evidence_id === lateHighlightId)).toMatchObject({ start_offset: 0, end_offset: fullQuote.length });
        const widened = await clientA.rpc("match_personal_evidence", {
            p_scope: allScope, p_query_embedding: JSON.stringify(queryVector), p_match_count: 9999, p_min_similarity: 0,
        });
        expect(widened.error).toBeNull();
        const widerMatches = (widened.data as unknown as IndexResult).matches;
        expect(new Set(widerMatches.map((match) => match.evidence_id)).size).toBeLessThanOrEqual(64);
        expect(new Set(widerMatches.filter((match) => match.evidence_type === "highlight").map((match) => match.evidence_id)).size).toBe(32);
        expect(new Set(widerMatches.filter((match) => match.evidence_type === "reflection").map((match) => match.evidence_id)).size).toBe(2);
        expect(widerMatches.map((match) => match.evidence_id)).toEqual(expect.arrayContaining([lateNoteId, lateHighlightId, reflectionId]));
    }, 60_000);

    it("uses real Auth ownership and literal/type/source/color filters before persistent vector ranking", async () => {
        const other = await indexedSearch(allScope, clientB);
        expect(other.total_records).toBe(2);
        expect(other.matches.map((match) => match.evidence_id)).toContain(otherHighlightId);
        expect(other.matches.every((match) => [otherHighlightId, otherReflectionId].includes(match.evidence_id))).toBe(true);
        expect((await indexedSearch({ version: 1, itemType: "note", contentItemId: contentId, color: "yellow" })).matches.every((match) => match.evidence_id === lateNoteId)).toBe(true);
        expect((await indexedSearch({ version: 1, itemType: "all", filterQuery: "100%_kept" })).matches.map((match) => match.evidence_id)).toEqual([lateHighlightId]);
        expect((await indexedSearch({ version: 1, itemType: "reflection" })).matches.every((match) => match.evidence_id === reflectionId)).toBe(true);
        expect((await indexedSearch({ version: 1, itemType: "reflection", color: "blue" })).total_records).toBe(0);
        expect((await indexedSearch({ version: 1, itemType: "all", filterQuery: "Wrong source context" })).total_records).toBe(0);
        for (const rpc of ["seed_personal_evidence_index", "acquire_personal_evidence_worker"] as const) {
            expect((await clientA.rpc(rpc, {})).error).not.toBeNull();
        }
        expect((await clientA.rpc("claim_personal_evidence_index", { p_worker_token: workerToken! })).error).not.toBeNull();
        expect((await clientA.rpc("release_personal_evidence_worker", { p_worker_token: workerToken! })).error).not.toBeNull();
        const foreignMutation = { p_evidence_type: "highlight", p_evidence_id: lateNoteId, p_revision: randomUUID(), p_lease_token: randomUUID() };
        expect((await clientA.rpc("complete_personal_evidence_index", { ...foreignMutation, p_chunks: [] })).error).not.toBeNull();
        expect((await clientA.rpc("fail_personal_evidence_index", foreignMutation)).error).not.toBeNull();
        expect((await authClient().rpc("match_personal_evidence", { p_scope: allScope, p_query_embedding: JSON.stringify(queryVector) })).error).not.toBeNull();
        const privileges = await db.query<{ allowed: boolean }>(
            "SELECT has_table_privilege(role_name, table_name, 'SELECT,INSERT,UPDATE,DELETE') AS allowed FROM unnest(ARRAY['anon','authenticated','service_role']) role_name CROSS JOIN unnest(ARRAY['private.personal_evidence_index','private.personal_evidence_chunk','private.personal_evidence_provider_state']) table_name",
        );
        expect(privileges.rows.every((row) => !row.allowed)).toBe(true);
    });

    it("invalidates edits transactionally and rejects old revisions, duplicate claims, expired leases and deleted captures", async () => {
        const id = await makePendingCapture("late personal needle before edit");
        const [original] = await claimIndex(1);
        expect(original.evidence_id).toBe(id);
        expect(await claimIndex(1)).toEqual([]);
        const edited = await clientA.from("user_highlights").update({ highlighted_text: "late personal needle after edit" }).eq("id", id);
        expect(edited.error).toBeNull();
        expect(await completeIndex(original)).toBe(false);
        const pending = await indexedSearch({ version: 1, itemType: "all", filterQuery: "after edit" });
        expect(pending).toMatchObject({ status: "pending", total_records: 1, matches: [] });
        const [current] = await claimIndex(1);
        expect(current.revision).not.toBe(original.revision);
        expect(await completeIndex(current)).toBe(true);
        const selected = await indexedSearch({ version: 1, itemType: "all", filterQuery: "after edit" });
        expect(selected.matches[0].revision).toBe(current.revision);
        await clientA.from("user_highlights").update({ note_body: "New personal interpretation" }).eq("id", id);
        expect((await indexedSearch({ version: 1, itemType: "all", filterQuery: "after edit" })).matches).toEqual([]);
        expect((await db.query("SELECT 1 FROM private.personal_evidence_chunk WHERE evidence_id = $1", [id])).rowCount).toBe(0);
        const [expired] = await claimIndex(1);
        await db.query("UPDATE private.personal_evidence_index SET lease_expires_at = now() - interval '1 second' WHERE evidence_id = $1", [id]);
        expect(await completeIndex(expired)).toBe(false);
        const [replacement] = await claimIndex(1);
        expect(replacement.lease_token).not.toBe(expired.lease_token);
        expect((await clientA.from("user_highlights").delete().eq("id", id)).error).toBeNull();
        expect(await completeIndex(replacement)).toBe(false);
        expect((await indexedSearch({ version: 1, itemType: "all", filterQuery: "after edit" })).total_records).toBe(0);
        expect((await db.query("SELECT 1 FROM private.personal_evidence_index WHERE evidence_id = $1", [id])).rowCount).toBe(0);
    });

    it("keeps global worker admission fenced across capture edits, deletes, stale releases and expired workers", async () => {
        const id = await makePendingCapture("late personal needle worker overlap");
        const [job] = await claimIndex(1);
        const originalToken = workerToken!;
        expect(job.evidence_id).toBe(id);
        expect(await acquireWorker()).toBeNull();
        expect((await clientA.from("user_highlights").update({ highlighted_text: "edited worker overlap" }).eq("id", id)).error).toBeNull();
        expect(await acquireWorker()).toBeNull();
        expect((await clientA.from("user_highlights").delete().eq("id", id)).error).toBeNull();
        expect(await acquireWorker()).toBeNull();
        expect(await completeIndex(job)).toBe(false);
        expect(await releaseWorker(originalToken)).toBe(true);
        const replacement = await acquireWorker();
        expect(replacement?.worker_token).not.toBe(originalToken);
        workerToken = replacement!.worker_token;
        expect(await releaseWorker(originalToken)).toBe(false);
        expect(await acquireWorker()).toBeNull();
        const expiredToken = workerToken;
        await db.query("UPDATE private.personal_evidence_provider_state SET worker_expires_at = now() - interval '1 second' WHERE worker_token = $1", [expiredToken]);
        workerToken = (await acquireWorker())!.worker_token;
        expect(workerToken).not.toBe(expiredToken);
        expect(await releaseWorker(expiredToken)).toBe(false);
        const refused = await asService(async (client) => (await client.query("SELECT public.claim_personal_evidence_index($1, 1, 90) AS result", [expiredToken])).rows[0].result);
        expect(refused).toEqual([]);
    });

    it("rejects truncated indexing payloads and preserves UTF-16 offsets for full stored fields", async () => {
        const id = await makePendingCapture(`late personal needle ${"🧠".repeat(300)}`);
        const [job] = await claimIndex(1);
        const chunks = await indexChunks(job);
        const incomplete = chunks.map((chunk) => ({ ...chunk, end_offset: chunk.end_offset - 1 }));
        await expect(completeIndex(job, incomplete)).rejects.toThrow("incomplete personal index field coverage");
        expect(await completeIndex(job, chunks)).toBe(true);
        const result = await indexedSearch({ version: 1, itemType: "all", filterQuery: "🧠" });
        expect(result.matches[0].end_offset).toBe(job.highlighted_text!.length);
        expect((await clientA.from("user_highlights").delete().eq("id", id)).error).toBeNull();
    });

    it("keeps provider cooldown independent of deletion and never exhausts record attempts from five rate limits", async () => {
        const id = await makePendingCapture("late personal needle provider retry");
        for (let attempt = 0; attempt < 5; attempt++) {
            const [job] = await claimIndex(1);
            expect(job.evidence_id).toBe(id);
            const failed = await asService(async (client) => (await client.query<{ result: boolean }>(
                "SELECT public.fail_personal_evidence_index($1,$2,$3,$4,3600,false,true) AS result",
                [job.evidence_type,job.evidence_id,job.revision,job.lease_token],
            )).rows[0].result);
            expect(failed).toBe(true);
            expect(await claimIndex(1)).toEqual([]);
            expect((await db.query("SELECT state,attempts FROM private.personal_evidence_index WHERE evidence_id = $1", [id])).rows[0]).toEqual({ state: "pending", attempts: 0 });
            await db.query("UPDATE private.personal_evidence_provider_state SET next_allowed_at = now() - interval '1 second'");
            await db.query("UPDATE private.personal_evidence_index SET next_attempt_at = now() - interval '1 second' WHERE evidence_id = $1", [id]);
        }
        const [job] = await claimIndex(1);
        expect(job.evidence_id).toBe(id);
        await asService((client) => client.query("SELECT public.fail_personal_evidence_index($1,$2,$3,$4,3600,false,true)", [job.evidence_type,job.evidence_id,job.revision,job.lease_token]));
        await clientA.from("user_highlights").delete().eq("id", id);
        const nextId = await makePendingCapture("late personal needle next capture");
        expect(await claimIndex(1)).toEqual([]);
        await db.query("UPDATE private.personal_evidence_provider_state SET next_allowed_at = now() - interval '1 second'");
        const [next] = await claimIndex(1);
        expect(next.evidence_id).toBe(nextId);
        expect(await completeIndex(next)).toBe(true);
        await clientA.from("user_highlights").delete().eq("id", nextId);
    });

    it("retains indexed captures through reset and source withdrawal without using hidden source metadata", async () => {
        const before = await indexedSearch();
        await resetLibraryForAccount(accountA);
        expect((await indexedSearch()).matches).toEqual(before.matches);
        await db.query("UPDATE public.content_item SET deleted_at = now() WHERE id = $1", [withdrawnContentId]);
        try {
            const retained = await indexedSearch({ version: 1, itemType: "all", contentItemId: withdrawnContentId });
            expect(retained).toMatchObject({ status: "ready", total_records: 2, ready_records: 2 });
            expect((await indexedSearch({ version: 1, itemType: "all", filterQuery: "Withdrawable runtime source" })).total_records).toBe(0);
        } finally { await db.query("UPDATE public.content_item SET deleted_at = NULL WHERE id = $1", [withdrawnContentId]); }
    });

    it("rejects a real session revoked during selection at both final retrieval boundaries", async () => {
        const stale = authClient();
        const revoker = authClient();
        for (const client of [stale, revoker]) {
            const result = await client.auth.setSession({ access_token: sessionB.access_token, refresh_token: sessionB.refresh_token });
            expect(result.error).toBeNull();
        }
        const supabase = stale as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>;
        let selectionCalled = false;
        await expect(retrievePersonalEvidence({
            supabase, userId: accountB, scope: allScope, question: "late personal needle", queryEmbedding: queryVector,
            signal: AbortSignal.timeout(10_000), selectionGenerator: async (request) => {
                selectionCalled = true;
                const payload = JSON.parse(request.prompt) as { candidates: { id: string }[] };
                expect(payload.candidates.length).toBeGreaterThan(0);
                expect((await revoker.auth.signOut({ scope: "global" })).error).toBeNull();
                await expect(assertActivePersonalRetrievalSession({ supabase, scope: allScope, signal: request.signal }))
                    .rejects.toThrow("RETRIEVAL_SESSION_OR_INDEX_CHANGED");
                return { output: structuralSelectionOutput([payload.candidates[0].id]) };
            },
        })).rejects.toThrow("Personal evidence search failed");
        expect(selectionCalled).toBe(true);
        const rejected = await stale.auth.getUser();
        expect(rejected.error).not.toBeNull();
        expect(rejected.data.user).toBeNull();
        // Exercise direct Data API access with the still-unexpired original JWT,
        // independently of the route's Auth check or the SDK's local signout.
        const direct = await fetch(`${apiUrl}/rest/v1/rpc/match_personal_evidence`, {
            method: "POST", headers: { apikey: anonKey!, Authorization: `Bearer ${sessionB.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ p_scope: allScope, p_query_embedding: JSON.stringify(queryVector) }),
        });
        expect(direct.ok).toBe(false);
        expect((await direct.json()).code).toBe("42501");
        // The installed SSR adapter and supabase-js expose different generic
        // signatures; this boundary injects only their identical Auth API.
        vi.mocked(createServerSupabaseClient).mockResolvedValue({ auth: stale.auth } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);
        await expect(getVerifiedAccountDataSession()).resolves.toBeNull();
    });
});
