import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";

const url = process.env.DB107_ADMIN_DATABASE_URL;
if (process.env.CAPTURE_WRITE_RUNTIME_REQUIRED === "1" && !url) throw new Error("Disposable database required");
(url ? describe : describe.skip)("capture admission at the authenticated database boundary", () => {
    const db = new Pool({ connectionString: url, max: 10 });
    const a = randomUUID(), b = randomUUID(), item = randomUUID();
    async function asUser(sql: string, args: unknown[] = [], user = a, role = "authenticated") {
        const connection = await db.connect();
        try {
            await connection.query("BEGIN");
            await connection.query(`SET LOCAL ROLE ${role}`);
            await connection.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role })]);
            const result = await connection.query(sql, args);
            await connection.query("COMMIT"); return result;
        } catch (error) { await connection.query("ROLLBACK"); throw error; }
        finally { connection.release(); }
    }
    const insert = (user = a, text = "source text", note: string | null = null) => asUser(
        "INSERT INTO public.user_highlights(user_id,content_item_id,highlighted_text,note_body) VALUES($1,$2,$3,$4) RETURNING id", [user,item,text,note], user);
    beforeAll(async () => {
        for (const user of [a,b]) await db.query("INSERT INTO auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'{}','{}',now(),now())", [user,`capture-${user}@example.invalid`]);
        await db.query("INSERT INTO public.content_item(id,type,title,status) VALUES($1,'article','Capture boundary fixture','verified')", [item]);
    });
    beforeEach(async () => {
        await db.query("DELETE FROM public.user_highlights WHERE user_id=ANY($1::uuid[])",[ [a,b] ]);
        await db.query("DELETE FROM public.user_reflections WHERE user_id=ANY($1::uuid[])",[ [a,b] ]);
        await db.query("DELETE FROM private.capture_write_budget WHERE user_id=ANY($1::uuid[])",[ [a,b] ]);
    });
    afterAll(async () => {
        await db.query("DELETE FROM auth.users WHERE id=ANY($1::uuid[])",[[a,b]]);
        await db.query("DELETE FROM public.content_item WHERE id=$1",[item]); await db.end();
    });
    const apiUrl = process.env.DB107_SUPABASE_URL;
    const anonKey = process.env.DB107_SUPABASE_ANON_KEY;
    const serviceKey = process.env.DB107_SUPABASE_SERVICE_ROLE_KEY;
    (apiUrl && anonKey && serviceKey ? it : it.skip)("enforces the limit through real Auth and the direct Data API", async () => {
        const admin=createClient(apiUrl!,serviceKey!,{auth:{persistSession:false,autoRefreshToken:false}});
        const userClient=createClient(apiUrl!,anonKey!,{auth:{persistSession:false,autoRefreshToken:false}});
        const email=`capture-${randomUUID()}@netflux.blog`,password=`Capture-${randomUUID()}!`;
        const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
        if(created.error || !created.data.user) throw created.error ?? new Error("Fixture account missing");
        const userId=created.data.user.id;
        try {
            const login=await userClient.auth.signInWithPassword({email,password});expect(login.error).toBeNull();
            const value={user_id:userId,content_item_id:item,highlighted_text:"Direct API capture"};
            const initial=await userClient.from("user_highlights").insert(value);expect(initial.error).toBeNull();
            await db.query("UPDATE private.capture_write_budget SET writes=30 WHERE user_id=$1",[userId]);
            const denied=await userClient.from("user_highlights").insert(value);
            expect(denied.status).toBe(429);expect(denied.error?.code).toBe("PT429");
            expect((await db.query("SELECT count(*) FROM public.user_highlights WHERE user_id=$1",[userId])).rows[0].count).toBe("1");
        } finally {
            await userClient.auth.signOut({scope:"global"});
            const deleted=await admin.auth.admin.deleteUser(userId);if(deleted.error) throw deleted.error;
        }
    });
    it("admits only one concurrent writer for the final highlight unit and isolates accounts", async () => {
        await insert();
        await db.query("UPDATE private.capture_write_budget SET writes=29 WHERE user_id=$1",[a]);
        const results=await Promise.allSettled(Array.from({length:8},()=>insert()));
        expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
        expect(results.filter(r=>r.status==='rejected').every(r=>r.status==='rejected' && r.reason.code==='PT429')).toBe(true);
        await expect(insert(b)).resolves.toBeDefined();
        expect((await db.query("SELECT count(*) FROM public.user_highlights WHERE user_id=$1",[a])).rows[0].count).toBe('2');
    });
    it("shares insert/update/delete admission and renews the expired window", async () => {
        const id=(await insert()).rows[0].id;
        await db.query("UPDATE private.capture_write_budget SET writes=30 WHERE user_id=$1",[a]);
        await expect(asUser("UPDATE public.user_highlights SET note_body='edit' WHERE id=$1",[id])).rejects.toMatchObject({code:'PT429'});
        await expect(asUser("DELETE FROM public.user_highlights WHERE id=$1",[id])).rejects.toMatchObject({code:'PT429'});
        await db.query("UPDATE private.capture_write_budget SET window_started_at=now()-interval '61 seconds' WHERE user_id=$1",[a]);
        await expect(asUser("DELETE FROM public.user_highlights WHERE id=$1",[id])).resolves.toBeDefined();
    });
    it("bounds a bulk insert atomically and permits a whole-library highlight deletion", async () => {
        await expect(asUser("INSERT INTO public.user_highlights(user_id,content_item_id,highlighted_text) SELECT $1,$2,'bulk' FROM generate_series(1,31)",[a,item])).rejects.toMatchObject({code:'PT429'});
        expect((await db.query("SELECT count(*) FROM public.user_highlights WHERE user_id=$1",[a])).rows[0].count).toBe('0');
        await db.query("INSERT INTO public.user_highlights(user_id,content_item_id,highlighted_text) SELECT $1,$2,'legacy' FROM generate_series(1,55)",[a,item]);
        await expect(asUser("DELETE FROM public.user_highlights WHERE user_id=$1",[a])).resolves.toMatchObject({rowCount:55});
        expect((await db.query("SELECT writes FROM private.capture_write_budget WHERE user_id=$1",[a])).rows[0].writes).toBe(1);
    });
    it("enforces text boundaries and per-item capacity on direct writes", async () => {
        await expect(insert(a,'x'.repeat(2000),'n'.repeat(4000))).resolves.toBeDefined();
        await expect(insert(a,' '.repeat(2000)+'x')).rejects.toMatchObject({code:'22001'});
        await expect(insert(a,'x'.repeat(2001))).rejects.toMatchObject({code:'22001'});
        await expect(insert(a,'text','n'.repeat(4001))).rejects.toMatchObject({code:'22001'});
        await db.query("INSERT INTO public.user_highlights(user_id,content_item_id,highlighted_text) SELECT $1,$2,'legacy' FROM generate_series(1,49)",[a,item]);
        await expect(insert()).rejects.toMatchObject({code:'PT403'});
    });
    it("preserves ownership RLS and prevents changing the private counter or calling its helper", async () => {
        const id=(await insert(b)).rows[0].id;
        await expect(asUser("UPDATE public.user_highlights SET note_body='other' WHERE id=$1",[id])).resolves.toMatchObject({rowCount:0});
        await expect(asUser("INSERT INTO public.user_highlights(user_id,content_item_id,highlighted_text) VALUES($1,$2,'other')",[b,item])).rejects.toMatchObject({code:'42501'});
        await expect(asUser("UPDATE private.capture_write_budget SET writes=1")).rejects.toMatchObject({code:'42501'});
        await expect(asUser("SELECT private.admit_capture_write('user_highlights')")).rejects.toMatchObject({code:'42501'});
        await expect(asUser("INSERT INTO public.user_highlights(user_id,content_item_id,highlighted_text) VALUES($1,$2,'anon')",[a,item],a,'anon')).rejects.toMatchObject({code:'42501'});
    });
    it("charges a reflection upsert once, not twice, and preserves field bounds", async () => {
        const sql="INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text) VALUES($1,$2,'prompt',$3) ON CONFLICT(user_id,content_item_id) DO UPDATE SET reflection_text=excluded.reflection_text";
        await asUser(sql,[a,item,'first']); await asUser(sql,[a,item,'second']);
        expect((await db.query("SELECT writes FROM private.capture_write_budget WHERE user_id=$1",[a])).rows[0].writes).toBe(2);
        await expect(asUser(sql,[a,item,'x'.repeat(1001)])).rejects.toMatchObject({code:'23514'});
    });
    it("limits direct reflection edits and retains index invalidation and deletion", async () => {
        const saved=await asUser("INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text) VALUES($1,$2,'prompt','text') RETURNING id",[a,item]);
        const id=saved.rows[0].id;
        expect((await db.query("SELECT count(*) FROM private.personal_evidence_index WHERE reflection_id=$1",[id])).rows[0].count).toBe('1');
        await db.query("UPDATE private.capture_write_budget SET writes=12 WHERE user_id=$1",[a]);
        await expect(asUser("UPDATE public.user_reflections SET reflection_text='new' WHERE id=$1",[id])).rejects.toMatchObject({code:'PT429'});
        await db.query("UPDATE private.capture_write_budget SET window_started_at=now()-interval '61 seconds' WHERE user_id=$1",[a]);
        await asUser("DELETE FROM public.user_reflections WHERE id=$1",[id]);
        expect((await db.query("SELECT count(*) FROM private.personal_evidence_index WHERE reflection_id=$1",[id])).rows[0].count).toBe('0');
    });
});
