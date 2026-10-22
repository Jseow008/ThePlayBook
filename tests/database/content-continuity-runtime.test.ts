import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.CONTENT_CONTINUITY_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("content replacement on an explicitly disposable database", () => {
    let db: Client;
    let oldId: string;
    let keptId: string;
    let nextId: string;
    let userId: string;
    let segmentId: string;
    let oldUpdatedAt: string;
    let keptUpdatedAt: string;

    beforeEach(async () => {
        const url = new URL(databaseUrl!);
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
            && process.env.CONTENT_CONTINUITY_DISPOSABLE !== "1") throw new Error("Explicit disposable database required");
        db = new Client({ connectionString: databaseUrl });
        await db.connect();
        await db.query("BEGIN");
        [oldId, keptId, nextId, userId, segmentId] = Array.from({ length: 5 }, () => randomUUID());
        await db.query("SELECT set_config('request.jwt.claim.role', 'service_role', true)");
        await db.query(`INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
            VALUES ($1, $2, '{}', '{}')`, [userId, `${userId}@example.invalid`]);
        await db.query(`INSERT INTO public.content_item(id, type, title, status, category, quick_mode_json)
            VALUES ($1, 'book', $4, 'verified', 'Productivity', $5),
                   ($2, 'book', $6, 'verified', 'Productivity', $5),
                   ($3, 'book', $7, 'verified', 'Productivity', $5)`,
        [oldId, keptId, nextId, `Old ${oldId}`, { hook: "Fixture", big_idea: "Fixture", key_takeaways: ["Fixture"] }, `Kept ${keptId}`, `Next ${nextId}`]);
        await db.query(`INSERT INTO public.segment(id, item_id, order_index, title, markdown_body)
            VALUES ($1, $2, 0, 'Original section', 'Original passage')`, [segmentId, oldId]);
        await db.query(`INSERT INTO public.user_library(user_id, content_id, is_bookmarked, progress)
            VALUES ($1, $2, true, $4), ($1, $3, true, $5)`,
        [userId, oldId, keptId, { completed: [segmentId], lastSegmentIndex: 0 }, { completed: ["already-read"], lastSegmentIndex: 2 }]);
        await db.query(`INSERT INTO public.user_highlights(user_id, content_item_id, segment_id, highlighted_text, note_body)
            VALUES ($1, $2, $3, 'Original passage', 'Original thought')`, [userId, oldId, segmentId]);
        await db.query(`INSERT INTO public.user_reflections(user_id, content_item_id, prompt, reflection_text)
            VALUES ($1, $2, 'Fixture', 'Original reflection')`, [userId, oldId]);
        const times = await db.query("SELECT id, updated_at::text FROM public.content_item WHERE id = ANY($1::uuid[])", [[oldId, keptId]]);
        oldUpdatedAt = times.rows.find((row) => row.id === oldId).updated_at;
        keptUpdatedAt = times.rows.find((row) => row.id === keptId).updated_at;
    });
    afterEach(async () => { if (db) { await db.query("ROLLBACK"); await db.end(); } });

    async function replace(source = oldId, target = keptId, sourceTime = oldUpdatedAt, targetTime = keptUpdatedAt) {
        return db.query("SELECT public.admin_replace_content($1,$2,$3,$4) AS receipt", [source, target, sourceTime, targetTime]);
    }
    async function personalState() {
        return (await db.query(`SELECT jsonb_build_object(
            'library', (SELECT jsonb_agg(to_jsonb(t) ORDER BY content_id) FROM public.user_library t WHERE user_id=$1),
            'highlights', (SELECT jsonb_agg(to_jsonb(t)) FROM public.user_highlights t WHERE user_id=$1),
            'reflections', (SELECT jsonb_agg(to_jsonb(t)) FROM public.user_reflections t WHERE user_id=$1)) AS state`, [userId])).rows[0].state;
    }
    it("preserves both versions' personal state exactly and keeps original segments", async () => {
        const before = await personalState();
        const result = await replace();
        expect(result.rows[0].receipt).toMatchObject({ preserved_library_records: 1, preserved_highlights: 1, preserved_reflections: 1 });
        expect(await personalState()).toEqual(before);
        expect((await db.query("SELECT markdown_body FROM public.segment WHERE id=$1", [segmentId])).rows[0].markdown_body).toBe("Original passage");
        expect((await db.query("SELECT deleted_at FROM public.content_item WHERE id=$1", [oldId])).rows[0].deleted_at).not.toBeNull();
        expect((await replace()).rows[0].receipt.already_replaced).toBe(true);
    });
    it("refuses stale previews without retiring the source", async () => {
        await db.query("SAVEPOINT reject");
        await expect(replace(oldId, keptId, "2000-01-01T00:00:00Z")).rejects.toMatchObject({ code: "40001" });
        await db.query("ROLLBACK TO SAVEPOINT reject");
        expect((await db.query("SELECT deleted_at FROM public.content_item WHERE id=$1", [oldId])).rows[0].deleted_at).toBeNull();
    });
    it("refuses replacement while original narration is processing", async () => {
        await db.query("UPDATE public.content_item SET narration_status='processing' WHERE id=$1", [oldId]);
        await expect(replace()).rejects.toMatchObject({ code: "40001" });
    });
    it("blocks permanent deletion while personal records exist", async () => {
        await expect(db.query("DELETE FROM public.content_item WHERE id=$1", [oldId])).rejects.toMatchObject({ code: "23503" });
    });
    it("freezes replaced content and segment edits", async () => {
        await replace();
        for (const query of ["UPDATE public.content_item SET title='changed' WHERE id=$1", "UPDATE public.segment SET markdown_body='changed' WHERE item_id=$1"]) {
            await db.query("SAVEPOINT reject");
            await expect(db.query(query, [oldId])).rejects.toMatchObject({ code: "23514" });
            await db.query("ROLLBACK TO SAVEPOINT reject");
        }
    });
    it("deletes an archived-only series through the real foreign key without altering the archived edition", async () => {
        const seriesId = randomUUID();
        await db.query("INSERT INTO public.content_series(id,title,slug) VALUES ($1,'Original series',$2)", [seriesId, `series-${seriesId}`]);
        await db.query("UPDATE public.content_item SET series_id=$1,series_order=1 WHERE id=$2", [seriesId, oldId]);
        oldUpdatedAt = (await db.query("SELECT updated_at::text FROM public.content_item WHERE id=$1", [oldId])).rows[0].updated_at;
        await replace();
        const before = (await db.query("SELECT to_jsonb(c) - ARRAY['series_id','series_order','updated_at'] AS edition FROM public.content_item c WHERE id=$1", [oldId])).rows[0].edition;
        const personalBefore = await personalState();
        expect((await db.query("SELECT count(*)::int AS count FROM public.content_item WHERE series_id=$1 AND deleted_at IS NULL", [seriesId])).rows[0].count).toBe(0);
        await db.query("DELETE FROM public.content_series WHERE id=$1", [seriesId]);
        const after = (await db.query("SELECT series_id,series_order,to_jsonb(c) - ARRAY['series_id','series_order','updated_at'] AS edition FROM public.content_item c WHERE id=$1", [oldId])).rows[0];
        expect(after).toEqual({ series_id: null, series_order: null, edition: before });
        expect(await personalState()).toEqual(personalBefore);
        expect((await db.query("SELECT markdown_body FROM public.segment WHERE id=$1", [segmentId])).rows[0].markdown_body).toBe("Original passage");
    });
    it("still rejects manual archive detachment while its series exists", async () => {
        const seriesId = randomUUID();
        await db.query("INSERT INTO public.content_series(id,title,slug) VALUES ($1,'Retained series',$2)", [seriesId, `series-${seriesId}`]);
        await db.query("UPDATE public.content_item SET series_id=$1,series_order=1 WHERE id=$2", [seriesId, oldId]);
        oldUpdatedAt = (await db.query("SELECT updated_at::text FROM public.content_item WHERE id=$1", [oldId])).rows[0].updated_at;
        await replace();
        await expect(db.query("UPDATE public.content_item SET series_id=NULL,series_order=NULL WHERE id=$1", [oldId])).rejects.toMatchObject({ code: "23514" });
    });
    it("keeps genuinely empty series deletion working", async () => {
        const seriesId = randomUUID();
        await db.query("INSERT INTO public.content_series(id,title,slug) VALUES ($1,'Empty series',$2)", [seriesId, `series-${seriesId}`]);
        expect((await db.query("DELETE FROM public.content_series WHERE id=$1 RETURNING id", [seriesId])).rowCount).toBe(1);
    });
    it("flattens later replacements and never transfers positions", async () => {
        const before = await personalState();
        await replace();
        const next = (await db.query("SELECT updated_at::text FROM public.content_item WHERE id=$1", [nextId])).rows[0].updated_at;
        await replace(keptId, nextId, keptUpdatedAt, next);
        expect((await db.query("SELECT replacement_id FROM public.content_replacement ORDER BY source_id")).rows.every((row) => row.replacement_id === nextId)).toBe(true);
        expect(await personalState()).toEqual(before);
    });
    it("permits only public notice reads and hides withdrawn destinations", async () => {
        await replace();
        await db.query("SET LOCAL ROLE anon");
        expect((await db.query("SELECT source_id FROM public.content_replacement WHERE source_id=$1", [oldId])).rowCount).toBe(1);
        await db.query("SAVEPOINT denied");
        await expect(replace()).rejects.toMatchObject({ code: "42501" });
        await db.query("ROLLBACK TO SAVEPOINT denied");
        await db.query("RESET ROLE");
        await db.query("UPDATE public.content_item SET deleted_at=now() WHERE id=$1", [keptId]);
        await db.query("SET LOCAL ROLE anon");
        expect((await db.query("SELECT source_id FROM public.content_replacement WHERE source_id=$1", [oldId])).rowCount).toBe(0);
    });
});
