import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
if (process.env.REQUEST_NOTIFICATION_RUNTIME_REQUIRED === "1" && !databaseUrl) {
    throw new Error("Notification runtime verification requires a disposable database");
}
if (databaseUrl) {
    const url = new URL(databaseUrl);
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (databaseUrl.includes("xmuqsgfxuaaophxnwure") || (!local && process.env.REQUEST_NOTIFICATION_DISPOSABLE !== "1")) {
        throw new Error("Refusing notification fixtures outside an explicitly disposable database");
    }
}

(databaseUrl ? describe : describe.skip)("request notifications on a disposable database", () => {
    const db = new Pool({ connectionString: databaseUrl, max: 8 });
    const accounts = [randomUUID(), randomUUID(), randomUUID()];
    const requestId = randomUUID();
    const contentId = randomUUID();
    let baselineMissing = 0;

    async function asRole(sql: string, values: unknown[] = [], role: "service_role" | "anon" | "authenticated" = "service_role", claim = role) {
        const connection = await db.connect();
        try {
            await connection.query("BEGIN");
            await connection.query(`SET LOCAL ROLE ${role}`);
            await connection.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: claim })]);
            const result = await connection.query(sql, values);
            await connection.query("COMMIT");
            return result;
        } catch (error) {
            await connection.query("ROLLBACK");
            throw error;
        } finally {
            connection.release();
        }
    }
    const enqueue = () => asRole("SELECT public.queue_content_request_published_notifications($1) AS inserted", [requestId]);
    const missing = async () => Number((await asRole("SELECT public.count_missing_content_request_notifications() AS count")).rows[0].count);

    beforeAll(async () => {
        baselineMissing = await missing();
        for (const account of accounts) {
            await db.query(`INSERT INTO auth.users(id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
                VALUES($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'{}','{}',now(),now())`,
            [account, `notification-${account}@example.invalid`]);
        }
        await db.query("INSERT INTO public.content_item(id,type,title,status) VALUES($1,'article','Synthetic notification verification','verified')", [contentId]);
        await db.query(`INSERT INTO public.content_requests(id,title,normalized_title,submitted_by,status,published_content_id)
            VALUES($1,$2,$2,$3,'published',$4)`, [requestId, `Synthetic notification ${requestId}`, accounts[0], contentId]);
    });
    beforeEach(async () => {
        await db.query("DELETE FROM public.content_request_notifications WHERE request_id=$1", [requestId]);
        await db.query("DELETE FROM public.content_request_votes WHERE request_id=$1", [requestId]);
        for (const account of accounts.slice(0, 2)) {
            await db.query("INSERT INTO public.content_request_votes(user_id,request_id) VALUES($1,$2)", [account, requestId]);
        }
        await db.query("UPDATE public.content_requests SET status='published',published_content_id=$2 WHERE id=$1", [requestId, contentId]);
        for (const [index, account] of accounts.entries()) {
            await db.query(`INSERT INTO public.user_notification_preferences(user_id,request_published_email_enabled)
                VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET request_published_email_enabled=excluded.request_published_email_enabled`, [account, index !== 1]);
        }
    });
    afterAll(async () => {
        try {
            await db.query("DELETE FROM public.content_requests WHERE id=$1", [requestId]);
            await db.query("DELETE FROM auth.users WHERE id=ANY($1::uuid[])", [accounts]);
            await db.query("DELETE FROM public.content_item WHERE id=$1", [contentId]);
        } finally {
            await db.end();
        }
    });

    it("queues each interested account once and preserves opt-outs, tokens and completed rows", async () => {
        const preference = (await db.query("SELECT * FROM public.user_notification_preferences WHERE user_id=$1", [accounts[1]])).rows[0];
        expect(await missing()).toBe(baselineMissing + 1);
        expect((await enqueue()).rows[0].inserted).toBe(2);
        const first = (await db.query("SELECT id,user_id,type,status FROM public.content_request_notifications WHERE request_id=$1 ORDER BY user_id", [requestId])).rows;
        expect(first).toHaveLength(2);
        expect(first.every(row => row.type === "published" && row.status === "queued")).toBe(true);
        await db.query("UPDATE public.content_request_notifications SET status='sent' WHERE request_id=$1 AND user_id=$2", [requestId, accounts[0]]);
        expect((await enqueue()).rows[0].inserted).toBe(0);
        expect((await db.query("SELECT id FROM public.content_request_notifications WHERE request_id=$1 ORDER BY user_id", [requestId])).rows).toEqual(first.map(({ id }) => ({ id })));
        expect((await db.query("SELECT status FROM public.content_request_notifications WHERE request_id=$1 AND user_id=$2", [requestId, accounts[0]])).rows[0].status).toBe("sent");
        expect((await db.query("SELECT * FROM public.user_notification_preferences WHERE user_id=$1", [accounts[1]])).rows[0]).toEqual(preference);
        expect(await missing()).toBe(baselineMissing);
    });

    it("admits concurrent enqueues without duplicate recipients", async () => {
        const results = await Promise.all(Array.from({ length: 6 }, enqueue));
        expect(results.reduce((sum, result) => sum + result.rows[0].inserted, 0)).toBe(2);
        expect(Number((await db.query("SELECT count(*) FROM public.content_request_notifications WHERE request_id=$1", [requestId])).rows[0].count)).toBe(2);
    });

    it("denies browser roles and preserves the queue's service-session guard", async () => {
        for (const role of ["anon", "authenticated"] as const) {
            await expect(asRole("SELECT public.queue_content_request_published_notifications($1)", [requestId], role)).rejects.toMatchObject({ code: "42501" });
            await expect(asRole("SELECT public.count_missing_content_request_notifications()", [], role)).rejects.toMatchObject({ code: "42501" });
        }
        await expect(asRole("SELECT public.queue_content_request_published_notifications($1)", [requestId], "service_role", "authenticated")).rejects.toMatchObject({ code: "P0001" });
    });

    it("excludes opted-out, missing-email and non-published interests from the actionable missing count", async () => {
        await db.query("UPDATE public.profiles SET email=NULL WHERE id=$1", [accounts[2]]);
        await db.query("INSERT INTO public.content_request_votes(user_id,request_id) VALUES($1,$2)", [accounts[2], requestId]);
        expect(await missing()).toBe(baselineMissing + 1);
        await db.query("UPDATE public.content_requests SET status='pending' WHERE id=$1", [requestId]);
        expect(await missing()).toBe(baselineMissing);
    });
});
