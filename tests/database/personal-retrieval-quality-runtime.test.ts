import { renderEvidenceExtracts } from "@/lib/server/evidence-extract-response";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import type { PersonalEvidenceScope } from "@/lib/personal-evidence";
import type { createClient as createServerClient } from "@/lib/supabase/server";
import { ALL_PERSONAL_EVIDENCE, retrievePersonalEvidence, buildPersonalEvidencePrompt } from "@/lib/server/personal-retrieval";
import { loadLibrarySourceEvidence, selectLibraryEvidence, buildLibraryEvidencePrompt } from "@/lib/server/library-evidence";
import { buildLibraryMetadataContext, type LibraryItemRow } from "@/lib/server/library-snapshot";
import { MAX_LIBRARY_CONTEXT_CHARS, getOutputTokenCap, getAnthropicModelName, detectAskIntent, buildRetrievalFallbackText, getNotesOutputTokenCap, getNotesAnthropicModelName, NOTES_NO_EVIDENCE, LIBRARY_NO_EVIDENCE } from "@/lib/server/retrieval-generation";
import { chunkPersonalEvidenceText, rankSourceEvidenceSpans, PersonalEvidenceVectorCache } from "@/lib/server/personal-evidence-ranking";
import {
    PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG, canonicalPersonalEvidenceSelectionRequest, personalEvidenceSelectionRequestHash,
    type CanonicalPersonalEvidenceSelectionRequest,
    type PersonalEvidenceSelectionCandidate, type PersonalEvidenceSelectionGenerator,
} from "@/lib/server/personal-evidence-selector";
import {
    readFrozenCorpus, expandedEvidence, readDatabaseVectorFixture, corpusHash, productionRetrievalHashes, databaseGenerationInputHash, fixtureSupportOutcomes, validateRecordedProviderSelectionOutput, QUALITY_CONFIG,
    type FixtureCase, type FixtureEvidence, type VectorBank,
} from "../../scripts/evaluate-personal-retrieval";

const corpusVersion = process.env.PERSONAL_RETRIEVAL_CORPUS_VERSION ?? "v1";
const databaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
const apiUrl = process.env.DB107_SUPABASE_URL;
const anonKey = process.env.DB107_SUPABASE_ANON_KEY;
const vectorsPath = resolve(process.env.PERSONAL_RETRIEVAL_VECTOR_FIXTURE ?? `tests/fixtures/retrieval/provider-vectors-${corpusVersion}.json`);
const reportPath = resolve(process.env.PERSONAL_RETRIEVAL_QUALITY_REPORT ?? (corpusVersion === "v1" ? "artifacts/personal-retrieval-database-quality.json" : "artifacts/personal-retrieval-database-quality-v2-selector-v4.json"));
const captureSelectionInputs = process.env.CAPTURE_PERSONAL_SELECTION_INPUTS === "1";
const selectionInputsPath = resolve(process.env.PERSONAL_SELECTION_INPUTS_PATH ?? (corpusVersion === "v1" ? "artifacts/personal-selection-inputs.json" : "artifacts/personal-selection-inputs-v2-selector-v4.json"));
const selectionFixturePath = resolve(process.env.PERSONAL_SELECTION_FIXTURE ?? (corpusVersion === "v1" ? "tests/fixtures/retrieval/provider-selections-v1.json" : "tests/fixtures/retrieval/provider-selections-v2-selector-v4.json"));
const selectionModelConfig = PERSONAL_EVIDENCE_SELECTOR_BENCHMARK_MODEL_CONFIG;
const configured = Boolean(databaseUrl && apiUrl && anonKey && existsSync(vectorsPath));
if (process.env.PERSONAL_RETRIEVAL_QUALITY_RUNTIME_REQUIRED === "1" && !configured) {
    throw new Error("Personal retrieval quality requires the disposable DB107 database/API/anon key and recorded real-provider vector fixture.");
}
for (const value of [databaseUrl, apiUrl].filter((value): value is string => Boolean(value))) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) throw new Error("Quality fixtures require loopback-only disposable Supabase URLs.");
}
const corpus = readFrozenCorpus(corpusVersion);
const corpusSha256 = corpusHash(corpus);
const productionHashes = productionRetrievalHashes();
const rows = expandedEvidence(corpus);
const apiCap = Number(readFileSync(resolve("supabase/config.toml"), "utf8").match(/^max_rows\s*=\s*(\d+)/m)?.[1]);
if (!(corpus.corpusExpansion.noisePerPersonalClass > apiCap)) throw new Error("Frozen noise must exceed the configured Data API cap.");
const describeDatabase = configured ? describe : describe.skip;
type AccountClient = ReturnType<typeof makeClient>;
type Result = {
    caseId: string; run: number; outcome: "complete" | "error"; selectedIds: string[]; contextText: string;
    contextBytes: number; exactQuote: string | null; deniedRevokedSession: boolean;
    personalCandidateCount: number; sourceCandidateCount: number; error?: string;
    generationInput?: { system: string; model: string; maxOutputTokens: number; query: string;
        branch: "model" | "extracts" | "exact_quote" | "no_evidence" | "quote_too_large"; deterministicText: string | null };

};
type CapturedSelection = {
    caseId: string; inputSha256: string;
    request: CanonicalPersonalEvidenceSelectionRequest;
    candidateFixtureIds: Record<string, string>;
    diagnosticOnlyAllCandidateIds: string[];
};
type RecordedSelection = {
    caseId: string; run: number; inputSha256: string; output: { ids: string[] }; providerOutput: unknown; providerWireOutput?: unknown;
    usage: Awaited<ReturnType<PersonalEvidenceSelectionGenerator>>["usage"];
    model: string; provider: string;
};
type SelectionFixture = {
    version: "personal-retrieval-provider-selections-v2"; corpusSha256: string; vectorFixtureSha256: string;
    modelConfig: typeof selectionModelConfig; records: RecordedSelection[];
};
function makeClient() {
    return createSupabaseClient<Database>(apiUrl!, anonKey!, {
        auth: { storageKey: `personal-quality-${randomUUID()}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
}
function serverClient(client: AccountClient) { return client as unknown as Awaited<ReturnType<typeof createServerClient>>; }
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

describeDatabase("frozen personal retrieval corpus through real Auth and production database search", () => {
    const db = new Pool({ connectionString: databaseUrl, max: 2 });
    // Stable identities make exact selector payload replay possible, including
    // ties among identical noise vectors. A held lock excludes concurrent runs
    // using these fixture identities; Auth accounts and sessions remain real.
    const namespace = `personal-retrieval-database-quality-v1:${corpusSha256}`;
    let fixtureLock: PoolClient | undefined;
    const results = new Map<string, Result>();
    const capturedSelections = new Map<string, CapturedSelection>();
    let selectionFixture: SelectionFixture | undefined;
    const accounts = new Map<string, { id: string; client: AccountClient }>();
    const ids = new Map<string, string>();
    let bank: VectorBank;
    let vectorFixtureSha256: string;
    let revokedAccessToken: string;
    let contentIds: string[] = [];
    let metrics: unknown = null;
    function uuid(key: string) {
        let value = ids.get(key);
        if (!value) {
            const hex = createHash("sha256").update(`${namespace}:${key}`).digest("hex");
            value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
            ids.set(key, value);
        }
        return value;
    }
    const recordUuid = (row: FixtureEvidence) => uuid(`${row.type}:${row.type === "source_segment" ? row.segmentId ?? row.id : row.id}`);
    const contentUuid = (row: FixtureEvidence) => uuid(`content:${row.contentId}`);
    const segmentUuid = (id: string) => uuid(`source_segment:${id}`);
    const vector = (text: string) => {
        const value = bank.get(text);
        if (!value) throw new Error("Recorded provider vector missing for an actual stored field.");
        return value;
    };
    const embedRecorded = async (texts: string[]) => texts.map(vector);

    beforeAll(async () => {
        fixtureLock = await db.connect();
        const lock = await fixtureLock.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(91008, 2) AS acquired");
        if (!lock.rows[0]?.acquired) {
            fixtureLock.release(); fixtureLock = undefined;
            throw new Error("Another personal retrieval quality fixture run is active; refusing to share deterministic fixture IDs.");
        }
        ({ bank, sha256: vectorFixtureSha256 } = readDatabaseVectorFixture(corpus, vectorsPath));
        if (!captureSelectionInputs) {
            if (!existsSync(selectionFixturePath)) throw new Error("Actual provider selector decisions are required. Capture mode is diagnostic only and cannot pass the quality gate.");
            selectionFixture = JSON.parse(readFileSync(selectionFixturePath, "utf8")) as SelectionFixture;
            if (selectionFixture.version !== "personal-retrieval-provider-selections-v2"
                || selectionFixture.corpusSha256 !== corpusSha256 || selectionFixture.vectorFixtureSha256 !== vectorFixtureSha256
                || JSON.stringify(selectionFixture.modelConfig) !== JSON.stringify(selectionModelConfig)
                || !Array.isArray(selectionFixture.records)) throw new Error("Recorded selector fixture configuration does not match the frozen corpus, vectors, or model configuration.");
        }
        for (const account of ["account-a", "account-b"]) {
            const client = makeClient();
            const email = `personal-quality-${randomUUID()}@example.invalid`;
            const password = `fixture-${randomUUID()}-Aa1!`;
            const signup = await client.auth.signUp({ email, password });
            expect(signup.error).toBeNull();
            if (!signup.data.user || !signup.data.session) throw new Error("Ordinary quality fixture signup did not establish a session.");
            accounts.set(account, { id: signup.data.user.id, client });
            if (account === "account-a") {
                revokedAccessToken = signup.data.session.access_token;
                expect((await client.auth.signOut({ scope: "local" })).error).toBeNull();
                // A second valid session on the SAME account proves that session
                // revocation does not invent per-capture revocation semantics.
                const signin = await client.auth.signInWithPassword({ email, password });
                expect(signin.error).toBeNull();
                expect(signin.data.user?.id).toBe(signup.data.user.id);
            }
        }
        const roleRows = await db.query<{ role: string }>("SELECT role FROM public.profiles WHERE id = ANY($1::uuid[])", [[...accounts.values()].map((account) => account.id)]);
        expect(roleRows.rows).toHaveLength(2);
        expect(roleRows.rows.every((row) => row.role === "user")).toBe(true);
        const contents = [...new Map(rows.map((row) => [contentUuid(row), { id: contentUuid(row), title: row.title }])).values()];
        await db.query(`INSERT INTO public.content_item(id,type,title,status)
            SELECT id,'article',title,'verified' FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,title text)`, [JSON.stringify(contents)]);
        contentIds = contents.map((row) => row.id);
        // Editorial rows take precedence when a capture points at their segment.
        const segmentRows = new Map<string, { id: string; item_id: string; title: string; markdown_body: string }>();
        for (const row of [...rows.filter((row) => row.type === "source_segment"), ...rows.filter((row) => row.type !== "source_segment")]) {
            if (!row.segmentId) continue;
            const id = segmentUuid(row.segmentId);
            if (!segmentRows.has(id)) segmentRows.set(id, { id, item_id: contentUuid(row), title: row.title, markdown_body: row.text });
        }
        await db.query(`INSERT INTO public.segment(id,item_id,order_index,title,markdown_body)
            SELECT id,item_id,0,title,markdown_body FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,item_id uuid,title text,markdown_body text)`, [JSON.stringify([...segmentRows.values()])]);
        const highlights = rows.filter((row) => row.type === "highlight").map((row) => ({
            id: recordUuid(row), user_id: accounts.get(row.accountId)!.id, content_item_id: contentUuid(row),
            segment_id: row.segmentId ? segmentUuid(row.segmentId) : null, highlighted_text: row.text,
            note_body: row.note, color: "yellow", created_at: row.createdAt,
        }));
        const reflections = rows.filter((row) => row.type === "reflection").map((row) => ({
            id: recordUuid(row), user_id: accounts.get(row.accountId)!.id, content_item_id: contentUuid(row),
            // The database requires a nonempty prompt; whitespace adds no
            // semantic content and is deliberately not embedded or ranked.
            prompt: row.prompt ?? " ", reflection_text: row.text, created_at: row.createdAt,
        }));
        await db.query(`INSERT INTO public.user_highlights(id,user_id,content_item_id,segment_id,highlighted_text,note_body,color,created_at)
            SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,user_id uuid,content_item_id uuid,segment_id uuid,highlighted_text text,note_body text,color text,created_at timestamptz)`, [JSON.stringify(highlights)]);
        await db.query(`INSERT INTO public.user_reflections(id,user_id,content_item_id,prompt,reflection_text,created_at)
            SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,user_id uuid,content_item_id uuid,prompt text,reflection_text text,created_at timestamptz)`, [JSON.stringify(reflections)]);
        const sources = rows.filter((row) => row.type === "source_segment");
        await db.query(`INSERT INTO public.user_library(user_id,content_id,is_bookmarked)
            SELECT DISTINCT user_id,content_id,true FROM jsonb_to_recordset($1::jsonb) AS x(user_id uuid,content_id uuid)`,
        [JSON.stringify(sources.map((row) => ({ user_id: accounts.get(row.accountId)!.id, content_id: contentUuid(row) })))]);
        await db.query(`INSERT INTO public.segment_embedding_gemini(segment_id,content_item_id,embedding)
            SELECT segment_id,content_item_id,embedding::extensions.vector(768)
            FROM jsonb_to_recordset($1::jsonb) AS x(segment_id uuid,content_item_id uuid,embedding text)`,
        [JSON.stringify(sources.map((row) => ({ segment_id: recordUuid(row), content_item_id: contentUuid(row), embedding: JSON.stringify(vector(row.text)) })))]);
        // Bulk setup uses all real-provider vectors, including forbidden records.
        // The separate runtime suite tests service claim/commit fencing itself.
        const chunks = rows.filter((row) => row.type !== "source_segment").flatMap((row) => {
            const fields = row.type === "highlight" ? [["highlightedText", row.text], ["noteBody", row.note ?? ""]] as const
                : [["reflectionText", row.text], ["prompt", row.prompt ?? ""]] as const;
            return fields.flatMap(([field, text]) => !text.trim() ? [] : chunkPersonalEvidenceText(text).map((span, chunk_index) => ({
                evidence_type: row.type, evidence_id: recordUuid(row), field, chunk_index,
                start_offset: span.start, end_offset: span.end, embedding: JSON.stringify(vector(span.text)),
            })));
        });
        const inserted = await db.query(`INSERT INTO private.personal_evidence_chunk(evidence_type,evidence_id,revision,field,chunk_index,start_offset,end_offset,embedding)
            SELECT c.evidence_type,c.evidence_id,i.revision,c.field,c.chunk_index,c.start_offset,c.end_offset,c.embedding::extensions.vector(768)
            FROM jsonb_to_recordset($1::jsonb) AS c(evidence_type text,evidence_id uuid,field text,chunk_index integer,start_offset integer,end_offset integer,embedding text)
            JOIN private.personal_evidence_index i USING(evidence_type,evidence_id)`, [JSON.stringify(chunks)]);
        expect(inserted.rowCount).toBe(chunks.length);
        const personalIds = rows.filter((row) => row.type !== "source_segment").map(recordUuid);
        const ready = await db.query("UPDATE private.personal_evidence_index SET state = 'ready' WHERE evidence_id = ANY($1::uuid[])", [personalIds]);
        expect(ready.rowCount).toBe(personalIds.length);
        // Apply real lifecycle operations only AFTER every record was indexed.
        for (const row of rows.filter((item) => item.lifecycle ? item.lifecycle.record === "user_deleted" : item.state === "user_deleted")) {
            const client = accounts.get(row.accountId)!.client;
            const result = await client.from(row.type === "highlight" ? "user_highlights" : "user_reflections").delete().eq("id", recordUuid(row)).select("id");
            expect(result.error).toBeNull();
            expect(result.data).toHaveLength(1);
            expect((await db.query("SELECT 1 FROM private.personal_evidence_chunk WHERE evidence_id = $1", [recordUuid(row)])).rowCount).toBe(0);
        }
        await db.query("UPDATE public.content_item SET deleted_at = now() WHERE id = ANY($1::uuid[])", [rows.filter((row) => row.lifecycle ? row.lifecycle.source === "withdrawn" : row.state === "withdrawn").map(contentUuid)]);
        const { client, id: accountId } = accounts.get("account-a")!;
        for (const table of ["user_highlights", "user_reflections"] as const) {
            const page = await client.from(table).select("id").eq("user_id", accountId).order("created_at", { ascending: false });
            expect(page.error).toBeNull(); expect(page.data).toHaveLength(apiCap);
            const noisy = new Set(rows.filter((row) => row.id.startsWith("noise-")).map(recordUuid));
            expect(page.data!.every((row) => noisy.has(row.id))).toBe(true);
        }
    }, 60_000);

    afterAll(async () => {
        if (captureSelectionInputs) {
            mkdirSync(dirname(selectionInputsPath), { recursive: true });
            writeFileSync(selectionInputsPath, JSON.stringify({
                version: "personal-retrieval-selection-inputs-v1", mode: "diagnostic-only-not-a-quality-pass",
                corpusSha256: corpusSha256, vectorFixtureSha256, modelConfig: selectionModelConfig,
                inputHashFormat: "personalEvidenceSelectionRequestHash(request, modelConfig) from the production selector module",
                records: [...capturedSelections.values()],
                revokedCaseIds: [...new Set([...results.values()].filter((result) => result.deniedRevokedSession).map((result) => result.caseId))],
                deterministicEmptyCaseIds: [...new Set([...results.values()].filter((result) => result.outcome === "complete"
                    && !result.deniedRevokedSession && !capturedSelections.has(result.caseId)).map((result) => result.caseId))],
                boundaries: ["Candidates came from live authorized production retrieval before model selection.",
                    "diagnosticOnlyAllCandidateIds is the entire candidate pool, not a selection or a quality pass.",
                    "Frozen expected labels are not included and were never used to form or select candidates."],
            }, null, 2) + "\n");
        }
        mkdirSync(dirname(reportPath), { recursive: true });
        writeFileSync(reportPath, JSON.stringify({
            version: "personal-retrieval-database-quality-v1", corpusSha256: corpusSha256,
            mode: captureSelectionInputs ? "diagnostic-candidate-capture-not-a-quality-pass" : "recorded-provider-selection-replay",
            vectorFixtureSha256, provider: { model: QUALITY_CONFIG.embeddingModel, dimensions: QUALITY_CONFIG.dimensions, taskType: QUALITY_CONFIG.embeddingTaskType },
            executedCases: results.size, expectedCases: corpus.cases.length * (captureSelectionInputs ? 1 : QUALITY_CONFIG.runs), materializedRecordsBeforeLifecycle: rows.length,
            metrics, productionHashes, selectionFixtureSha256: !captureSelectionInputs && existsSync(selectionFixturePath)
                ? createHash("sha256").update(readFileSync(selectionFixturePath)).digest("hex") : null,
            records: [...results.values()].map((record) => ({ ...record, generationInputSha256: databaseGenerationInputHash(record) })),
            boundaries: [
                "Actual recorded Google vectors replayed through disposable Postgres and ordinary authenticated production RPCs; no paid calls in this test.",
                "Labels are assertions only; every expanded record was seeded before live deletion/withdrawal and ownership enforcement.",
                "Revoked tags choose an actually revoked account-A request session for those cases. They do not hide captures from another valid session on the same account.",
                "Null reflection prompts are stored as whitespace to meet the existing database constraint; they add no semantic embedding text.",
                "The production conservative 4000-byte context ceiling is checked. Actual generation-token counts, three model runs, and answer adjudication remain a separate gate.",
                "The frozen forbiddenEvidenceExclusion metric requires empty output on exclusion questions and therefore also measures semantic abstention; forbiddenTargetIdsExcluded and revokedRequestsRejected separately report actual forbidden-ID/session rejection.",
            ],
        }, null, 2) + "\n");
        try {
            if (contentIds.length) await db.query("DELETE FROM public.content_item WHERE id = ANY($1::uuid[])", [contentIds]);
            if (accounts.size) await db.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[...accounts.values()].map((account) => account.id)]);
        } finally {
            if (fixtureLock) {
                await fixtureLock.query("SELECT pg_advisory_unlock(91008, 2)");
                fixtureLock.release();
            }
            await db.end();
        }
    }, 30_000);

    function scopeFor(testCase: FixtureCase): PersonalEvidenceScope {
        if (testCase.request) {
            if (testCase.request.surface !== "notes" || !testCase.request.notesScope) throw new Error("Explicit Notes request scope missing");
            return { ...testCase.request.notesScope, ...(testCase.request.notesScope.contentItemId
                ? { contentItemId: uuid(`content:${testCase.request.notesScope.contentItemId}`) } : {}) };
        }
        if (!testCase.scope.includes("highlight")) return { version: 1, itemType: "reflection" };
        // Highlights as an evidence class include note-bearing selections. All
        // fixture highlights are yellow; this real color filter excludes reflections.
        return { version: 1, itemType: "all", ...(!testCase.scope.includes("reflection") ? { color: "yellow" as const } : {}) };
    }
    function originalId(canonical: string) {
        const [type, id] = canonical.split(":");
        const row = rows.find((item) => item.type === type && recordUuid(item) === id);
        if (!row) throw new Error("Production retrieval returned an unknown fixture record.");
        return row.id;
    }
    function selectionGenerator(testCase: FixtureCase, run: number): PersonalEvidenceSelectionGenerator {
        return async (actualRequest) => {
            const request = canonicalPersonalEvidenceSelectionRequest(actualRequest);
            const parsed = JSON.parse(request.prompt) as { candidates: PersonalEvidenceSelectionCandidate[] };
            const candidateIds = parsed.candidates.map((candidate) => candidate.id);
            const inputSha256 = personalEvidenceSelectionRequestHash(request, selectionModelConfig);
            const previous = capturedSelections.get(testCase.id);
            if (previous && previous.inputSha256 !== inputSha256) throw new Error("Production selector input changed across deterministic fixture runs.");
            capturedSelections.set(testCase.id, { caseId: testCase.id, inputSha256, request,
                candidateFixtureIds: Object.fromEntries(candidateIds.map((id) => [id, originalId(id)])),
                diagnosticOnlyAllCandidateIds: candidateIds });
            if (captureSelectionInputs) return { output: { requestedFacets: [testCase.query], assessments: [] } };
            const records = selectionFixture!.records.filter((record) => record.caseId === testCase.id && record.run === run);
            if (records.length !== 1 || records[0].inputSha256 !== inputSha256
                || records[0].model !== selectionModelConfig.model || records[0].provider !== selectionModelConfig.provider) {
                throw new Error(`Actual selector decision missing or mismatched for ${testCase.id} run ${run}.`);
            }
            const record = records[0];
            if (!record.providerWireOutput) throw new Error("Compact selector replay requires original provider wire output.");
            return { output: validateRecordedProviderSelectionOutput(record, actualRequest), usage: record.usage, model: record.model, provider: record.provider };
        };
    }
    async function evaluate(testCase: FixtureCase, run: number): Promise<Result> {
        const { client, id: userId } = accounts.get("account-a")!;
        const queryEmbedding = vector(testCase.query);
        const signal = AbortSignal.timeout(30_000);
        if (testCase.request ? testCase.request.sessionState === "revoked" : testCase.kind === "revoked") {
            const response = await fetch(`${apiUrl}/rest/v1/rpc/match_personal_evidence`, {
                method: "POST", headers: { apikey: anonKey!, Authorization: `Bearer ${revokedAccessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ p_scope: scopeFor(testCase), p_query_embedding: JSON.stringify(queryEmbedding) }), signal,
            });
            const payload = await response.json();
            expect(response.ok).toBe(false); expect(payload.code).toBe("42501");
            return { caseId: testCase.id, run, outcome: "complete", selectedIds: [], contextText: "", contextBytes: 0, exactQuote: null,
                deniedRevokedSession: true, personalCandidateCount: 0, sourceCandidateCount: 0 };
        }
        const isLibrary = testCase.request ? testCase.request.surface === "library" : testCase.scope.includes("source_segment");
        const generateSelection = selectionGenerator(testCase, run);
        // Library has no source-only filter: source questions must reject
        // unrelated personal evidence semantically, just as the live route does.
        const personal = await retrievePersonalEvidence({
            supabase: serverClient(client), userId, question: testCase.query, queryEmbedding,
            scope: isLibrary ? ALL_PERSONAL_EVIDENCE : scopeFor(testCase), implicitHighlightQuote: !isLibrary, signal,
            deferSelection: isLibrary, selectionGenerator: generateSelection,
        });
        const sources = isLibrary ? await loadLibrarySourceEvidence({ supabase: serverClient(client), userId, queryEmbedding, signal }) : [];
        const spans = await rankSourceEvidenceSpans({ sources, ownerId: userId, queryEmbedding, embedBatch: embedRecorded, cache: new PersonalEvidenceVectorCache(), signal });
        const rankedSources = sources.map((source) => ({ ...source, span: spans.spans.find((span) => span.id === source.id) }));
        const combined = isLibrary ? await selectLibraryEvidence({ personal, sources: rankedSources, question: testCase.query, signal, selectionGenerator: generateSelection })
            : { contextText: personal.contextText, evidenceIds: personal.items.map((item) => item.evidence.evidenceId),
                exactQuote: personal.items.find((item) => item.exactQuote !== null)?.exactQuote ?? null };
        const selectedIds = combined.evidenceIds.map(originalId);
        const intent = detectAskIntent(testCase.query);
        let metadata = "";
        if (isLibrary) {
            const { data, error } = await client.from("user_library")
                .select("content_id,is_bookmarked,progress,last_interacted_at,content_item(title,author,category)")
                .eq("user_id", userId).order("last_interacted_at", { ascending: false });
            if (error) throw new Error("Benchmark library metadata query failed");
            metadata = buildLibraryMetadataContext((data ?? []) as LibraryItemRow[], MAX_LIBRARY_CONTEXT_CHARS);
        }
        const exact = combined.exactQuote;
        const tooLarge = "quoteTooLarge" in combined && combined.quoteTooLarge;
        const empty = combined.evidenceIds.length === 0;
        const generationInput: NonNullable<Result["generationInput"]> = {
            query: testCase.query,
            branch: tooLarge ? "quote_too_large" : exact !== null ? "exact_quote" : empty ? "no_evidence" : "extracts",
            deterministicText: tooLarge ? "The matching stored passage is too long to quote completely here. Open the source to read its full text."
                : exact !== null ? exact : empty ? isLibrary ? LIBRARY_NO_EVIDENCE : NOTES_NO_EVIDENCE
                    : renderEvidenceExtracts({ personal: "personal" in combined ? combined.personal.items : personal.items,
                        sources: "sources" in combined ? combined.sources : [], evidenceIds: combined.evidenceIds }),
            system: isLibrary ? buildLibraryEvidencePrompt(metadata, combined.contextText || buildRetrievalFallbackText("no_match", intent), intent)
                : buildPersonalEvidencePrompt(personal),
            model: isLibrary ? getAnthropicModelName(intent) : getNotesAnthropicModelName(testCase.query),
            maxOutputTokens: isLibrary ? getOutputTokenCap(intent) : getNotesOutputTokenCap(testCase.query),
        };

        return { caseId: testCase.id, run, outcome: "complete", selectedIds, contextText: combined.contextText,
            contextBytes: Buffer.byteLength(combined.contextText, "utf8"), exactQuote: combined.exactQuote, deniedRevokedSession: false,
            personalCandidateCount: personal.candidateCount, sourceCandidateCount: sources.length, generationInput };
    }

    for (let run = 1; run <= (captureSelectionInputs ? 1 : QUALITY_CONFIG.runs); run++) for (const testCase of corpus.cases) {
        it(`executes frozen case ${testCase.id} run ${run} without label-based candidate filtering`, async () => {
            let record: Result;
            try { record = await evaluate(testCase, run); }
            catch (error) {
                results.set(`${testCase.id}:${run}`, { caseId: testCase.id, run, outcome: "error", selectedIds: [], contextText: "", contextBytes: 0, exactQuote: null,
                    deniedRevokedSession: false, personalCandidateCount: 0, sourceCandidateCount: 0, error: error instanceof Error ? error.message : "Database retrieval failed" });
                throw error;
            }
            results.set(`${testCase.id}:${run}`, record);
            expect(record.selectedIds.length).toBeLessThanOrEqual(QUALITY_CONFIG.evidenceItems);
            expect(record.contextBytes).toBeLessThanOrEqual(4_000);
            if (!captureSelectionInputs && testCase.exactQuote !== null) expect(record.exactQuote).toBe(testCase.exactQuote);
            if (testCase.class === "exclusion") expect(record.selectedIds.some((id) => testCase.distractorIds.includes(id))).toBe(false);
        }, 35_000);
    }

    it("enforces frozen quality thresholds for every recorded provider run", () => {
        const complete = [...results.values()].filter((record) => record.outcome === "complete");
        if (captureSelectionInputs) {
            metrics = { status: "not-evaluated", reason: "Diagnostic candidate capture makes no semantic quality claim.",
                completedCases: complete.length, capturedRequests: capturedSelections.size };
            expect(complete).toHaveLength(corpus.cases.length);
            return;
        }
        const classes = ["source_segment", "highlight", "reflection"] as const;
        const perRun = Array.from({ length: QUALITY_CONFIG.runs }, (_, index) => {
            const run = index + 1;
            const resultFor = (item: FixtureCase) => results.get(`${item.id}:${run}`);
            const recallByClass = Object.fromEntries(classes.map((type) => {
                const cases = corpus.cases.filter((item) => item.requiredIds.some((id) => corpus.evidence.find((row) => row.id === id)?.type === type));
                return [type, mean(cases.map((item) => {
                    const required = item.requiredIds.filter((id) => corpus.evidence.find((row) => row.id === id)?.type === type);
                    return required.filter((id) => resultFor(item)?.selectedIds.includes(id)).length / required.length;
                }))];
            }));
            const irrelevantRejection = mean(corpus.cases.map((item) => {
                const result = resultFor(item);
                return result?.outcome === "complete" && result.selectedIds.every((id) => item.eligibleIds.includes(id)) ? 1 : 0;
            }));
            const exclusions = corpus.cases.filter((item) => item.class === "exclusion");
            const forbiddenEvidenceExclusion = mean(exclusions.map((item) => {
                const result = resultFor(item);
                return result?.outcome === "complete" && result.selectedIds.length === 0 ? 1 : 0;
            }));
            const forbiddenTargetIdsExcluded = mean(exclusions.map((item) => {
                const result = resultFor(item);
                return result?.outcome === "complete" && !result.selectedIds.some((id) => item.distractorIds.includes(id)) ? 1 : 0;
            }));
            const revokedRequestsRejected = mean(corpus.cases.filter((item) => item.request ? item.request.sessionState === "revoked" : item.kind === "revoked")
                .map((item) => resultFor(item)?.deniedRevokedSession ? 1 : 0));
            const exactCases = corpus.cases.filter((item) => item.exactQuote !== null);
            const exactQuoteFidelity = mean(exactCases.map((item) => resultFor(item)?.exactQuote === item.exactQuote ? 1 : 0));
            return { run, recallByClass, recallMacro: mean(Object.values(recallByClass)), irrelevantRejection,
                forbiddenEvidenceExclusion, forbiddenTargetIdsExcluded, revokedRequestsRejected, exactQuoteFidelity };
        });
        const recallByClass = Object.fromEntries(classes.map((type) => [type, mean(perRun.map((run) => run.recallByClass[type]))]));
        const recallMacro = mean(Object.values(recallByClass));
        const irrelevantRejection = mean(perRun.map((run) => run.irrelevantRejection));
        const forbiddenEvidenceExclusion = mean(perRun.map((run) => run.forbiddenEvidenceExclusion));
        const exactQuoteFidelity = mean(perRun.map((run) => run.exactQuoteFidelity));
        metrics = { executedCases: results.size, completeCases: complete.length, recallByClass, recallMacro,
            irrelevantRejection, forbiddenEvidenceExclusion, exactQuoteFidelity, perRun,
            forbiddenTargetIdsExcluded: mean(perRun.map((run) => run.forbiddenTargetIdsExcluded)),
            revokedRequestsRejected: mean(perRun.map((run) => run.revokedRequestsRejected)),
            supportOutcomes: complete.map((record) => ({ run: record.run, ...fixtureSupportOutcomes(corpus.cases.find((item) => item.id === record.caseId)!, record.selectedIds, record.contextText) })),
            modelAbstention: "Answer generation is a separate gate; selector abstention is reflected in retrieved IDs." };
        expect(complete).toHaveLength(corpus.cases.length * QUALITY_CONFIG.runs);
        expect(selectionFixture!.records).toHaveLength(capturedSelections.size * QUALITY_CONFIG.runs);
        expect(recallMacro).toBeGreaterThanOrEqual(corpus.thresholds.recallMacro);
        for (const recall of Object.values(recallByClass)) expect(recall).toBeGreaterThanOrEqual(corpus.thresholds.recallPerClass);
        for (const run of perRun) {
            expect(run.recallMacro).toBeGreaterThanOrEqual(corpus.thresholds.recallPerRunMacro);
            for (const recall of Object.values(run.recallByClass)) expect(recall).toBeGreaterThanOrEqual(corpus.thresholds.recallPerRunClass);
            expect(run.irrelevantRejection).toBeGreaterThanOrEqual(corpus.thresholds.rejectionAndAbstentionPerRun);
        }
        expect(irrelevantRejection).toBeGreaterThanOrEqual(corpus.thresholds.irrelevantRejection);
        expect(forbiddenEvidenceExclusion).toBe(corpus.thresholds.forbiddenEvidenceExclusion);
        expect(exactQuoteFidelity).toBe(corpus.thresholds.exactQuoteFidelity);
    });
});
