import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

const databaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
if (process.env.AI_SPEND_RUNTIME_REQUIRED === "1" && !databaseUrl) throw new Error("Disposable database required for AI spend proof");
const database = databaseUrl ? describe : describe.skip;
function uuid7(time = Date.now()) {
    const bytes = randomBytes(16);
    bytes.writeUIntBE(time, 0, 6);
    bytes[6] = (bytes[6] & 15) | 0x70;
    bytes[8] = (bytes[8] & 63) | 0x80;
    const hex = bytes.toString("hex");
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

database("atomic AI spending on disposable PostgreSQL", () => {
    const db = new Pool({ connectionString: databaseUrl, max: 16 });
    const guest = "a".repeat(64);
    let originalPolicy: Record<string, unknown>;
    async function rpc(sql: string, args: unknown[], role = "service_role") {
        const connection = await db.connect();
        try {
            await connection.query("BEGIN");
            await connection.query(`SET LOCAL ROLE ${role}`);
            const result = await connection.query(sql, args);
            await connection.query("COMMIT");
            return result.rows[0].result;
        } catch (error) { await connection.query("ROLLBACK"); throw error; }
        finally { connection.release(); }
    }
    const reserve = (id = uuid7(), cost: number | null = 100, key: string | null = null, role = "service_role", feature = "author-chat") =>
        rpc("SELECT public.reserve_ai_spend($1,$2,'google','test-model',$3,$4) AS result", [id,feature,cost,key], role);
    const record = (id: string, cost: number | null = 60, input: number | null = 12, output = 3, role = "service_role") =>
        rpc("SELECT public.record_ai_spend($1,$2,$3,$4) AS result", [id,input,output,cost], role);
    const total = async () => Number((await db.query("SELECT coalesce(sum(charged_microusd),0) AS n FROM private.ai_spend_daily_totals")).rows[0].n);
    async function clear() { await db.query("TRUNCATE private.ai_spend_operations,private.ai_spend_daily_totals,private.ai_spend_guest_daily_totals"); }
    beforeAll(async () => { originalPolicy = (await db.query("SELECT * FROM private.ai_spend_policy")).rows[0]; });
    beforeEach(async () => {
        await clear();
        await db.query("UPDATE private.ai_spend_policy SET enabled=true,daily_limit_microusd=1000,guest_daily_limit_microusd=500,guest_daily_requests=5");
    });
    afterAll(async () => {
        await clear();
        await db.query("UPDATE private.ai_spend_policy SET enabled=$1,daily_limit_microusd=$2,guest_daily_limit_microusd=$3,guest_daily_requests=$4", [originalPolicy.enabled,originalPolicy.daily_limit_microusd,originalPolicy.guest_daily_limit_microusd,originalPolicy.guest_daily_requests]);
        await db.end();
    });
    it("admits exactly one parallel reservation at the final global budget", async () => {
        await db.query("UPDATE private.ai_spend_policy SET daily_limit_microusd=100");
        const results = await Promise.all(Array.from({length:12}, (_,i) => reserve(uuid7(),100,null,"service_role",["ask-notes","ask-library","author-chat"][i%3])));
        expect(results.filter(r => r.allowed)).toHaveLength(1);
        expect(results.filter(r => r.reason === "global_budget" && r.retryAfterMs > 0)).toHaveLength(11);
        expect(await total()).toBe(100);
    });
    it("enforces shared guest cost cap and independent per-key quota without refunding attempts", async () => {
        await db.query("UPDATE private.ai_spend_policy SET guest_daily_limit_microusd=100,guest_daily_requests=1");
        const results = await Promise.all(Array.from({length:6}, () => reserve(uuid7(),100,guest)));
        const admitted = results.filter(r => r.allowed);
        expect(admitted).toHaveLength(1);
        expect(results.filter(r => r.reason === "guest_quota")).toHaveLength(5);
        await record(admitted[0].operationId,0);
        expect((await reserve(uuid7(),100,guest.toUpperCase())).reason).toBe("guest_quota");
        expect((await reserve(uuid7(),100,"b".repeat(64))).allowed).toBe(true);
        await db.query("UPDATE private.ai_spend_policy SET guest_daily_requests=5");
        expect((await reserve(uuid7(),1,"b".repeat(64))).reason).toBe("guest_budget");
        expect(Number((await db.query("SELECT sum(requests) n FROM private.ai_spend_guest_daily_totals")).rows[0].n)).toBe(2);
    });
    it("enforces the aggregate guest budget across rotating identities while retaining global capacity", async () => {
        await db.query("UPDATE private.ai_spend_policy SET guest_daily_limit_microusd=100");
        const results = await Promise.all(Array.from({length:8}, (_,i) => reserve(uuid7(),100,i.toString(16).repeat(64))));
        expect(results.filter(r => r.allowed)).toHaveLength(1);
        expect(results.filter(r => r.reason === "guest_budget")).toHaveLength(7);
        expect((await reserve(uuid7(),100)).allowed).toBe(true);
        expect(await total()).toBe(200);
        expect((await db.query("SELECT guest_charged_microusd FROM private.ai_spend_daily_totals")).rows[0].guest_charged_microusd).toBe("100");
    });
    it("kill switch stops reservations while existing calls settle", async () => {
        const id = uuid7(); await reserve(id);
        await db.query("UPDATE private.ai_spend_policy SET enabled=false");
        expect((await reserve()).reason).toBe("disabled");
        expect(await record(id)).toEqual({recorded:true});
        expect(await total()).toBe(60);
    });
    it("settles the original UTC admission day, only once, including the guest refund", async () => {
        const id = uuid7(); await reserve(id,100,guest);
        await db.query("UPDATE private.ai_spend_operations SET day=day-1; UPDATE private.ai_spend_daily_totals SET day=day-1; UPDATE private.ai_spend_guest_daily_totals SET day=day-1");
        await reserve(uuid7(),100,guest);
        await record(id,20); await record(id,20);
        const rows = (await db.query("SELECT charged_microusd FROM private.ai_spend_daily_totals ORDER BY day")).rows;
        expect(rows.map(r => Number(r.charged_microusd))).toEqual([20,100]);
        const guests = (await db.query("SELECT charged_microusd,requests FROM private.ai_spend_guest_daily_totals ORDER BY day")).rows;
        expect(guests.map(r => [Number(r.charged_microusd),r.requests])).toEqual([[20,1],[100,1]]);
        await expect(record(id,21)).rejects.toMatchObject({code:"22023"});
        await expect(record(id,20,13)).rejects.toMatchObject({code:"22023"});
        expect(await total()).toBe(120);
    });
    it("rejects duplicate dispatch before and after settlement", async () => {
        const id = uuid7();
        const results = await Promise.allSettled([reserve(id),reserve(id)]);
        expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
        expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
        await record(id); await expect(reserve(id)).rejects.toMatchObject({code:"22023"});
        expect(await total()).toBe(60);
    });
    it("charges measured overspend once and commits emergency disable", async () => {
        const id = uuid7(); await reserve(id,100,guest);
        expect(await record(id,101)).toEqual({recorded:false,reason:"reservation_exceeded"});
        expect(await record(id,101)).toEqual({recorded:false,reason:"reservation_exceeded"});
        expect((await reserve()).reason).toBe("disabled");
        expect(await total()).toBe(101);
        expect((await db.query("SELECT charged_microusd,guest_charged_microusd FROM private.ai_spend_daily_totals")).rows[0]).toEqual({charged_microusd:"101",guest_charged_microusd:"101"});
        expect((await db.query("SELECT charged_microusd FROM private.ai_spend_guest_daily_totals")).rows[0].charged_microusd).toBe("101");
        await db.query("UPDATE private.ai_spend_policy SET enabled=true,daily_limit_microusd=101");
        expect((await reserve(uuid7(),1)).reason).toBe("global_budget");
        expect((await db.query("SELECT cost_microusd FROM private.ai_spend_operations WHERE operation_id=$1",[id])).rows[0].cost_microusd).toBe("101");
        await expect(record(id,60)).rejects.toMatchObject({code:"22023"});
    });
    it("commits overspend beyond bigint capacity without losing the kill switch", async () => {
        const id = uuid7(); await reserve(id,100,guest);
        await db.query("UPDATE private.ai_spend_daily_totals SET charged_microusd=9223372036854775800,guest_charged_microusd=9223372036854775800; UPDATE private.ai_spend_guest_daily_totals SET charged_microusd=9223372036854775800");
        const expected = {recorded:false,reason:"reservation_exceeded"};
        expect(await record(id,1000)).toEqual(expected);
        expect(await record(id,1000)).toEqual(expected);
        expect((await db.query("SELECT charged_microusd,guest_charged_microusd FROM private.ai_spend_daily_totals")).rows[0]).toEqual({charged_microusd:"9223372036854776700",guest_charged_microusd:"9223372036854776700"});
        expect((await db.query("SELECT charged_microusd FROM private.ai_spend_guest_daily_totals")).rows[0].charged_microusd).toBe("9223372036854776700");
        expect((await reserve()).reason).toBe("disabled");
    });
    it.each(["anon","authenticated","netflux_snapshot_worker"])("denies %s RPC and private table access", async role => {
        await expect(reserve(uuid7(),100,null,role)).rejects.toMatchObject({code:"42501"});
        await expect(record(uuid7(),1,1,1,role)).rejects.toMatchObject({code:"42501"});
        await expect(rpc("SELECT * FROM private.ai_spend_operations",[],role)).rejects.toMatchObject({code:"42501"});
    });
    it("rejects invalid inputs and stale replay UUIDs without accounting changes", async () => {
        for (const cost of [null,0,-1,100000001,Number.MAX_SAFE_INTEGER]) await expect(reserve(uuid7(),cost)).rejects.toMatchObject({code:"22023"});
        for (const key of ["x", "g".repeat(64), "a".repeat(65)]) await expect(reserve(uuid7(),1,key)).rejects.toMatchObject({code:"22023"});
        for (const id of [randomUUID(),uuid7(Date.now()-601000),uuid7(Date.now()+60000)]) await expect(reserve(id)).rejects.toMatchObject({code:"22023"});
        await expect(reserve(uuid7(),1,guest,"service_role","ask-notes")).rejects.toMatchObject({code:"22023"});
        await expect(reserve(uuid7(),1,null,"service_role","unknown")).rejects.toMatchObject({code:"22023"});
        const id = uuid7(); await reserve(id);
        for (const cost of [null,-1,1000000000001]) await expect(record(id,cost)).rejects.toMatchObject({code:"22023"});
        await expect(record(id,1,null)).rejects.toMatchObject({code:"22023"});
        await expect(record(id,1,1000000001)).rejects.toMatchObject({code:"22023"});
        await expect(record(uuid7())).rejects.toMatchObject({code:"22023"});
        await expect(db.query("UPDATE private.ai_spend_policy SET daily_limit_microusd=9223372036854775807")).rejects.toMatchObject({code:"23514"});
        expect(await total()).toBe(100);
    });
    it("rolls back errors atomically and rejects stale transaction isolation", async () => {
        const connection = await db.connect();
        try {
            await connection.query("BEGIN");
            await connection.query("SET LOCAL ROLE service_role");
            await connection.query("SELECT public.reserve_ai_spend($1,'ask-notes','google','test',100,NULL)",[uuid7()]);
            await expect(connection.query("SELECT 1/0")).rejects.toMatchObject({code:"22012"});
            await connection.query("ROLLBACK");
            expect(await total()).toBe(0);
            await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
            await connection.query("SET LOCAL ROLE service_role");
            await expect(connection.query("SELECT public.reserve_ai_spend($1,'ask-notes','google','test',100,NULL)",[uuid7()])).rejects.toMatchObject({code:"25001"});
        } finally { await connection.query("ROLLBACK"); connection.release(); }
        expect((await reserve()).allowed).toBe(true);
    });
    it("keeps access checks sensitive to accidental RPC grants and RLS removal", async () => {
        const checker = readFileSync("scripts/security-function-acl-check.sql", "utf8");
        // Match the CLI extended-query protocol: multiple top-level statements must fail.
        await db.query({ name: "ai-spend-acl-proof", text: checker });
        for (const mutation of [
            "GRANT EXECUTE ON FUNCTION public.reserve_ai_spend(uuid,text,text,text,bigint,text) TO anon",
            "ALTER FUNCTION public.record_ai_spend(uuid,bigint,bigint,bigint) SECURITY DEFINER",
            "ALTER TABLE private.ai_spend_operations DISABLE ROW LEVEL SECURITY",
        ]) {
            const connection = await db.connect();
            try {
                await connection.query("BEGIN");
                await connection.query(mutation);
                await expect(connection.query({ name: "ai-spend-acl-proof", text: checker })).rejects.toThrow();
            } finally { await connection.query("ROLLBACK"); connection.release(); }
        }
    });
    it("prunes old guest metadata without touching current or prior-day active reservations", async () => {
        const id = uuid7(); await reserve(id,100,guest);
        await db.query("UPDATE private.ai_spend_operations SET day=day-36; UPDATE private.ai_spend_guest_daily_totals SET day=day-36");
        const yesterday = uuid7(); await reserve(yesterday);
        await db.query("UPDATE private.ai_spend_operations SET day=day-1 WHERE operation_id=$1",[yesterday]);
        const today = uuid7(); await reserve(today);
        await db.query("SELECT private.ai_spend_prune_old_spend()");
        expect((await db.query("SELECT operation_id FROM private.ai_spend_operations")).rows.map(r => r.operation_id).sort()).toEqual([yesterday,today].sort());
        expect((await db.query("SELECT count(*) FROM private.ai_spend_guest_daily_totals")).rows[0].count).toBe("0");
        expect(await total()).toBe(300);
    });
});
