import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
const url = process.env.CONTENT_CONTINUITY_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("edition admission on an explicitly disposable database", () => {
    it("serializes simultaneous creates and publishes into one draft and one replacement", async () => {
        const parsed = new URL(url!);
        if (!["localhost","127.0.0.1","[::1]"].includes(parsed.hostname) && process.env.CONTENT_CONTINUITY_DISPOSABLE !== "1") throw new Error("Explicit disposable database required");
        const db = new Client({connectionString:url}); await db.connect();
        const old = randomUUID(); let draft: string | undefined;
        async function call(sql: string,args: unknown[]) {
            const worker = new Client({connectionString:url}); await worker.connect();
            try {
                await worker.query("BEGIN"); await worker.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
                const result = await worker.query(sql,args); await worker.query("COMMIT"); return result.rows[0];
            } finally { await worker.end(); }
        }
        async function stamp(id: string) { return (await db.query("SELECT updated_at::text FROM public.content_item WHERE id=$1",[id])).rows[0].updated_at; }
        try {
            await db.query(`INSERT INTO public.content_item(id,title,type,status,category,cover_image_url,quick_mode_json)
                VALUES ($1,'Concurrent synthetic edition','book','verified','Business','https://example.invalid/cover.png',$2)`,[old,{hook:"Synthetic",big_idea:"Synthetic",key_takeaways:["Synthetic"]}]);
            await db.query("INSERT INTO public.segment(item_id,order_index,markdown_body) VALUES ($1,0,'Synthetic original')",[old]);
            const originalTime = await stamp(old);
            const copies = await Promise.all([call("SELECT public.admin_create_content_version($1,$2) AS id",[old,originalTime]),call("SELECT public.admin_create_content_version($1,$2) AS id",[old,originalTime])]);
            draft = copies[0].id; expect(copies[1].id).toBe(draft);
            // A child-only save in a later transaction invalidates a held review.
            const held = await stamp(draft!);
            const section = (await db.query("SELECT id FROM public.segment WHERE item_id=$1",[draft])).rows[0].id;
            await call("SELECT public.admin_update_content_graph($1,'{}',$2,NULL)",[draft,JSON.stringify([{id:section,order_index:0,title:"Rewritten",markdown_body:"Updated synthetic passage"}])]);
            await expect(call("SELECT public.admin_replace_content($1,$2,$3,$4)",[old,draft,originalTime,held])).rejects.toMatchObject({code:"40001"});
            const nextTime = await stamp(draft!);
            const published = await Promise.all([call("SELECT public.admin_replace_content($1,$2,$3,$4) AS receipt",[old,draft,originalTime,nextTime]),call("SELECT public.admin_replace_content($1,$2,$3,$4) AS receipt",[old,draft,originalTime,nextTime])]);
            expect(published.map(r=>r.receipt.already_replaced).sort()).toEqual([false,true]);
            expect((await db.query("SELECT count(*)::int AS n FROM public.content_replacement WHERE source_id=$1",[old])).rows[0].n).toBe(1);
            expect((await db.query("SELECT count(*)::int AS n FROM public.content_item WHERE id=ANY($1::uuid[]) AND status='verified' AND deleted_at IS NULL",[[old,draft]])).rows[0].n).toBe(1);
        } finally {
            // Remove only this test's synthetic records, after clearing the link.
            await db.query("DELETE FROM public.content_replacement WHERE source_id=$1",[old]);
            await db.query("DELETE FROM public.content_item WHERE update_source_id=$1",[old]);
            await db.query("DELETE FROM public.content_item WHERE id=$1",[old]);
            await db.end();
        }
    });
});
