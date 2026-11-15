import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const url = process.env.CONTENT_CONTINUITY_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("annotation admission and content saves on a disposable database", () => {
    it.each(["annotation-first", "content-first"])("preserves source meaning when %s", async order => {
        const parsed = new URL(url!);
        if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) && process.env.CONTENT_CONTINUITY_DISPOSABLE !== "1") throw new Error("Explicit disposable database required");
        const [control, writer, saver] = Array.from({ length: 3 }, () => new Client({ connectionString: url }));
        const [user, content, segment] = Array.from({ length: 3 }, () => randomUUID());
        await Promise.all([control.connect(), writer.connect(), saver.connect()]);
        try {
            await control.query("INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES($1,$2,'{}','{}')", [user, `${user}@example.invalid`]);
            await control.query("INSERT INTO public.content_item(id,title,type,status,quick_mode_json) VALUES($1,$2,'article','draft',$3)", [content, `Synthetic race ${content}`, { hook: "Original", big_idea: "Idea", key_takeaways: ["One"] }]);
            await control.query("INSERT INTO public.segment(id,item_id,order_index,markdown_body) VALUES($1,$2,0,'Original passage')", [segment, content]);
            const revision = (await control.query("SELECT reading_revision FROM public.content_item WHERE id=$1", [content])).rows[0].reading_revision;
            for (const client of [writer, saver]) {
                await client.query("BEGIN");
                await client.query("SELECT set_config('request.jwt.claim.role','service_role',true)");
            }
            const firstPid = (await writer.query("SELECT pg_backend_pid() AS id")).rows[0].id;
            const secondPid = (await saver.query("SELECT pg_backend_pid() AS id")).rows[0].id;
            async function assertWaiting() {
                for (let attempt = 0; attempt < 100; attempt++) {
                    const blockers = (await control.query("SELECT pg_blocking_pids($1) AS ids", [secondPid])).rows[0].ids as number[];
                    if (blockers.includes(firstPid)) return;
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                throw new Error("The second transaction never waited for the source lock");
            }
            const patch = { quick_mode_json: { hook: "Revised", big_idea: "Idea", key_takeaways: ["One"] } };
            if (order === "annotation-first") {
                await writer.query("INSERT INTO public.user_reflections(user_id,content_item_id,prompt,reflection_text,content_revision) VALUES($1,$2,'Prompt','Saved note',$3)", [user, content, revision]);
                const save = saver.query("SELECT public.admin_save_content_revision($1,$2,NULL,NULL) AS receipt", [content, patch]);
                await assertWaiting();
                await writer.query("COMMIT");
                const receipt = (await save).rows[0].receipt;
                await saver.query("COMMIT");
                expect(receipt).toMatchObject({ created_version: true, status: "draft" });
                expect(receipt.content_id).not.toBe(content);
                expect((await control.query("SELECT quick_mode_json->>'hook' AS hook FROM public.content_item WHERE id=$1", [content])).rows[0].hook).toBe("Original");
            } else {
                await writer.query("SELECT public.admin_update_content_graph($1,$2,NULL,NULL)", [content, patch]);
                const capture = saver.query("INSERT INTO public.user_highlights(user_id,content_item_id,segment_id,highlighted_text,content_revision) VALUES($1,$2,$3,'Original passage',$4)", [user, content, segment, revision]);
                const rejected = expect(capture).rejects.toMatchObject({ code: "PT409" });
                await assertWaiting();
                await writer.query("COMMIT");
                await rejected;
                await saver.query("ROLLBACK");
                expect((await control.query("SELECT count(*)::int AS n FROM public.user_highlights WHERE content_item_id=$1", [content])).rows[0].n).toBe(0);
            }
        } finally {
            await writer.query("ROLLBACK"); await saver.query("ROLLBACK");
            await control.query("DELETE FROM auth.users WHERE id=$1", [user]);
            await control.query("DELETE FROM public.content_item WHERE update_source_id=$1", [content]);
            await control.query("DELETE FROM public.content_item WHERE id=$1", [content]);
            await Promise.all([control.end(), writer.end(), saver.end()]);
        }
    });
});
