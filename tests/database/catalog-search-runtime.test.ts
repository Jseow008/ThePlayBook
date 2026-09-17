import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const adminDatabaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
const describeDatabase = adminDatabaseUrl ? describe : describe.skip;

type CatalogRow = { content_id: string; title: string; snippet_headline: string; result_rank?: number; cursor_rank?: string };
type HighlightRow = { id: string; user_id: string; highlighted_text: string; note_body: string | null; cursor_created_at?: string };

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
        const noiseRows = Array.from({ length: 101 }, () => randomUUID());
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
        } finally {
            await client.query("ROLLBACK");
            client.release();
        }
    });
});
