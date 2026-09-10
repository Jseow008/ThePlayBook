import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const databaseUrl = process.env.SNAPSHOT_ADMIN_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("DB-107 account-data snapshots on a disposable Supabase database", () => {
    const db = new Pool({ connectionString: databaseUrl, max: 2 });
    const accountA = randomUUID();
    const accountB = randomUUID();
    const contentA = randomUUID();
    const contentB = randomUUID();
    const snapshotKey = randomUUID();

    let createLibrarySnapshot: typeof import("@/lib/server/account-data-snapshots").createLibrarySnapshot;
    let getLibrarySnapshotPage: typeof import("@/lib/server/account-data-snapshots").getLibrarySnapshotPage;
    let resetLibraryForAccount: typeof import("@/lib/server/account-data-snapshots").resetLibraryForAccount;
    let resetAccountDataSnapshotPoolForTests: typeof import("@/lib/server/account-data-snapshots").resetAccountDataSnapshotPoolForTests;

    beforeAll(async () => {
        // Import after the CI-only URL is available so the server pool cannot
        // accidentally fall back to a linked or production database.
        ({ createLibrarySnapshot, getLibrarySnapshotPage, resetLibraryForAccount, resetAccountDataSnapshotPoolForTests } = await import("@/lib/server/account-data-snapshots"));
        await db.query(
            `INSERT INTO auth.users
                (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             VALUES
                ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $3, 'authenticated', 'authenticated', $4, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
            [accountA, `db107-a-${accountA}@example.invalid`, accountB, `db107-b-${accountB}@example.invalid`],
        );
        await db.query(
            `INSERT INTO public.content_item (id, type, title, status)
             VALUES ($1, 'article', 'DB-107 A', 'verified'), ($2, 'article', 'DB-107 B', 'verified')`,
            [contentA, contentB],
        );
        await db.query(
            `INSERT INTO public.user_library (user_id, content_id, is_bookmarked, progress)
             VALUES ($1, $2, true, '{"itemId":"fixture-a","isCompleted":false}'::jsonb), ($3, $4, true, NULL)`,
            [accountA, contentA, accountB, contentB],
        );
    });

    afterAll(async () => {
        await resetAccountDataSnapshotPoolForTests();
        await db.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[accountA, accountB]]).catch(() => undefined);
        await db.end();
    });

    it("recovers a lost ready response without creating a second snapshot", async () => {
        const first = await createLibrarySnapshot(accountA, snapshotKey);
        expect(first.state).toBe("ready");
        if (first.state !== "ready") return;

        // Simulates a network response lost after the copy transaction commits.
        const retry = await createLibrarySnapshot(accountA, snapshotKey);
        expect(retry).toEqual(first);
    });

    it("keeps a snapshot isolated and immutable across saves, removals, and a reset", async () => {
        const ready = await createLibrarySnapshot(accountA, snapshotKey);
        expect(ready.state).toBe("ready");
        if (ready.state !== "ready") return;

        await expect(getLibrarySnapshotPage(accountB, ready.manifest.snapshotId, 0, 200)).rejects.toMatchObject({ code: "NOT_FOUND" });

        // These source changes occur after the snapshot boundary while a
        // client could still be traversing pages; the persisted snapshot must
        // retain exactly its boundary state.
        await db.query("UPDATE public.user_library SET is_bookmarked = false WHERE user_id = $1 AND content_id = $2", [accountA, contentA]);
        await db.query("DELETE FROM public.user_library WHERE user_id = $1 AND content_id = $2", [accountA, contentA]);
        await resetLibraryForAccount(accountA);

        const page = await getLibrarySnapshotPage(accountA, ready.manifest.snapshotId, 0, 200);
        expect(page.records).toHaveLength(1);
        expect(page.records[0]?.contentId).toBe(contentA);
        expect(page.records[0]?.isBookmarked).toBe(true);
        const current = await db.query<{ reset_epoch: string; current_revision: string }>(
            "SELECT reset_epoch, current_revision FROM public.account_library_state WHERE user_id = $1",
            [accountA],
        );
        expect(Number(current.rows[0]?.reset_epoch)).toBeGreaterThanOrEqual(1);
        expect(Number(current.rows[0]?.current_revision)).toBeGreaterThan(ready.manifest.boundaryLibraryRevision);
    });

    it("settles a worker-terminated operation to its stable idempotency outcome", async () => {
        const interruptedKey = randomUUID();
        const interruptedSnapshot = randomUUID();
        const client = await db.connect();
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL ROLE netflux_snapshot_worker");
            await client.query("SELECT set_config('app.snapshot_account_id', $1, true)", [accountB]);
            await client.query(
                `INSERT INTO snapshot_private.account_data_snapshot_operations
                    (account_id, idempotency_key, request_fingerprint, collection_names, schema_version, snapshot_id, status, lease_expires_at)
                 VALUES ($1, $2, $3, ARRAY['user_library'], 1, $4, 'building', now() - interval '1 second')`,
                [accountB, interruptedKey, "e77f009786b9269d97558ddef296602fcc43d75fc08fc20bad3777c1ad96fe1b", interruptedSnapshot],
            );
            await client.query("COMMIT");
        } finally {
            client.release();
        }

        const recovered = await createLibrarySnapshot(accountB, interruptedKey);
        expect(recovered).toEqual({ state: "failed", snapshotId: interruptedSnapshot, code: "SNAPSHOT_WORKER_INTERRUPTED" });
        const operation = await db.query<{ status: string; failure_code: string }>(
            "SELECT status, failure_code FROM snapshot_private.account_data_snapshot_operations WHERE snapshot_id = $1",
            [interruptedSnapshot],
        );
        expect(operation.rows[0]).toMatchObject({ status: "aborted", failure_code: "SNAPSHOT_WORKER_INTERRUPTED" });
    });

    it("rejects a real account above the 1,000-record admission cap before copying payloads", async () => {
        await db.query(
            `WITH inserted_content AS (
                INSERT INTO public.content_item (id, type, title, status)
                SELECT gen_random_uuid(), 'article', 'DB-107 cap fixture ' || value, 'verified'
                FROM generate_series(1, 1000) AS value
                RETURNING id
            )
            INSERT INTO public.user_library (user_id, content_id, is_bookmarked)
            SELECT $1, id, false FROM inserted_content`,
            [accountB],
        );

        const result = await createLibrarySnapshot(accountB, randomUUID());
        expect(result).toMatchObject({ state: "failed", code: "SNAPSHOT_TOO_LARGE" });
        const copies = await db.query<{ count: string }>(
            `SELECT count(*) FROM snapshot_private.account_data_snapshot_records records
             JOIN snapshot_private.account_data_snapshots snapshots ON snapshots.id = records.snapshot_id
             WHERE snapshots.account_id = $1`,
            [accountB],
        );
        expect(Number(copies.rows[0]?.count)).toBe(0);
    });

    it("enforces the distributed four-worker creation admission limit", async () => {
        const holders = await Promise.all(Array.from({ length: 4 }, () => db.connect()));
        try {
            await Promise.all(holders.map((client, slot) => client.query("SELECT pg_advisory_lock($1, $2)", [91_007, slot])));
            const result = await createLibrarySnapshot(accountA, randomUUID());
            expect(result).toMatchObject({ state: "failed", code: "SNAPSHOT_BUSY" });
        } finally {
            await Promise.all(holders.map(async (client, slot) => {
                await client.query("SELECT pg_advisory_unlock($1, $2)", [91_007, slot]).catch(() => undefined);
                client.release();
            }));
        }
    });
});
