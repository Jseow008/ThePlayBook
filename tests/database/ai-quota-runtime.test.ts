import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import { admitAiUsage } from "@/lib/server/ai-usage-quota";
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: vi.fn() }));

const databaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
if (process.env.AI_QUOTA_RUNTIME_REQUIRED === "1" && !databaseUrl) throw new Error("Disposable database required for AI quota proof");
const apiUrl = process.env.DB107_SUPABASE_URL;
const serviceKey = process.env.DB107_SUPABASE_SERVICE_ROLE_KEY;
if (process.env.AI_QUOTA_RUNTIME_REQUIRED === "1" && (!apiUrl || !serviceKey)) throw new Error("Disposable Data API required for AI quota proof");
const database = databaseUrl ? describe : describe.skip;

database("atomic AI admission on disposable PostgreSQL", () => {
    const db = new Pool({ connectionString: databaseUrl, max: 16 });
    const account = randomUUID();
    const other = randomUUID();
    async function admit(user = account, feature = "ask-library", limits = [20, 100, 300], role = "service_role") {
        const connection = await db.connect();
        try {
            await connection.query("BEGIN");
            // The role comes only from this fixture, never from application input.
            await connection.query(`SET LOCAL ROLE ${role}`);
            const result = await connection.query("SELECT public.admit_ai_usage($1,$2,$3,$4,$5) AS result", [user, feature, ...limits]);
            await connection.query("COMMIT");
            return result.rows[0].result;
        } catch (error) {
            await connection.query("ROLLBACK");
            throw error;
        } finally { connection.release(); }
    }
    async function seed(count: number, timestamp = "clock_timestamp()") {
        await db.query(`INSERT INTO public.ai_message_usage(user_id,feature,created_at)
            SELECT $1, 'ask-library', ${timestamp} FROM generate_series(1,$2)`, [account, count]);
    }
    async function used() {
        return Number((await db.query("SELECT count(*) FROM public.ai_message_usage WHERE user_id=$1", [account])).rows[0].count);
    }
    beforeAll(async () => {
        for (const id of [account, other]) await db.query(`INSERT INTO auth.users
            (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
            VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'{}','{}',now(),now())`, [id, `quota-${id}@example.invalid`]);
    });
    beforeEach(async () => { await db.query("DELETE FROM public.ai_message_usage WHERE user_id=ANY($1::uuid[])", [[account, other]]); });
    afterAll(async () => {
        await db.query("DELETE FROM auth.users WHERE id=ANY($1::uuid[])", [[account, other]]);
        await db.end();
    });
    (apiUrl && serviceKey ? it : it.skip)("runs the production adapter through the real service-role Data API", async () => {
        vi.mocked(getAdminClient).mockReturnValue(createClient(apiUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } }) as ReturnType<typeof getAdminClient>);
        await seed(19);
        const results = await Promise.all(Array.from({ length: 6 }, () => admitAiUsage(account, "ask-notes", new AbortController().signal)));
        expect(results.filter((result) => result.allowed)).toHaveLength(1);
        expect(results.filter((result) => !result.allowed)).toHaveLength(5);
        expect(await used()).toBe(20);
    });
    it("admits exactly one of twelve mixed-route requests for the last unit", async () => {
        await seed(19);
        const results = await Promise.all(Array.from({ length: 12 }, (_, i) => admit(account, ["ask-library", "ask-notes", "author-chat"][i % 3])));
        expect(results.filter((r) => r.allowed)).toHaveLength(1);
        expect(results.filter((r) => !r.allowed)).toHaveLength(11);
        expect(await used()).toBe(20);
        expect(results.filter((r) => !r.allowed).every((r) => r.blockedWindow === "day" && r.used === 20 && r.retryAfterMs > 0)).toBe(true);
    });
    it.each([[100, 5, 300, "week"], [100, 100, 5, "month"]])("enforces the %s/%s/%s window limits atomically", async (day, week, month, window) => {
        await seed(4);
        const results = await Promise.all(Array.from({ length: 8 }, () => admit(account, "ask-notes", [day as number, week as number, month as number])));
        expect(results.filter((r) => r.allowed)).toHaveLength(1);
        expect(results.filter((r) => !r.allowed).every((r) => r.blockedWindow === window)).toBe(true);
        expect(await used()).toBe(5);
    });
    it("keeps accounts independent and counts a trusted insertion committed while admission waits", async () => {
        await seed(19);
        const legacy = await db.connect();
        let waiting: ReturnType<typeof admit> | undefined;
        try {
            await legacy.query("BEGIN");
            await legacy.query("SET LOCAL ROLE service_role");
            await legacy.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: account, role: "service_role" })]);
            await legacy.query("INSERT INTO public.ai_message_usage(user_id,feature) VALUES ($1,'author-chat')", [account]);
            waiting = admit();
            expect((await admit(other)).allowed).toBe(true);
            await legacy.query("COMMIT");
            expect((await waiting).allowed).toBe(false);
            expect(await used()).toBe(20);
        } finally {
            await legacy.query("ROLLBACK"); legacy.release();
            await waiting?.catch(() => undefined);
        }
    });
    it("uses UTC day/Monday/month windows and ignores rows before each boundary", async () => {
        await seed(2, "(date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - interval '1 microsecond'");
        const result = await admit(account, "author-chat", [1, 100, 300]);
        expect(result.allowed).toBe(true);
        expect(result.windows[0].used).toBe(0);
        const boundaries = await db.query(`SELECT
            (date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC' AS day,
            (date_trunc('week', clock_timestamp() AT TIME ZONE 'UTC') + interval '7 days') AT TIME ZONE 'UTC' AS week,
            (date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC' AS month`);
        for (const state of result.windows) expect(new Date(state.resetAt).toISOString()).toBe(boundaries.rows[0][state.window].toISOString());
        expect((await admit(account, "author-chat", [1, 100, 300])).allowed).toBe(false);
    });
    it.each(["anon", "authenticated", "netflux_snapshot_worker"])("denies %s access to trusted admission", async (role) => {
        await expect(admit(account, "ask-notes", [999, 999, 999], role)).rejects.toMatchObject({ code: "42501" });
        expect(await used()).toBe(0);
    });
    it("rejects invalid limits and features without writing usage", async () => {
        await expect(admit(account, "ask-notes", [0, 100, 300])).rejects.toMatchObject({ code: "22023" });
        await expect(admit(account, "invented-feature")).rejects.toMatchObject({ code: "22023" });
        await expect(admit(randomUUID())).rejects.toMatchObject({ code: "23503" });
        expect(await used()).toBe(0);
    });
    it("rejects stale transaction snapshots", async () => {
        const connection = await db.connect();
        try {
            await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
            await connection.query("SET LOCAL ROLE service_role");
            await expect(connection.query("SELECT public.admit_ai_usage($1,'ask-notes',20,100,300)", [account])).rejects.toMatchObject({ code: "25001" });
        } finally { await connection.query("ROLLBACK"); connection.release(); }
        expect(await used()).toBe(0);
    });
    it("rolls back admission with its transaction and releases the lock", async () => {
        const connection = await db.connect();
        try {
            await connection.query("BEGIN");
            await connection.query("SET LOCAL ROLE service_role");
            await connection.query("SELECT public.admit_ai_usage($1,'ask-notes',1,100,300)", [account]);
        } finally { await connection.query("ROLLBACK"); connection.release(); }
        expect(await used()).toBe(0);
        expect((await admit(account, "ask-notes", [1, 100, 300])).allowed).toBe(true);
    });
});
