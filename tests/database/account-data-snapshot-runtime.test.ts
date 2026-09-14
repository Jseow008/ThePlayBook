import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const adminDatabaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
const workerDatabaseUrl = process.env.SNAPSHOT_WORKER_DATABASE_URL;
const describeDatabase = adminDatabaseUrl && workerDatabaseUrl ? describe : describe.skip;

describeDatabase("DB-107 account-data snapshots on a disposable Supabase database", () => {
    const db = new Pool({ connectionString: adminDatabaseUrl, max: 2 });
    const workerDb = new Pool({ connectionString: workerDatabaseUrl, max: 2 });
    const accountA = randomUUID();
    const accountB = randomUUID();
    const accountC = randomUUID();
    const accountD = randomUUID();
    const contentA = randomUUID();
    const snapshotKey = randomUUID();

    let createLibrarySnapshot: typeof import("@/lib/server/account-data-snapshots").createLibrarySnapshot;
    let getLibrarySnapshotPage: typeof import("@/lib/server/account-data-snapshots").getLibrarySnapshotPage;
    let getLiveLibraryPage: typeof import("@/lib/server/account-data-snapshots").getLiveLibraryPage;
    let resetLibraryForAccount: typeof import("@/lib/server/account-data-snapshots").resetLibraryForAccount;
    let resetAccountDataSnapshotPoolForTests: typeof import("@/lib/server/account-data-snapshots").resetAccountDataSnapshotPoolForTests;

    beforeAll(async () => {
        // Import after the CI-only URL is available so the server pool cannot
        // accidentally fall back to a linked or production database.
        ({ createLibrarySnapshot, getLibrarySnapshotPage, getLiveLibraryPage, resetLibraryForAccount, resetAccountDataSnapshotPoolForTests } = await import("@/lib/server/account-data-snapshots"));
        await db.query(
            `INSERT INTO auth.users
                (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             VALUES
                ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $3, 'authenticated', 'authenticated', $4, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $5, 'authenticated', 'authenticated', $6, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $7, 'authenticated', 'authenticated', $8, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
            [accountA, `db107-a-${accountA}@example.invalid`, accountB, `db107-b-${accountB}@example.invalid`, accountC, `db107-c-${accountC}@example.invalid`, accountD, `db107-d-${accountD}@example.invalid`],
        );
        await db.query(
            `INSERT INTO public.content_item (id, type, title, status)
             VALUES ($1, 'article', 'DB-107 A', 'verified')`,
            [contentA],
        );
        await db.query(
            `INSERT INTO public.user_library (user_id, content_id, is_bookmarked, progress)
             VALUES ($1, $2, true, '{"itemId":"fixture-a","isCompleted":false}'::jsonb)`,
            [accountA, contentA],
        );
    });

    afterAll(async () => {
        await resetAccountDataSnapshotPoolForTests();
        await db.query("DELETE FROM auth.users WHERE id = ANY($1::uuid[])", [[accountA, accountB, accountC, accountD]]).catch(() => undefined);
        await workerDb.end();
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

    it("connects directly as the restricted worker and remains account-scoped", async () => {
        const identity = await workerDb.query<{ current_user: string; rolbypassrls: boolean }>(
            "SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user",
        );
        expect(identity.rows[0]).toEqual({ current_user: "netflux_snapshot_worker", rolbypassrls: false });
        await workerDb.query("SELECT set_config('app.snapshot_account_id', $1, false)", [accountA]);
        const rows = await workerDb.query<{ user_id: string }>("SELECT user_id FROM public.user_library");
        expect(rows.rows).toEqual([{ user_id: accountA }]);
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
        expect(page.records[0]?.content_id).toBe(contentA);
        expect(page.records[0]?.is_bookmarked).toBe(true);
        const current = await db.query<{ reset_epoch: string; current_revision: string }>(
            "SELECT reset_epoch, current_revision FROM public.account_library_state WHERE user_id = $1",
            [accountA],
        );
        expect(Number(current.rows[0]?.reset_epoch)).toBeGreaterThanOrEqual(1);
        expect(Number(current.rows[0]?.current_revision)).toBeGreaterThan(ready.manifest.boundaryLibraryRevision);
    });

    it("returns the authoritative reset epoch and revision from an authenticated mutation", async () => {
        const client = await db.connect();
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL ROLE authenticated");
            await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [accountA]);
            const acknowledgement = await client.query<{ reset_epoch: string; library_revision: string }>(
                `SELECT * FROM public.apply_user_library_mutation(
                    $1, true, NULL, now(), false
                )`,
                [contentA],
            );
            await client.query("COMMIT");
            const current = await db.query<{ reset_epoch: string; current_revision: string }>(
                "SELECT reset_epoch, current_revision FROM public.account_library_state WHERE user_id = $1",
                [accountA],
            );
            expect(acknowledgement.rows[0]).toEqual({
                reset_epoch: current.rows[0]?.reset_epoch,
                library_revision: current.rows[0]?.current_revision,
            });
        } finally {
            await client.query("ROLLBACK").catch(() => undefined);
            client.release();
        }
    });

    it("settles a worker-terminated operation to its stable idempotency outcome", async () => {
        const interruptedKey = randomUUID();
        const interruptedSnapshot = randomUUID();
        const client = await workerDb.connect();
        try {
            await client.query("BEGIN");
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

    it("does not abort an expired lease while its account worker lock remains active", async () => {
        const activeKey = randomUUID();
        const activeSnapshot = randomUUID();
        const client = await workerDb.connect();
        try {
            await client.query("BEGIN");
            await client.query("SELECT set_config('app.snapshot_account_id', $1, true)", [accountA]);
            await client.query(
                `INSERT INTO snapshot_private.account_data_snapshot_operations
                    (account_id, idempotency_key, request_fingerprint, collection_names, schema_version, snapshot_id, status, lease_expires_at)
                 VALUES ($1, $2, $3, ARRAY['user_library'], 1, $4, 'building', now() - interval '1 second')`,
                [accountA, activeKey, "e77f009786b9269d97558ddef296602fcc43d75fc08fc20bad3777c1ad96fe1b", activeSnapshot],
            );
            await client.query("COMMIT");
        } finally {
            client.release();
        }

        const lockHolder = await db.connect();
        try {
            await lockHolder.query("SELECT pg_advisory_lock(hashtext($1))", [`account-data:${accountA}`]);
            await expect(createLibrarySnapshot(accountA, activeKey)).resolves.toEqual({ state: "building", snapshotId: activeSnapshot });
        } finally {
            await lockHolder.query("SELECT pg_advisory_unlock(hashtext($1))", [`account-data:${accountA}`]);
            lockHolder.release();
        }

        await expect(createLibrarySnapshot(accountA, activeKey)).resolves.toEqual({
            state: "failed",
            snapshotId: activeSnapshot,
            code: "SNAPSHOT_WORKER_INTERRUPTED",
        });
    });

    it("preserves microsecond timestamp ties in live keyset traversal", async () => {
        const contentIds = [randomUUID(), randomUUID(), randomUUID()].sort();
        try {
            await db.query("ALTER TABLE public.user_library DISABLE TRIGGER assign_user_library_revision");
            await db.query(
                `INSERT INTO public.content_item (id, type, title, status)
                 SELECT value::uuid, 'article', 'DB-107 microsecond fixture', 'verified'
                 FROM unnest($1::text[]) AS value`,
                [contentIds],
            );
            await db.query(
                `INSERT INTO public.user_library
                    (user_id, content_id, is_bookmarked, library_updated_at, library_revision)
                 SELECT $1, value::uuid, true, '2026-09-14 09:00:00.123456+00'::timestamptz, 1
                 FROM unnest($2::text[]) AS value`,
                [accountD, contentIds],
            );
        } finally {
            await db.query("ALTER TABLE public.user_library ENABLE TRIGGER assign_user_library_revision");
        }

        const seen: string[] = [];
        let after: { updatedAt: string; contentId: string } | null = null;
        do {
            const page = await getLiveLibraryPage(accountD, after, 1);
            const row = page.rows[0];
            if (!row) break;
            expect(row.library_updated_at).toContain(".123456");
            seen.push(row.content_id);
            after = { updatedAt: row.library_updated_at, contentId: row.content_id };
            if (!page.hasNextPage) break;
        } while (true);

        expect(seen).toEqual(contentIds);
    });

    it("traverses 1,201 real records exactly once through persisted snapshot pages", async () => {
        await db.query(
            `WITH inserted_content AS (
                INSERT INTO public.content_item (id, type, title, status)
                SELECT gen_random_uuid(), 'article', 'DB-107 traversal fixture ' || value, 'verified'
                FROM generate_series(1, 1201) AS value
                RETURNING id
            )
            INSERT INTO public.user_library (user_id, content_id, is_bookmarked)
            SELECT $1, id, false FROM inserted_content`,
            [accountB],
        );

        const result = await createLibrarySnapshot(accountB, randomUUID());
        expect(result.state).toBe("ready");
        if (result.state !== "ready") return;
        const records = [] as Awaited<ReturnType<typeof getLibrarySnapshotPage>>["records"];
        let afterOrdinal = 0;
        do {
            const page = await getLibrarySnapshotPage(accountB, result.manifest.snapshotId, afterOrdinal, 200);
            records.push(...page.records);
            afterOrdinal = page.records.at(-1)?.ordinal ?? afterOrdinal;
            if (!page.hasNextPage) break;
        } while (true);
        expect(records).toHaveLength(1201);
        expect(new Set(records.map((record) => record.content_id)).size).toBe(1201);
        expect(records.map((record) => record.ordinal)).toEqual(Array.from({ length: 1201 }, (_, index) => index + 1));
    });

    it("rejects a real account above the 10,000-record admission cap before copying payloads", async () => {
        await db.query(
            `WITH inserted_content AS (
                INSERT INTO public.content_item (id, type, title, status)
                SELECT gen_random_uuid(), 'article', 'DB-107 cap fixture ' || value, 'verified'
                FROM generate_series(1, 10001) AS value
                RETURNING id
            )
            INSERT INTO public.user_library (user_id, content_id, is_bookmarked)
            SELECT $1, id, false FROM inserted_content`,
            [accountC],
        );

        const result = await createLibrarySnapshot(accountC, randomUUID());
        expect(result).toMatchObject({ state: "failed", code: "SNAPSHOT_TOO_LARGE" });
        const copies = await db.query<{ count: string }>(
            `SELECT count(*) FROM snapshot_private.account_data_snapshot_records records
             JOIN snapshot_private.account_data_snapshots snapshots ON snapshots.id = records.snapshot_id
             WHERE snapshots.account_id = $1`,
            [accountC],
        );
        expect(Number(copies.rows[0]?.count)).toBe(0);
    });

    it("enforces the distributed four-worker creation admission limit", async () => {
        const lockPool = new Pool({ connectionString: adminDatabaseUrl, max: 4 });
        const holders = await Promise.all(Array.from({ length: 4 }, () => lockPool.connect()));
        try {
            await Promise.all(holders.map((client, slot) => client.query("SELECT pg_advisory_lock($1, $2)", [91_007, slot])));
            const result = await createLibrarySnapshot(accountA, randomUUID());
            expect(result).toMatchObject({ state: "failed", code: "SNAPSHOT_BUSY" });
        } finally {
            await Promise.all(holders.map(async (client, slot) => {
                await client.query("SELECT pg_advisory_unlock($1, $2)", [91_007, slot]).catch(() => undefined);
                client.release();
            }));
            await lockPool.end();
        }
    });
});
