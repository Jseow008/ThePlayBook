import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const adminDatabaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
const describeDatabase = adminDatabaseUrl ? describe : describe.skip;

type CatalogRow = { content_id: string; title: string; snippet_headline: string; result_rank?: number; cursor_rank?: string };
type HighlightRow = { id: string; user_id: string; highlighted_text: string; note_body: string | null; cursor_created_at?: string };
type ExplainRow = { "QUERY PLAN": unknown };

function percentile(samples: number[], percentileValue: number) {
    const sorted = [...samples].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0;
}

function planUsesSearchIndex(plan: unknown) {
    return JSON.stringify(plan).includes("catalog_search_document_vector_idx");
}

describeDatabase("catalog and notes search on a disposable Supabase database", () => {
    const db = new Pool({ connectionString: adminDatabaseUrl, max: 2 });
    const accountA = randomUUID();
    const accountB = randomUUID();
    const contentExact = randomUUID();
    const contentSegment = randomUUID();
    const contentWithdrawn = randomUUID();
    const segment = randomUUID();

    beforeAll(async () => {
        await db.query(
            `INSERT INTO auth.users
                (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             VALUES
                ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $3, 'authenticated', 'authenticated', $4, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
            [accountA, `catalog-a-${accountA}@example.invalid`, accountB, `catalog-b-${accountB}@example.invalid`],
        );
        await db.query(
            `INSERT INTO public.content_item (id, type, title, author, category, status, quick_mode_json)
             VALUES
                ($1, 'article', 'Exact Catalog Signal', 'Ada Searcher', 'Technology', 'verified', '{"hook":"An exact catalog fixture","big_idea":"A durable catalog finding","key_takeaways":["catalog search"]}'::jsonb),
                ($2, 'book', 'Segment Fixture', 'Bea Searcher', 'Technology', 'verified', '{}'::jsonb),
                ($3, 'article', 'Withdrawn Catalog Signal', 'Cora Searcher', 'Technology', 'verified', '{}'::jsonb)`,
            [contentExact, contentSegment, contentWithdrawn],
        );
        await db.query(
            `INSERT INTO public.segment (id, item_id, order_index, title, markdown_body)
             VALUES ($1, $2, 0, 'Signal section', 'The segment-only retrieval phrase is a zebra compass.')`,
            [segment, contentSegment],
        );
        await db.query(
            `INSERT INTO public.user_highlights (user_id, content_item_id, segment_id, highlighted_text, note_body, color)
             VALUES
                ($1, $2, $3, 'Zebra compass highlight', 'Keep this source note', 'yellow'),
                ($4, $2, $3, 'Other account zebra compass highlight', 'Private note', 'blue')`,
            [accountA, contentSegment, segment, accountB],
        );
    });

    afterAll(async () => {
        await db.query("DELETE FROM public.content_item WHERE title LIKE 'Pagination catalog fixture %'").catch(() => undefined);
        await db.query("DELETE FROM public.content_item WHERE id = ANY($1::uuid[])", [[contentExact, contentSegment, contentWithdrawn]]).catch(() => undefined);
        await db.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[accountA, accountB]]).catch(() => undefined);
        await db.end();
    });

    it("returns only the fixed public projection and refreshes eligibility after withdrawal", async () => {
        const client = await db.connect();
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL ROLE anon");
            await expect(client.query("SELECT * FROM public.catalog_search_document")).rejects.toMatchObject({ code: "42501" });
            await client.query("ROLLBACK");

            await client.query("BEGIN");
            await client.query("SET LOCAL ROLE anon");
            const result = await client.query<CatalogRow>(
                `SELECT content_id, title, snippet_headline
                 FROM public.search_catalog($1, ARRAY['Technology']::text[], NULL::public.content_type, NULL, NULL, NULL, NULL, 21)`,
                ["\"Exact Catalog Signal\""],
            );
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toMatchObject({ content_id: contentExact, title: "Exact Catalog Signal" });
            expect(result.rows[0].snippet_headline).toContain("<<NF_HL>>");
        } finally {
            await client.query("ROLLBACK").catch(() => undefined);
            client.release();
        }

        await db.query("UPDATE public.content_item SET status = 'draft' WHERE id = $1", [contentWithdrawn]);
        const withdrawn = await db.query<CatalogRow>(
            `SELECT content_id, title, snippet_headline
             FROM public.search_catalog($1, ARRAY[]::text[], NULL::public.content_type, NULL, NULL, NULL, NULL, 21)`,
            ["Withdrawn Catalog Signal"],
        );
        expect(withdrawn.rows).toEqual([]);
    });

    it("searches highlights before paging and never crosses account boundaries", async () => {
        const client = await db.connect();
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL ROLE authenticated");
            await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [accountA]);
            await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)");
            const result = await client.query<HighlightRow>(
                `SELECT id, user_id, highlighted_text, note_body
                 FROM public.search_user_highlights($1, $2, 'note', 'yellow', 'newest', NULL, NULL, 31)`,
                ["zebra compass", contentSegment],
            );
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toMatchObject({ user_id: accountA, highlighted_text: "Zebra compass highlight" });
            expect(result.rows[0].note_body).toBe("Keep this source note");
        } finally {
            await client.query("ROLLBACK");
            client.release();
        }
    });

    it("refreshes edited and republished catalog evidence and traverses stable relevance ties", async () => {
        const paginationContentIds = Array.from({ length: 25 }, () => randomUUID());
        const paginationSegmentIds = Array.from({ length: 25 }, () => randomUUID());
        await db.query(
            `INSERT INTO public.content_item (id, type, title, author, category, status)
             SELECT value::uuid, 'article', 'Pagination catalog fixture ' || ordinality, 'Fixture author', 'Science', 'verified'
             FROM unnest($1::text[]) WITH ORDINALITY AS generated(value, ordinality)`,
            [paginationContentIds],
        );
        await db.query(
            `INSERT INTO public.segment (id, item_id, order_index, title, markdown_body)
             SELECT segment_id::uuid, content_id::uuid, 0, 'Tie section', 'stable catalog pagination phrase'
             FROM unnest($1::text[], $2::text[]) AS generated(segment_id, content_id)`,
            [paginationSegmentIds, paginationContentIds],
        );

        const first = await db.query<CatalogRow & { result_rank: number }>(
            `SELECT content_id, title, snippet_headline, result_rank, cursor_rank
             FROM public.search_catalog($1, ARRAY['Science']::text[], 'article'::public.content_type, NULL, NULL, NULL, NULL, 21)`,
            ["stable catalog pagination phrase"],
        );
        expect(first.rows).toHaveLength(21);
        const boundary = first.rows[19];
        const second = await db.query<CatalogRow>(
            `SELECT content_id, title, snippet_headline
             FROM public.search_catalog($1, ARRAY['Science']::text[], 'article'::public.content_type, $2, $3, NULL, NULL, 21)`,
            ["stable catalog pagination phrase", boundary.cursor_rank, boundary.content_id],
        );
        const allIds = [...first.rows.slice(0, 20), ...second.rows].map((row) => row.content_id);
        expect(allIds).toHaveLength(25);
        expect(new Set(allIds)).toHaveLength(25);

        await db.query("UPDATE public.segment SET markdown_body = 'fresh catalog evidence phrase' WHERE id = $1", [segment]);
        await expect(db.query<CatalogRow>(
            `SELECT content_id, title, snippet_headline FROM public.search_catalog($1, ARRAY[]::text[], NULL::public.content_type, NULL, NULL, NULL, NULL, 21)`,
            ["segment-only retrieval phrase"],
        )).resolves.toMatchObject({ rows: [] });
        await expect(db.query<CatalogRow>(
            `SELECT content_id, title, snippet_headline FROM public.search_catalog($1, ARRAY[]::text[], NULL::public.content_type, NULL, NULL, NULL, NULL, 21)`,
            ["fresh catalog evidence phrase"],
        )).resolves.toMatchObject({ rows: [expect.objectContaining({ content_id: contentSegment })] });

        await db.query("UPDATE public.content_item SET status = 'draft' WHERE id = $1", [contentSegment]);
        await expect(db.query<CatalogRow>(
            `SELECT content_id, title, snippet_headline FROM public.search_catalog($1, ARRAY[]::text[], NULL::public.content_type, NULL, NULL, NULL, NULL, 21)`,
            ["fresh catalog evidence phrase"],
        )).resolves.toMatchObject({ rows: [] });
        await db.query("UPDATE public.content_item SET status = 'verified' WHERE id = $1", [contentSegment]);
        await db.query("UPDATE public.segment SET deleted_at = now() WHERE id = $1", [segment]);
        await expect(db.query<CatalogRow>(
            `SELECT content_id, title, snippet_headline FROM public.search_catalog($1, ARRAY[]::text[], NULL::public.content_type, NULL, NULL, NULL, NULL, 21)`,
            ["fresh catalog evidence phrase"],
        )).resolves.toMatchObject({ rows: [] });
    });

    it("finds an old saved idea on the first filtered page and traverses timestamp ties without duplicates", async () => {
        const matchingHighlight = randomUUID();
        const tiedHighlightIds = Array.from({ length: 35 }, () => randomUUID());
        // This is deliberately larger than the configured 1,000-record Data
        // API cap. The only matching note lives after that old client-side
        // boundary and must still be found by the server-side query.
        const noiseRows = Array.from({ length: 1_001 }, () => randomUUID());
        const readerHighlightIds = Array.from({ length: 51 }, () => randomUUID());
        await db.query(
            `INSERT INTO public.user_highlights (id, user_id, content_item_id, highlighted_text, note_body, color, created_at)
             SELECT value::uuid, $1, $2, 'unrelated saved passage ' || ordinality, NULL, 'blue', now() - interval '1 day'
             FROM unnest($3::text[]) WITH ORDINALITY AS generated(value, ordinality)`,
            [accountA, contentSegment, noiseRows],
        );
        await db.query(
            `INSERT INTO public.user_highlights (id, user_id, content_item_id, highlighted_text, note_body, color, created_at)
             VALUES ($1, $2, $3, 'A durable old idea', 'The only beyond-cap searchable note', 'green', now() - interval '2 days')`,
            [matchingHighlight, accountA, contentSegment],
        );
        await db.query(
            `INSERT INTO public.user_highlights (id, user_id, content_item_id, highlighted_text, color, created_at)
             SELECT value::uuid, $1, $2, 'identical timestamp search fixture', 'yellow', '2026-09-01T00:00:00.123456Z'::timestamptz
             FROM unnest($3::text[]) AS generated(value)`,
            [accountA, contentSegment, tiedHighlightIds],
        );
        await db.query(
            `INSERT INTO public.user_highlights (id, user_id, content_item_id, highlighted_text, color, created_at)
             SELECT value::uuid, $1, $2, 'reader page highlight ' || ordinality, 'pink', now() - interval '3 days'
             FROM unnest($3::text[]) WITH ORDINALITY AS generated(value, ordinality)`,
            [accountA, contentSegment, readerHighlightIds],
        );

        const client = await db.connect();
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL ROLE authenticated");
            await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [accountA]);
            await client.query("SELECT set_config('request.jwt.claim.role', 'authenticated', true)");

            const beyondCap = await client.query<HighlightRow>(
                `SELECT id, user_id, highlighted_text, note_body
                 FROM public.search_user_highlights($1, $2, 'note', 'green', 'oldest', NULL, NULL, 31)`,
                ["beyond-cap searchable", contentSegment],
            );
            expect(beyondCap.rows).toEqual([expect.objectContaining({ id: matchingHighlight })]);

            const first = await client.query<HighlightRow & { created_at: string }>(
                `SELECT id, user_id, highlighted_text, note_body, created_at, cursor_created_at
                 FROM public.search_user_highlights($1, $2, 'highlight', 'yellow', 'newest', NULL, NULL, 31)`,
                ["identical timestamp", contentSegment],
            );
            expect(first.rows).toHaveLength(31);
            const boundary = first.rows[29];
            const second = await client.query<HighlightRow>(
                `SELECT id, user_id, highlighted_text, note_body
                 FROM public.search_user_highlights($1, $2, 'highlight', 'yellow', 'newest', $3, $4, 31)`,
                ["identical timestamp", contentSegment, boundary.cursor_created_at, boundary.id],
            );
            const pagedIds = [...first.rows.slice(0, 30), ...second.rows].map((row) => row.id);
            expect(pagedIds).toHaveLength(35);
            expect(new Set(pagedIds)).toHaveLength(35);

            const readerPage = await client.query<HighlightRow>(
                `SELECT id, user_id, highlighted_text, note_body
                 FROM public.search_user_highlights(NULL, $1, 'highlight', 'pink', 'newest', NULL, NULL, 51)`,
                [contentSegment],
            );
            expect(readerPage.rows).toHaveLength(51);
            expect(new Set(readerPage.rows.map((row) => row.id))).toEqual(new Set(readerHighlightIds));
        } finally {
            await client.query("ROLLBACK");
            client.release();
        }
    });

    it("measures the reviewed catalog corpus with the deployed search SQL and route", async () => {
        const fixturePrefix = `Search performance fixture ${randomUUID()}`;
        const titleExact = `${fixturePrefix} title exact lighthouse`;
        const authorExact = `${fixturePrefix} author fixture`;
        const quotedBody = "quoted body juniper evidence";
        const unquotedBody = "unquoted body cedar evidence";
        const broadBody = "broad constellation evidence";
        const filteredBody = "filtered archive evidence";
        const querySet = [
            { id: "title-exact", query: "title exact lighthouse", expectedTitle: titleExact, maxRank: 1 },
            { id: "author-exact", query: "author fixture", expectedAuthor: authorExact, maxRank: 3 },
            { id: "quoted-body-concept", query: `"${quotedBody}"`, expectedBody: quotedBody, maxRank: 3 },
            { id: "unquoted-body-concept", query: unquotedBody, expectedBody: unquotedBody, maxRank: 3 },
            { id: "broad-concept", query: broadBody, maxRank: null },
            { id: "filtered", query: filteredBody, expectedBody: filteredBody, maxRank: 3, category: "SearchPerformanceFiltered" },
            { id: "empty-result", query: "absent tungsten search token", maxRank: null },
        ];
        const client = await db.connect();
        let committed = false;

        try {
            // The fixture is inserted into the disposable database only. It
            // deliberately bypasses maintenance triggers during bulk setup,
            // then writes the same server-owned projection those triggers
            // produce. Querying still goes through public.search_catalog.
            await client.query("BEGIN");
            await client.query("SET LOCAL session_replication_role = 'replica'");
            // Rebuilding the two reviewed indexes once mirrors a bulk index
            // build and keeps the disposable 110,000-document fixture within
            // CI resource bounds. The query plans below run after both exact
            // production indexes have been restored.
            await client.query("DROP INDEX public.catalog_search_document_vector_idx");
            await client.query("DROP INDEX public.catalog_search_document_content_idx");
            await client.query(
                `INSERT INTO public.content_item (id, type, title, author, category, status, quick_mode_json, published_at)
                 SELECT
                    gen_random_uuid(),
                    CASE WHEN ordinal = 6 THEN 'podcast'::public.content_type ELSE 'article'::public.content_type END,
                    CASE
                        WHEN ordinal = 1 THEN $2
                        WHEN ordinal IN (3, 4, 5, 6) THEN $1 || ' content ' || ordinal
                        ELSE $1 || ' noise ' || ordinal
                    END,
                    CASE WHEN ordinal = 2 THEN $3 ELSE 'Performance noise author ' || ordinal END,
                    CASE WHEN ordinal = 6 THEN 'SearchPerformanceFiltered' ELSE 'SearchPerformanceNoise' END,
                    'verified',
                    '{}'::jsonb,
                    now()
                 FROM generate_series(1, 10000) AS generated(ordinal)`,
                [fixturePrefix, titleExact, authorExact],
            );
            await client.query(
                `INSERT INTO public.segment (id, item_id, order_index, title, markdown_body)
                 SELECT
                    gen_random_uuid(),
                    ci.id,
                    segment_ordinal - 1,
                    'Performance segment ' || segment_ordinal,
                    CASE
                        WHEN ci.title = $2 AND segment_ordinal = 1 THEN $3
                        WHEN ci.title = $1 || ' content 4' AND segment_ordinal = 1 THEN $4
                        WHEN ci.title = $1 || ' content 5' AND segment_ordinal = 1 THEN $5
                        WHEN ci.title = $1 || ' content 6' AND segment_ordinal = 1 THEN $6
                        WHEN segment_ordinal = 1 AND mod(abs(hashtext(ci.id::text)), 100) = 0 THEN $7
                        ELSE 'unrelated catalog fixture text ' || segment_ordinal
                    END
                 FROM public.content_item AS ci
                 CROSS JOIN generate_series(1, 10) AS generated(segment_ordinal)
                 WHERE ci.title LIKE $1 || '%'`,
                [fixturePrefix, titleExact, quotedBody, unquotedBody, broadBody, filteredBody, broadBody],
            );
            await client.query("SET LOCAL session_replication_role = 'origin'");
            await client.query(
                `INSERT INTO public.catalog_search_document
                    (source_kind, source_id, content_id, segment_id, source_order, search_vector, snippet_text, snippet_label)
                 SELECT
                    'metadata', ci.id, ci.id, NULL, 0,
                    setweight(to_tsvector('english', ci.title), 'A')
                    || setweight(to_tsvector('english', ci.author), 'B')
                    || setweight(to_tsvector('english', ci.category), 'C'),
                    ci.title || ' ' || ci.author,
                    'Summary'
                 FROM public.content_item AS ci
                 WHERE ci.title LIKE $1 || '%'`,
                [fixturePrefix],
            );
            await client.query(
                `INSERT INTO public.catalog_search_document
                    (source_kind, source_id, content_id, segment_id, source_order, search_vector, snippet_text, snippet_label)
                 SELECT
                    'segment', s.id, s.item_id, s.id, s.order_index + 1,
                    setweight(to_tsvector('english', s.title), 'B')
                    || setweight(to_tsvector('english', s.markdown_body), 'D'),
                    s.markdown_body,
                    s.title
                 FROM public.segment AS s
                 INNER JOIN public.content_item AS ci ON ci.id = s.item_id
                 WHERE ci.title LIKE $1 || '%'`,
                [fixturePrefix],
            );
            await client.query("CREATE INDEX catalog_search_document_vector_idx ON public.catalog_search_document USING gin (search_vector)");
            await client.query("CREATE INDEX catalog_search_document_content_idx ON public.catalog_search_document (content_id, source_order, source_id)");
            await client.query("COMMIT");
            committed = true;
            await client.query("ANALYZE public.catalog_search_document");

            const expectedIds = new Map<string, string>();
            for (const queryCase of querySet) {
                if (queryCase.expectedTitle) {
                    const result = await client.query<{ id: string }>("SELECT id FROM public.content_item WHERE title = $1", [queryCase.expectedTitle]);
                    expectedIds.set(queryCase.id, result.rows[0]!.id);
                } else if (queryCase.expectedAuthor) {
                    const result = await client.query<{ id: string }>("SELECT id FROM public.content_item WHERE author = $1", [queryCase.expectedAuthor]);
                    expectedIds.set(queryCase.id, result.rows[0]!.id);
                } else if (queryCase.expectedBody) {
                    const result = await client.query<{ id: string }>(
                        `SELECT ci.id
                         FROM public.content_item AS ci
                         INNER JOIN public.segment AS s ON s.item_id = ci.id
                         WHERE s.markdown_body = $1
                         LIMIT 1`,
                        [queryCase.expectedBody],
                    );
                    expectedIds.set(queryCase.id, result.rows[0]!.id);
                }
            }

            const plans: Record<string, unknown> = {};
            for (const queryCase of querySet) {
                const plan = await client.query<ExplainRow>(
                    `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
                     SELECT d.content_id
                     FROM public.catalog_search_document AS d
                     WHERE d.search_vector @@ websearch_to_tsquery('english', $1)
                     LIMIT 20`,
                    [queryCase.query],
                );
                plans[queryCase.id] = plan.rows[0]!["QUERY PLAN"];
                expect(planUsesSearchIndex(plans[queryCase.id])).toBe(true);

                const result = await client.query<CatalogRow>(
                    `SELECT content_id, title, snippet_headline
                     FROM public.search_catalog($1, $2::text[], NULL::public.content_type, NULL, NULL, NULL, NULL, 21)`,
                    [queryCase.query, queryCase.category ? [queryCase.category] : []],
                );
                const expectedId = expectedIds.get(queryCase.id);
                if (expectedId && queryCase.maxRank !== null) {
                    const rank = result.rows.findIndex((row) => row.content_id === expectedId) + 1;
                    expect(rank).toBeGreaterThan(0);
                    expect(rank).toBeLessThanOrEqual(queryCase.maxRank);
                }
                if (queryCase.id === "empty-result") expect(result.rows).toEqual([]);
            }

            // Thirty warm samples across the representative query set give a
            // single release-decision distribution without multiplying HTTP
            // setup by every case. Plans and deterministic ranks above still
            // cover every individual query shape.
            const databaseSamples: Array<{ caseId: string; durationMs: number }> = [];
            for (let run = 0; run < 30; run += 1) {
                const queryCase = querySet[run % querySet.length]!;
                const startedAt = performance.now();
                await client.query<CatalogRow>(
                    `SELECT content_id, title, snippet_headline
                     FROM public.search_catalog($1, $2::text[], NULL::public.content_type, NULL, NULL, NULL, NULL, 21)`,
                    [queryCase.query, queryCase.category ? [queryCase.category] : []],
                );
                databaseSamples.push({ caseId: queryCase.id, durationMs: performance.now() - startedAt });
            }
            const databaseDurations = databaseSamples.map((sample) => sample.durationMs);
            expect(percentile(databaseDurations, 0.95)).toBeLessThanOrEqual(300);
            expect(percentile(databaseDurations, 0.99)).toBeLessThanOrEqual(500);

            // Load the actual route only after replacing the disposable CI
            // values. The route uses the same server module and public RPC
            // path as production; no test record is sent to production.
            process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.DB107_SUPABASE_URL;
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.DB107_SUPABASE_ANON_KEY;
            process.env.CATALOG_SEARCH_CURSOR_SECRET ??= "catalog-search-runtime-secret";
            const [{ GET }, { NextRequest }] = await Promise.all([
                import("@/app/api/catalog/search/route"),
                import("next/server"),
            ]);
            const routeSamples: Array<{ caseId: string; durationMs: number }> = [];
            for (let run = 0; run < 30; run += 1) {
                const queryCase = querySet[run % querySet.length]!;
                const params = new URLSearchParams({ q: queryCase.query });
                if (queryCase.category) params.set("category", queryCase.category);
                const startedAt = performance.now();
                const response = await GET(new NextRequest(`http://localhost/api/catalog/search?${params.toString()}`));
                routeSamples.push({ caseId: queryCase.id, durationMs: performance.now() - startedAt });
                expect(response.status).toBe(200);
            }
            const routeDurations = routeSamples.map((sample) => sample.durationMs);
            expect(percentile(routeDurations, 0.95)).toBeLessThanOrEqual(750);

            const evidence = {
                fixtureVersion: "catalog-search-performance-v1",
                corpus: { verifiedContentItems: 10000, activeSegments: 100000 },
                databaseSamples,
                databaseP95Ms: percentile(databaseDurations, 0.95),
                databaseP99Ms: percentile(databaseDurations, 0.99),
                routeSamples,
                routeP95Ms: percentile(routeDurations, 0.95),
                plans,
            };
            console.info(`[catalog-search-evidence] ${JSON.stringify(evidence)}`);
            if (process.env.CATALOG_SEARCH_EVIDENCE_PATH) {
                await mkdir(dirname(process.env.CATALOG_SEARCH_EVIDENCE_PATH), { recursive: true });
                await writeFile(process.env.CATALOG_SEARCH_EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
            }
        } finally {
            if (!committed) await client.query("ROLLBACK").catch(() => undefined);
            await client.query("DELETE FROM public.content_item WHERE title LIKE $1", [`${fixturePrefix}%`]).catch(() => undefined);
            client.release();
        }
    }, 120_000);
});
