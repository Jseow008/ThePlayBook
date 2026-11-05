import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.CONTENT_CONTINUITY_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("updated editions on an explicitly disposable database", () => {
    let db: Client;
    let oldId: string;
    let sectionId: string;
    let userId: string;
    const quick = { hook: "Fixture", big_idea: "Original idea", key_takeaways: ["Fixture"] };
    beforeEach(async () => {
        const url = new URL(databaseUrl!);
        if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && process.env.CONTENT_CONTINUITY_DISPOSABLE !== "1") throw new Error("Explicit disposable database required");
        db = new Client({ connectionString: databaseUrl });
        await db.connect();
        await db.query("BEGIN");
        await db.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
        [oldId, sectionId, userId] = Array.from({ length: 3 }, () => randomUUID());
        await db.query("INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES ($1,$2,'{}','{}')", [userId, `${userId}@example.invalid`]);
        await db.query(`INSERT INTO public.content_item(id,type,title,status,category,cover_image_url,quick_mode_json,audio_url,narration_status)
            VALUES ($1,'book','Original fixture','verified','Business','https://example.invalid/cover.png',$2,'https://example.invalid/audio.mp3','ready')`, [oldId, quick]);
        await db.query("UPDATE public.content_item SET author=$1,isbn='9780000000001' WHERE id=$2",[`Synthetic author ${oldId}`,oldId]);
        await db.query("INSERT INTO public.segment(id,item_id,order_index,title,markdown_body,start_time_sec,end_time_sec) VALUES ($1,$2,0,'Original section','Original quotation',0,30)", [sectionId, oldId]);
        await db.query("INSERT INTO public.user_highlights(user_id,content_item_id,segment_id,highlighted_text,note_body) VALUES ($1,$2,$3,'Original quotation','Synthetic thought')", [userId, oldId, sectionId]);
        await db.query("INSERT INTO public.artifact(item_id,type,payload_schema,version) VALUES ($1,'checklist',$2,'1.0.0')",[oldId,{title:"Original checklist",items:[]}]);
        await db.query("INSERT INTO public.user_library(user_id,content_id,progress) VALUES ($1,$2,$3)", [userId, oldId, { completed: [sectionId] }]);
    });
    afterEach(async () => { if (db) { await db.query("ROLLBACK"); await db.end(); } });
    async function stamp(id: string) { return (await db.query("SELECT updated_at::text FROM public.content_item WHERE id=$1", [id])).rows[0].updated_at as string; }
    async function create() { return (await db.query("SELECT public.admin_create_content_version($1,$2) AS id", [oldId, await stamp(oldId)])).rows[0].id as string; }
    async function publish(id: string, sourceTime?: string, draftTime?: string) {
        return db.query("SELECT public.admin_replace_content($1,$2,$3,$4) AS receipt", [oldId, id, sourceTime ?? await stamp(oldId), draftTime ?? await stamp(id)]);
    }
    async function state() {
        return (await db.query(`SELECT jsonb_build_object(
            'highlights',(SELECT jsonb_agg(to_jsonb(h)) FROM public.user_highlights h WHERE user_id=$1),
            'library',(SELECT jsonb_agg(to_jsonb(l)) FROM public.user_library l WHERE user_id=$1),
            'sections',(SELECT jsonb_agg(to_jsonb(s)) FROM public.segment s WHERE item_id=$2),
            'artifacts',(SELECT jsonb_agg(to_jsonb(a)) FROM public.artifact a WHERE item_id=$2)) AS value`, [userId, oldId])).rows[0].value;
    }
    async function reject(sql: string, args: unknown[], code: string) {
        await db.query("SAVEPOINT reject");
        await expect(db.query(sql,args)).rejects.toMatchObject({ code });
        await db.query("ROLLBACK TO SAVEPOINT reject");
    }
    it("copies new section IDs without copying personal state, audio, timings or embeddings, and resumes the same draft", async () => {
        const before = await state();
        const id = await create();
        expect(await create()).toBe(id);
        const target = (await db.query("SELECT * FROM public.content_item WHERE id=$1", [id])).rows[0];
        expect(target).toMatchObject({ status: "draft", update_source_id: oldId, isbn: "9780000000001", audio_url: null, embedding: null, published_at: null, series_id: null, series_order: null });
        const section = (await db.query("SELECT * FROM public.segment WHERE item_id=$1", [id])).rows[0];
        expect(section.id).not.toBe(sectionId);
        const originalArtifact=(await db.query("SELECT id,payload_schema FROM public.artifact WHERE item_id=$1",[oldId])).rows[0];
        const newArtifact=(await db.query("SELECT id,payload_schema FROM public.artifact WHERE item_id=$1",[id])).rows[0];
        expect(newArtifact.id).not.toBe(originalArtifact.id);
        expect(newArtifact.payload_schema).toEqual(originalArtifact.payload_schema);
        expect(section).toMatchObject({ markdown_body: "Original quotation", start_time_sec: null, end_time_sec: null });
        expect(await state()).toEqual(before);
        await reject("INSERT INTO public.content_item(title,author,type,status) VALUES ('Original fixture',$1,'book','draft')",[`Synthetic author ${oldId}`],"23505");
        await reject("INSERT INTO public.content_item(title,author,type,status,isbn) VALUES ('Different title','Different author','book','draft','9780000000001')",[],"23505");
        await db.query("SET LOCAL ROLE anon");
        expect((await db.query("SELECT id FROM public.content_item WHERE id=$1", [id])).rowCount).toBe(0);
        expect((await db.query("SELECT id FROM public.segment WHERE item_id=$1", [id])).rowCount).toBe(0);
    });
    it("blocks rewrites and removal through Save and Save as Draft, including after a prior downgrade", async () => {
        const graph = [{ id: sectionId, order_index: 0, title: "Original section", markdown_body: "Rewritten quotation" }];
        for (const status of ["verified", "draft"]) {
            await reject("SELECT public.admin_update_content_graph($1,$2,$3,NULL)", [oldId, { status }, JSON.stringify(graph)], "P0001");
        }
        await db.query("SELECT public.admin_update_content_graph($1,$2,NULL,NULL)", [oldId, { status: "draft", author: "Safe metadata" }]);
        await reject("SELECT public.admin_update_content_graph($1,'{}',$2,NULL)", [oldId, JSON.stringify(graph)], "P0001");
        await reject("SELECT public.admin_update_content_graph($1,'{}','[]',NULL)", [oldId], "P0001");
        await reject("SELECT public.admin_update_content_graph($1,$2,NULL,NULL)", [oldId, { quick_mode_json: { ...quick, big_idea: "Rewrite" } }], "P0001");
        expect((await db.query("SELECT markdown_body FROM public.segment WHERE id=$1", [sectionId])).rows[0].markdown_body).toBe("Original quotation");
    });
    it("allows identical resubmitted reading text, metadata and timing maintenance", async () => {
        await db.query("SELECT public.admin_update_content_graph($1,$2,$3,NULL)", [oldId, { author: "Updated author", quick_mode_json: quick }, JSON.stringify([{ id: sectionId, order_index: 0, title: "Original section", markdown_body: "Original quotation", start_time_sec: 1, end_time_sec: 31 }])]);
        expect((await db.query("SELECT author FROM public.content_item WHERE id=$1", [oldId])).rows[0].author).toBe("Updated author");
    });
    it("publishes the saved rewrite atomically, preserves original personal records and retains series history", async () => {
        const seriesId = randomUUID();
        await db.query("INSERT INTO public.content_series(id,title,slug) VALUES ($1,'Fixture',$2)", [seriesId, seriesId]);
        await db.query("UPDATE public.content_item SET series_id=$1,series_order=2 WHERE id=$2", [seriesId, oldId]);
        const before = await state();
        const id = await create();
        const section = (await db.query("SELECT id FROM public.segment WHERE item_id=$1", [id])).rows[0].id;
        await db.query("SELECT public.admin_update_content_graph($1,'{}',$2,NULL)", [id, JSON.stringify([{ id: section, order_index: 0, title: "New section", markdown_body: "New wording" }])]);
        await publish(id);
        expect(await state()).toEqual(before);
        const editions = (await db.query("SELECT id,status,deleted_at,series_id,series_order FROM public.content_item WHERE id=ANY($1::uuid[])", [[oldId,id]])).rows;
        expect(editions.find(e => e.id===oldId)).toMatchObject({ series_id: seriesId, series_order: 2 });
        expect(editions.find(e => e.id===oldId).deleted_at).not.toBeNull();
        expect(editions.find(e => e.id===id)).toMatchObject({ status: "verified", deleted_at: null, series_id: seriesId, series_order: 2 });
        expect((await db.query("SELECT count(*)::int AS n FROM public.content_item WHERE series_id=$1 AND deleted_at IS NULL", [seriesId])).rows[0].n).toBe(1);
        expect((await publish(id)).rows[0].receipt.already_replaced).toBe(true);
        await reject("SELECT public.admin_update_content_graph($1,$2,NULL,NULL)", [oldId,{ author: "Cannot edit archive" }], "23514");
    });
    it("keeps source live and draft recoverable when publish validation or a stale review fails", async () => {
        const id = await create();
        await reject("SELECT public.admin_replace_content($1,$2,$3,$4)", [oldId,id,"2000-01-01",await stamp(id)], "40001");
        await db.query("UPDATE public.content_item SET category=NULL WHERE id=$1", [id]);
        await reject("SELECT public.admin_replace_content($1,$2,$3,$4)", [oldId,id,await stamp(oldId),await stamp(id)], "22023");
        expect((await db.query("SELECT deleted_at FROM public.content_item WHERE id=$1",[oldId])).rows[0].deleted_at).toBeNull();
        expect(await create()).toBe(id);
        await db.query("UPDATE public.content_item SET category='Business' WHERE id=$1",[id]);
        await publish(id);
    });
    it("rechecks book identity at publication and rolls retirement back on a conflict", async () => {
        const otherId=randomUUID();
        await db.query("INSERT INTO public.content_item(id,title,author,type,status) VALUES ($1,'Different book','Other author','book','verified')",[otherId]);
        const id=await create();
        await db.query("SELECT public.admin_update_content_graph($1,$2,NULL,NULL)",[id,{title:"Different book",author:"Other author"}]);
        await reject("SELECT public.admin_replace_content($1,$2,$3,$4)",[oldId,id,await stamp(oldId),await stamp(id)],"23505");
        expect((await db.query("SELECT deleted_at FROM public.content_item WHERE id=$1",[oldId])).rows[0].deleted_at).toBeNull();
        expect((await db.query("SELECT status FROM public.content_item WHERE id=$1",[id])).rows[0].status).toBe("draft");
        expect((await db.query("SELECT count(*)::int AS n FROM public.content_replacement WHERE source_id=$1",[oldId])).rows[0].n).toBe(0);
    });
    it("blocks generic/bulk publication and service-only calls from browser roles", async () => {
        const id = await create();
        await reject("UPDATE public.content_item SET status='verified' WHERE id=$1",[id],"23514");
        await reject("SELECT public.admin_update_content_graph($1,$2,NULL,NULL)",[id,{status:"verified"}],"P0001");
        await reject("UPDATE public.content_item SET update_source_id=NULL WHERE id=$1",[id],"23514");
        for (const role of ["anon","authenticated"]) {
            await db.query(`SET LOCAL ROLE ${role}`);
            await reject("SELECT public.admin_create_content_version($1,$2)",[oldId,await stamp(oldId)],"42501");
            await db.query("RESET ROLE");
        }
    });
    it("flattens successive updated editions without moving the original note", async () => {
        const seriesId = randomUUID();
        await db.query("INSERT INTO public.content_series(id,title,slug) VALUES ($1,'Synthetic series',$2)",[seriesId,seriesId]);
        await db.query("UPDATE public.content_item SET series_id=$1,series_order=1 WHERE id=$2",[seriesId,oldId]);
        const before = await state();
        const id = await create();
        await publish(id);
        const next = (await db.query("SELECT public.admin_create_content_version($1,$2) AS id",[id,await stamp(id)])).rows[0].id;
        await db.query("SELECT public.admin_replace_content($1,$2,$3,$4)",[id,next,await stamp(id),await stamp(next)]);
        expect((await db.query("SELECT replacement_id FROM public.content_replacement WHERE source_id=$1",[oldId])).rows[0].replacement_id).toBe(next);
        expect(await state()).toEqual(before);
        // Existing series-deletion FK behavior also works for second-generation archives.
        await db.query("DELETE FROM public.content_series WHERE id=$1",[seriesId]);
        expect((await db.query("SELECT count(*)::int AS n FROM public.content_item WHERE id=ANY($1::uuid[]) AND series_id IS NOT NULL",[[oldId,id,next]])).rows[0].n).toBe(0);
    });
});
