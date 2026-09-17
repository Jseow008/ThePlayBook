import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AccountDataSnapshotCollection } from "@/lib/account-data-snapshot-collections";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";

const adminDatabaseUrl = process.env.DB107_ADMIN_DATABASE_URL;
const workerDatabaseUrl = process.env.SNAPSHOT_WORKER_DATABASE_URL;
const supabaseApiUrl = process.env.DB107_SUPABASE_URL;
const supabaseAnonKey = process.env.DB107_SUPABASE_ANON_KEY;
const describeDatabase = adminDatabaseUrl && workerDatabaseUrl ? describe : describe.skip;
const itWithAuthRuntime = supabaseApiUrl && supabaseAnonKey ? it : it.skip;

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describeDatabase("DB-107 account-data snapshots on a disposable Supabase database", () => {
    const db = new Pool({ connectionString: adminDatabaseUrl, max: 2 });
    const workerDb = new Pool({ connectionString: workerDatabaseUrl, max: 2 });
    const accountA = randomUUID();
    const accountB = randomUUID();
    const accountC = randomUUID();
    const accountD = randomUUID();
    const accountExport = randomUUID();
    const accountCrossCollectionExport = randomUUID();
    const contentA = randomUUID();
    const contentExport = randomUUID();
    const crossCollectionContentIds = Array.from({ length: 201 }, () => randomUUID());
    const crossCollectionAddedLibraryContentId = randomUUID();
    const crossCollectionAddedReflectionContentId = randomUUID();
    const requestExport = randomUUID();
    const segmentExport = randomUUID();
    const snapshotKey = randomUUID();

    let createLibrarySnapshot: typeof import("@/lib/server/account-data-snapshots").createLibrarySnapshot;
    let createAccountDataSnapshot: typeof import("@/lib/server/account-data-snapshots").createAccountDataSnapshot;
    let getAccountDataSnapshotManifest: typeof import("@/lib/server/account-data-snapshots").getAccountDataSnapshotManifest;
    let getAccountDataSnapshotPage: typeof import("@/lib/server/account-data-snapshots").getAccountDataSnapshotPage;
    let getLibrarySnapshotPage: typeof import("@/lib/server/account-data-snapshots").getLibrarySnapshotPage;
    let getLiveLibraryPage: typeof import("@/lib/server/account-data-snapshots").getLiveLibraryPage;
    let commitLibraryMutationForAccount: typeof import("@/lib/server/account-data-snapshots").commitLibraryMutationForAccount;
    let resetLibraryForAccount: typeof import("@/lib/server/account-data-snapshots").resetLibraryForAccount;
    let resetAccountDataSnapshotPoolForTests: typeof import("@/lib/server/account-data-snapshots").resetAccountDataSnapshotPoolForTests;

    beforeAll(async () => {
        // Import after the CI-only URL is available so the server pool cannot
        // accidentally fall back to a linked or production database.
        ({ createLibrarySnapshot, createAccountDataSnapshot, getAccountDataSnapshotManifest, getAccountDataSnapshotPage, getLibrarySnapshotPage, getLiveLibraryPage, commitLibraryMutationForAccount, resetLibraryForAccount, resetAccountDataSnapshotPoolForTests } = await import("@/lib/server/account-data-snapshots"));
        await db.query(
            `INSERT INTO auth.users
                (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             VALUES
                ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $3, 'authenticated', 'authenticated', $4, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $5, 'authenticated', 'authenticated', $6, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $7, 'authenticated', 'authenticated', $8, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
                ('00000000-0000-0000-0000-000000000000', $9, 'authenticated', 'authenticated', $10, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
            [accountA, `db107-a-${accountA}@example.invalid`, accountB, `db107-b-${accountB}@example.invalid`, accountC, `db107-c-${accountC}@example.invalid`, accountD, `db107-d-${accountD}@example.invalid`, accountExport, `db107-export-${accountExport}@example.invalid`],
        );
        await db.query(
            `INSERT INTO public.content_item (id, type, title, status)
             VALUES ($1, 'article', 'DB-107 A', 'verified')`,
            [contentA],
        );
        await db.query(
            `INSERT INTO public.content_item (id, type, title, status)
             VALUES ($1, 'article', 'DB-107 export', 'verified')`,
            [contentExport],
        );
        await db.query(
            `INSERT INTO public.user_library (user_id, content_id, is_bookmarked, progress)
             VALUES ($1, $2, true, '{"itemId":"fixture-a","isCompleted":false}'::jsonb)`,
            [accountA, contentA],
        );

        await db.query(
            `INSERT INTO public.profiles (id, email, onboarding_state, reader_settings)
             VALUES ($1, $2, '{"completed":true}'::jsonb, '{"fontSize":"large"}'::jsonb)
             ON CONFLICT (id) DO UPDATE
             SET onboarding_state = EXCLUDED.onboarding_state, reader_settings = EXCLUDED.reader_settings`,
            [accountExport, `db107-export-${accountExport}@example.invalid`],
        );
        await db.query(
            `INSERT INTO public.segment (id, item_id, order_index, markdown_body)
             VALUES ($1, $2, 1, 'Export fixture segment')`,
            [segmentExport, contentExport],
        );
        await db.query(
            `INSERT INTO public.user_library (user_id, content_id, is_bookmarked, progress)
             VALUES ($1, $2, true, '{"itemId":"export","isCompleted":true}'::jsonb)`,
            [accountExport, contentExport],
        );
        await db.query(
            `INSERT INTO public.user_highlights
                (user_id, content_item_id, segment_id, highlighted_text, note_body, color, anchor_start, anchor_end)
             VALUES ($1, $2, $3, 'Export highlight', 'Export note', 'blue', 3, 19)`,
            [accountExport, contentExport, segmentExport],
        );
        await db.query(
            `INSERT INTO public.user_reflections (user_id, content_item_id, prompt, reflection_text)
             VALUES ($1, $2, 'What changed?', 'The complete-export reflection fixture.')`,
            [accountExport, contentExport],
        );
        await db.query(
            `INSERT INTO public.reading_activity (user_id, activity_date, duration_seconds, pages_read)
             VALUES ($1, '2026-09-15', 42, 3)`,
            [accountExport],
        );
        await db.query(
            `INSERT INTO public.content_feedback (user_id, content_id, is_positive, reason, details)
             VALUES ($1, $2, true, 'useful', 'Complete-export fixture')`,
            [accountExport, contentExport],
        );
        await db.query(
            `INSERT INTO public.content_requests
                (id, title, normalized_title, content_type, submitted_by, status)
             VALUES ($1, 'Export request', 'export request', 'book', $2, 'pending')`,
            [requestExport, accountExport],
        );
        await db.query(
            `INSERT INTO public.content_request_votes (user_id, request_id)
             VALUES ($1, $2)`,
            [accountExport, requestExport],
        );
        await db.query(
            `INSERT INTO public.user_notification_preferences
                (user_id, request_published_email_enabled, unsubscribe_token)
             VALUES ($1, false, 'db107-export-private-unsubscribe-token-000000000000000000000000')`,
            [accountExport],
        );
        await db.query(
            `INSERT INTO public.content_request_notifications
                (request_id, user_id, type, status, provider_message_id, last_error)
             VALUES ($1, $2, 'published', 'sent', 'provider-private-id', 'private operational error')`,
            [requestExport, accountExport],
        );
        await db.query(
            `INSERT INTO public.ai_message_usage (user_id, feature)
             VALUES ($1, 'ask-library')`,
            [accountExport],
        );
    });

    afterAll(async () => {
        await resetAccountDataSnapshotPoolForTests();
        await db.query("DELETE FROM public.content_requests WHERE id = $1", [requestExport]).catch(() => undefined);
        await db.query(
            "DELETE FROM public.content_item WHERE id = ANY($1::uuid[])",
            [[
                contentA,
                contentExport,
                ...crossCollectionContentIds,
                crossCollectionAddedLibraryContentId,
                crossCollectionAddedReflectionContentId,
            ]],
        ).catch(() => undefined);
        await db.query(
            "DELETE FROM auth.users WHERE id = ANY($1::uuid[])",
            [[accountA, accountB, accountC, accountD, accountExport, accountCrossCollectionExport]],
        ).catch(() => undefined);
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

    it("returns an explicit terminal outcome for an expired successful operation", async () => {
        const expiredKey = randomUUID();
        const expiredOperation = randomUUID();
        const expiredSnapshot = randomUUID();
        const client = await workerDb.connect();
        try {
            await client.query("BEGIN");
            await client.query("SELECT set_config('app.snapshot_account_id', $1, true)", [accountD]);
            await client.query(
                `INSERT INTO snapshot_private.account_data_snapshot_operations
                    (id, account_id, idempotency_key, request_fingerprint, collection_names, schema_version, snapshot_id, status)
                 VALUES ($1, $2, $3, $4, ARRAY['user_library'], 2, $5, 'ready')`,
                [expiredOperation, accountD, expiredKey, "98692345147acfc80c5cc4ff030f6584620e93fc6b5b4bdde1ac88d265c5be62", expiredSnapshot],
            );
            await client.query(
                `INSERT INTO snapshot_private.account_data_snapshots
                    (id, operation_id, account_id, collection_names, schema_version, reset_epoch, boundary_library_revision, status, expires_at)
                 VALUES ($1, $2, $3, ARRAY['user_library'], 2, 0, 0, 'ready', now() - interval '1 second')`,
                [expiredSnapshot, expiredOperation, accountD],
            );
            await client.query("COMMIT");
        } finally {
            await client.query("ROLLBACK").catch(() => undefined);
            client.release();
        }

        await expect(createLibrarySnapshot(accountD, expiredKey)).resolves.toEqual({
            state: "failed",
            snapshotId: expiredSnapshot,
            code: "SNAPSHOT_EXPIRED",
        });
    });

    it("connects directly as the restricted worker and remains account-scoped", async () => {
        const identity = await workerDb.query<{ current_user: string; rolbypassrls: boolean }>(
            "SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user",
        );
        expect(identity.rows[0]).toEqual({ current_user: "netflux_snapshot_worker", rolbypassrls: false });
        await workerDb.query("SELECT set_config('app.snapshot_account_id', $1, false)", [accountA]);
        const rows = await workerDb.query<{ user_id: string }>("SELECT user_id FROM public.user_library");
        expect(rows.rows).toEqual([{ user_id: accountA }]);

        await workerDb.query("BEGIN");
        try {
            await workerDb.query("SELECT set_config('app.snapshot_account_id', $1, true)", [accountA]);
            const ownWrite = await workerDb.query(
                "UPDATE public.user_library SET is_bookmarked = false WHERE user_id = $1 AND content_id = $2",
                [accountA, contentA],
            );
            expect(ownWrite.rowCount).toBe(1);
            await expect(workerDb.query(
                "INSERT INTO public.user_library (user_id, content_id, is_bookmarked) VALUES ($1, $2, true)",
                [accountB, contentA],
            )).rejects.toMatchObject({ code: "42501" });
        } finally {
            await workerDb.query("ROLLBACK");
        }
    });

    it("exports every approved owned-data collection exactly once without private operational fields", async () => {
        const { ACCOUNT_DATA_EXPORT_COLLECTIONS } = await import("@/lib/account-data-snapshot-collections");
        const result = await createAccountDataSnapshot(accountExport, randomUUID(), ACCOUNT_DATA_EXPORT_COLLECTIONS);
        expect(result.state).toBe("ready");
        if (result.state !== "ready") return;

        expect(Object.keys(result.manifest.collectionManifests ?? {}).sort()).toEqual([...ACCOUNT_DATA_EXPORT_COLLECTIONS].sort());
        expect(result.manifest.recordCount).toBe(11);

        const recordsByCollection = new Map<string, Array<{ recordId: string; payload: Record<string, unknown> }>>();
        for (const collection of ACCOUNT_DATA_EXPORT_COLLECTIONS) {
            const page = await getAccountDataSnapshotPage(accountExport, result.manifest.snapshotId, collection, 0, 200);
            const expected = result.manifest.collectionManifests?.[collection];
            expect(page.records).toHaveLength(expected?.recordCount ?? -1);
            expect(new Set(page.records.map((record) => record.recordId)).size).toBe(page.records.length);
            expect(page.records.map((record) => record.ordinal)).toEqual(page.records.map((_, index) => index + 1));
            recordsByCollection.set(collection, page.records);
        }

        expect(recordsByCollection.get("reflections")?.[0]?.payload).toMatchObject({
            prompt: "What changed?",
            reflection_text: "The complete-export reflection fixture.",
        });
        expect(recordsByCollection.get("preferences")?.[0]?.payload).toMatchObject({
            onboarding_state: { completed: true },
            reader_settings: { fontSize: "large" },
        });
        expect(recordsByCollection.get("preferences")?.[0]?.payload).not.toHaveProperty("role");
        expect(recordsByCollection.get("preferences")?.[0]?.payload).not.toHaveProperty("is_internal");
        expect(recordsByCollection.get("notification_preferences")?.[0]?.payload).not.toHaveProperty("unsubscribe_token");
        expect(recordsByCollection.get("request_notifications")?.[0]?.payload).not.toHaveProperty("provider_message_id");
        expect(recordsByCollection.get("request_notifications")?.[0]?.payload).not.toHaveProperty("last_error");
        expect(recordsByCollection.get("submitted_requests")?.[0]?.payload).not.toHaveProperty("normalized_title");
    });

    it("allows a complete export to resume only in its creating session and invalidates it after reset", async () => {
        const { ACCOUNT_DATA_EXPORT_COLLECTIONS } = await import("@/lib/account-data-snapshot-collections");
        const creatingSession = randomUUID();
        const otherSession = randomUUID();
        const result = await createAccountDataSnapshot(
            accountC,
            randomUUID(),
            ACCOUNT_DATA_EXPORT_COLLECTIONS,
            { resumeSessionId: creatingSession },
        );
        expect(result.state).toBe("ready");
        if (result.state !== "ready") return;

        await expect(getAccountDataSnapshotManifest(accountC, result.manifest.snapshotId, creatingSession)).resolves.toMatchObject({
            snapshotId: result.manifest.snapshotId,
        });
        await expect(getAccountDataSnapshotManifest(accountC, result.manifest.snapshotId, otherSession)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(getAccountDataSnapshotManifest(accountB, result.manifest.snapshotId, creatingSession)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(getAccountDataSnapshotPage(accountC, result.manifest.snapshotId, "user_library", 0, 200, otherSession)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(getAccountDataSnapshotPage(accountB, result.manifest.snapshotId, "user_library", 0, 200, creatingSession)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await resetLibraryForAccount(accountC);
        await expect(getAccountDataSnapshotManifest(accountC, result.manifest.snapshotId, creatingSession)).rejects.toMatchObject({ code: "INVALIDATED" });
        await expect(getAccountDataSnapshotPage(accountC, result.manifest.snapshotId, "user_library", 0, 200, creatingSession)).rejects.toMatchObject({ code: "INVALIDATED" });
    });

    itWithAuthRuntime("rejects a revoked Supabase Auth session before a snapshot page can be authorized", async () => {
        const email = `db107-revoked-${randomUUID()}@example.invalid`;
        const password = "db107-disposable-auth-fixture";
        const sessionClient = createSupabaseClient(supabaseApiUrl!, supabaseAnonKey!, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        let userId: string | null = null;
        try {
            const signedUp = await sessionClient.auth.signUp({ email, password });
            expect(signedUp.error).toBeNull();
            userId = signedUp.data.user?.id ?? null;
            const session = signedUp.data.session;
            expect(session).not.toBeNull();
            if (!session || !userId) return;

            const staleSessionClient = createSupabaseClient(supabaseApiUrl!, supabaseAnonKey!, {
                auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            });
            await staleSessionClient.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
            });
            const revokingClient = createSupabaseClient(supabaseApiUrl!, supabaseAnonKey!, {
                auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            });
            await revokingClient.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
            });
            const revoked = await revokingClient.auth.signOut({ scope: "global" });
            expect(revoked.error).toBeNull();

            const rejectedByAuth = await staleSessionClient.auth.getUser();
            expect(rejectedByAuth.data.user).toBeNull();
            expect(rejectedByAuth.error).not.toBeNull();

            (createServerSupabaseClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ auth: staleSessionClient.auth });
            await expect(getVerifiedAccountDataSession()).resolves.toBeNull();
            const { GET } = await import("@/app/api/account-data/snapshots/[snapshotId]/[collection]/route");
            const { NextRequest } = await import("next/server");
            const response = await GET(
                new NextRequest("http://localhost/api/account-data/snapshots/00000000-0000-4000-8000-000000000021/user_library"),
                { params: Promise.resolve({ snapshotId: "00000000-0000-4000-8000-000000000021", collection: "user_library" }) },
            );
            expect(response.status).toBe(401);
        } finally {
            if (userId) {
                await db.query("DELETE FROM auth.users WHERE id = $1", [userId]);
            }
        }
    });

    it("rejects resumed snapshot reads after expiry and account deletion", async () => {
        const { ACCOUNT_DATA_EXPORT_COLLECTIONS } = await import("@/lib/account-data-snapshot-collections");
        const expirySession = randomUUID();
        const expired = await createAccountDataSnapshot(
            accountA,
            randomUUID(),
            ACCOUNT_DATA_EXPORT_COLLECTIONS,
            { resumeSessionId: expirySession },
        );
        expect(expired.state).toBe("ready");
        if (expired.state !== "ready") return;

        await db.query(
            "UPDATE snapshot_private.account_data_snapshots SET expires_at = now() - interval '1 second' WHERE id = $1",
            [expired.manifest.snapshotId],
        );
        await expect(getAccountDataSnapshotManifest(accountA, expired.manifest.snapshotId, expirySession)).rejects.toMatchObject({ code: "EXPIRED" });
        await expect(getAccountDataSnapshotPage(accountA, expired.manifest.snapshotId, "user_library", 0, 200, expirySession)).rejects.toMatchObject({ code: "EXPIRED" });

        const deletedAccount = randomUUID();
        const deletedSession = randomUUID();
        await db.query(
            `INSERT INTO auth.users
                (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             VALUES
                ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
            [deletedAccount, `db107-deleted-${deletedAccount}@example.invalid`],
        );
        const deleted = await createAccountDataSnapshot(
            deletedAccount,
            randomUUID(),
            ACCOUNT_DATA_EXPORT_COLLECTIONS,
            { resumeSessionId: deletedSession },
        );
        expect(deleted.state).toBe("ready");
        if (deleted.state !== "ready") return;

        await db.query("DELETE FROM auth.users WHERE id = $1", [deletedAccount]);
        await expect(getAccountDataSnapshotManifest(deletedAccount, deleted.manifest.snapshotId, deletedSession)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(getAccountDataSnapshotPage(deletedAccount, deleted.manifest.snapshotId, "user_library", 0, 200, deletedSession)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("delivers the persisted cross-collection boundary across multiple pages while source records change", async () => {
        const { fetchVerifiedAccountDataExport } = await import("@/lib/account-data-export-client");
        const crossCollectionEmail = `db107-cross-export-${accountCrossCollectionExport}@example.invalid`;

        await db.query(
            `INSERT INTO auth.users
                (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             VALUES
                ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
            [accountCrossCollectionExport, crossCollectionEmail],
        );
        await db.query(
            `INSERT INTO public.content_item (id, type, title, status)
             SELECT source.content_id::uuid, 'article', 'DB-107 cross-collection export ' || source.ordinal, 'verified'
             FROM unnest($1::text[]) WITH ORDINALITY AS source(content_id, ordinal)`,
            [crossCollectionContentIds],
        );
        await db.query(
            `INSERT INTO public.user_library (user_id, content_id, is_bookmarked, progress)
             SELECT $1, source.content_id::uuid, true, jsonb_build_object('itemId', source.ordinal::text, 'isCompleted', false)
             FROM unnest($2::text[]) WITH ORDINALITY AS source(content_id, ordinal)`,
            [accountCrossCollectionExport, crossCollectionContentIds],
        );
        await db.query(
            `INSERT INTO public.user_reflections (user_id, content_item_id, prompt, reflection_text)
             SELECT $1, source.content_id::uuid, 'Boundary prompt ' || source.ordinal, 'Boundary reflection ' || source.ordinal
             FROM unnest($2::text[]) WITH ORDINALITY AS source(content_id, ordinal)`,
            [accountCrossCollectionExport, crossCollectionContentIds],
        );

        const pageCounts = new Map<string, number>();
        let sourceMutatedDuringTraversal = false;
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const requestUrl = new URL(
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
                window.location.origin,
            );
            const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");

            if (requestUrl.pathname === "/api/account-data/snapshots" && method === "POST") {
                const body = JSON.parse(String(init?.body ?? "{}")) as {
                    idempotencyKey: string;
                    collections: string[];
                };
                const created = await createAccountDataSnapshot(
                    accountCrossCollectionExport,
                    body.idempotencyKey,
                    body.collections,
                );
                if (created.state !== "ready") {
                    const code = created.state === "failed" ? created.code : "SNAPSHOT_BUILDING";
                    return new Response(JSON.stringify({ error: { details: { snapshot_error: code } } }), { status: 503 });
                }
                return new Response(JSON.stringify({ state: "ready", manifest: created.manifest }), { status: 201 });
            }

            const [, api, accountData, snapshots, snapshotId, collection] = requestUrl.pathname.split("/");
            if (api !== "api" || accountData !== "account-data" || snapshots !== "snapshots" || !snapshotId || !collection) {
                return new Response("Not found", { status: 404 });
            }

            const afterOrdinal = Number(requestUrl.searchParams.get("cursor") ?? "0");
            const page = collection === "user_library"
                ? await getLibrarySnapshotPage(accountCrossCollectionExport, snapshotId, afterOrdinal, 200)
                : await getAccountDataSnapshotPage(
                    accountCrossCollectionExport,
                    snapshotId,
                    collection as AccountDataSnapshotCollection,
                    afterOrdinal,
                    200,
                );
            pageCounts.set(collection, (pageCounts.get(collection) ?? 0) + 1);

            if (collection === "user_library" && afterOrdinal === 0 && !sourceMutatedDuringTraversal) {
                sourceMutatedDuringTraversal = true;
                await db.query(
                    `INSERT INTO public.content_item (id, type, title, status)
                     VALUES
                        ($1, 'article', 'DB-107 cross-collection library addition', 'verified'),
                        ($2, 'article', 'DB-107 cross-collection reflection addition', 'verified')`,
                    [crossCollectionAddedLibraryContentId, crossCollectionAddedReflectionContentId],
                );
                await db.query(
                    "UPDATE public.user_library SET is_bookmarked = false WHERE user_id = $1 AND content_id = $2",
                    [accountCrossCollectionExport, crossCollectionContentIds[0]],
                );
                await db.query(
                    "DELETE FROM public.user_library WHERE user_id = $1 AND content_id = $2",
                    [accountCrossCollectionExport, crossCollectionContentIds[1]],
                );
                await db.query(
                    "INSERT INTO public.user_library (user_id, content_id, is_bookmarked) VALUES ($1, $2, true)",
                    [accountCrossCollectionExport, crossCollectionAddedLibraryContentId],
                );
                await db.query(
                    "UPDATE public.user_reflections SET reflection_text = 'Changed after the export boundary.' WHERE user_id = $1 AND content_item_id = $2",
                    [accountCrossCollectionExport, crossCollectionContentIds[2]],
                );
                await db.query(
                    "DELETE FROM public.user_reflections WHERE user_id = $1 AND content_item_id = $2",
                    [accountCrossCollectionExport, crossCollectionContentIds[3]],
                );
                await db.query(
                    "INSERT INTO public.user_reflections (user_id, content_item_id, prompt, reflection_text) VALUES ($1, $2, 'Added after boundary', 'This must not appear in the export.')",
                    [accountCrossCollectionExport, crossCollectionAddedReflectionContentId],
                );
            }

            const endOrdinal = page.records.at(-1)?.ordinal;
            return new Response(JSON.stringify({
                data: page.records,
                manifest: page.manifest,
                pageInfo: {
                    hasNextPage: page.hasNextPage,
                    endCursor: endOrdinal === undefined ? null : String(endOrdinal),
                },
            }), { status: 200 });
        });

        vi.stubGlobal("fetch", fetchMock);
        try {
            const exported = await fetchVerifiedAccountDataExport();

            expect(sourceMutatedDuringTraversal).toBe(true);
            expect(pageCounts.get("user_library")).toBe(2);
            expect(pageCounts.get("reflections")).toBe(2);
            expect(exported.data.user_library).toHaveLength(201);
            expect(exported.data.reflections).toHaveLength(201);
            expect(exported.snapshot.collection_manifests.user_library).toMatchObject({ recordCount: 201 });
            expect(exported.snapshot.collection_manifests.reflections).toMatchObject({ recordCount: 201 });
            expect(exported.data.user_library.find((record) => record.content_id === crossCollectionContentIds[0])).toMatchObject({
                content_id: crossCollectionContentIds[0],
                is_bookmarked: true,
            });
            expect(exported.data.user_library.find((record) => record.content_id === crossCollectionContentIds[1])).toMatchObject({
                content_id: crossCollectionContentIds[1],
                is_bookmarked: true,
            });
            expect(exported.data.user_library.some((record) => record.content_id === crossCollectionAddedLibraryContentId)).toBe(false);
            expect(exported.data.reflections.find((record) => record.content_item_id === crossCollectionContentIds[2])).toMatchObject({
                reflection_text: "Boundary reflection 3",
            });
            expect(exported.data.reflections.some((record) => record.content_item_id === crossCollectionContentIds[3])).toBe(true);
            expect(exported.data.reflections.some((record) => record.content_item_id === crossCollectionAddedReflectionContentId)).toBe(false);

            const sourceLibrary = await db.query<{ content_id: string; is_bookmarked: boolean }>(
                "SELECT content_id, is_bookmarked FROM public.user_library WHERE user_id = $1 AND content_id = ANY($2::uuid[])",
                [accountCrossCollectionExport, [crossCollectionContentIds[0], crossCollectionContentIds[1], crossCollectionAddedLibraryContentId]],
            );
            expect(sourceLibrary.rows).toContainEqual({ content_id: crossCollectionContentIds[0], is_bookmarked: false });
            expect(sourceLibrary.rows.some((row) => row.content_id === crossCollectionContentIds[1])).toBe(false);
            expect(sourceLibrary.rows).toContainEqual({ content_id: crossCollectionAddedLibraryContentId, is_bookmarked: true });

            const sourceReflections = await db.query<{ content_item_id: string; reflection_text: string }>(
                "SELECT content_item_id, reflection_text FROM public.user_reflections WHERE user_id = $1 AND content_item_id = ANY($2::uuid[])",
                [accountCrossCollectionExport, [crossCollectionContentIds[2], crossCollectionContentIds[3], crossCollectionAddedReflectionContentId]],
            );
            expect(sourceReflections.rows).toContainEqual({
                content_item_id: crossCollectionContentIds[2],
                reflection_text: "Changed after the export boundary.",
            });
            expect(sourceReflections.rows.some((row) => row.content_item_id === crossCollectionContentIds[3])).toBe(false);
            expect(sourceReflections.rows).toContainEqual({
                content_item_id: crossCollectionAddedReflectionContentId,
                reflection_text: "This must not appear in the export.",
            });
        } finally {
            vi.unstubAllGlobals();
        }
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
        const page = await getLibrarySnapshotPage(accountA, ready.manifest.snapshotId, 0, 200);
        expect(page.records).toHaveLength(1);
        expect(page.records[0]?.content_id).toBe(contentA);
        expect(page.records[0]?.is_bookmarked).toBe(true);
        await resetLibraryForAccount(accountA);
        await expect(getLibrarySnapshotPage(accountA, ready.manifest.snapshotId, 0, 200)).rejects.toMatchObject({ code: "INVALIDATED" });
        const current = await db.query<{ reset_epoch: string; current_revision: string }>(
            "SELECT reset_epoch, current_revision FROM public.account_library_state WHERE user_id = $1",
            [accountA],
        );
        expect(Number(current.rows[0]?.reset_epoch)).toBeGreaterThanOrEqual(1);
        expect(Number(current.rows[0]?.current_revision)).toBeGreaterThan(ready.manifest.boundaryLibraryRevision);
    });

    it("returns the authoritative reset epoch and revision from a restricted server mutation", async () => {
        const acknowledgement = await commitLibraryMutationForAccount(accountA, {
            contentId: contentA,
            isBookmarked: true,
            progress: null,
            lastInteractedAt: new Date().toISOString(),
            deleteIfEmpty: false,
        });
        const current = await db.query<{ reset_epoch: string; current_revision: string }>(
            "SELECT reset_epoch, current_revision FROM public.account_library_state WHERE user_id = $1",
            [accountA],
        );
        expect(acknowledgement).toEqual({
            resetEpoch: Number(current.rows[0]?.reset_epoch),
            libraryRevision: Number(current.rows[0]?.current_revision),
        });
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
                 VALUES ($1, $2, $3, ARRAY['user_library'], 2, $4, 'building', now() - interval '1 second')`,
                [accountB, interruptedKey, "98692345147acfc80c5cc4ff030f6584620e93fc6b5b4bdde1ac88d265c5be62", interruptedSnapshot],
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
                 VALUES ($1, $2, $3, ARRAY['user_library'], 2, $4, 'building', now() - interval '1 second')`,
                [accountA, activeKey, "98692345147acfc80c5cc4ff030f6584620e93fc6b5b4bdde1ac88d265c5be62", activeSnapshot],
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
        if (result.state !== "failed") return;
        const copies = await db.query<{ count: string }>(
            `SELECT count(*) FROM snapshot_private.account_data_snapshot_records records
             JOIN snapshot_private.account_data_snapshots snapshots ON snapshots.id = records.snapshot_id
             WHERE snapshots.id = $1`,
            [result.snapshotId],
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
