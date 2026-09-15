import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { LibrarySnapshotWireRecord } from "@/lib/account-data-wire";
import {
    ACCOUNT_DATA_SNAPSHOT_COLLECTIONS,
    type AccountDataSnapshotCollection,
} from "@/lib/account-data-snapshot-collections";

export { ACCOUNT_DATA_SNAPSHOT_COLLECTIONS, type AccountDataSnapshotCollection } from "@/lib/account-data-snapshot-collections";

export const LIBRARY_SNAPSHOT_COLLECTION = "user_library";

// Version two adds the approved complete-export collection inventory. A
// library-only hydration can still use the same service with its one allowed
// collection; it simply gets a v2 manifest.
export const LIBRARY_SNAPSHOT_SCHEMA_VERSION = 2;
export const LIBRARY_SNAPSHOT_MAX_RECORDS = 10_000;
export const LIBRARY_SNAPSHOT_MAX_BYTES = 25 * 1024 * 1024;
export const LIBRARY_SNAPSHOT_MAX_ACCOUNT_BYTES = 75 * 1024 * 1024;
export const LIBRARY_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
export const LIBRARY_SNAPSHOT_GLOBAL_CONCURRENCY = 4;
const LIBRARY_SNAPSHOT_OPERATION_LEASE_MS = 45_000;
const LIBRARY_SNAPSHOT_OPERATION_DEADLINE_MS = 30_000;

type OperationStatus = "building" | "ready" | "failed" | "aborted";

type SnapshotOperationRow = {
    id: string;
    snapshot_id: string;
    status: OperationStatus;
    failure_code: string | null;
    request_fingerprint: string;
    collection_names: string[];
    schema_version: number;
    lease_expires_at: string | null;
    inserted: boolean;
};

export type AccountDataSnapshotCollectionManifest = {
    recordCount: number;
    manifestHash: string;
};

export type LibrarySnapshotManifest = {
    snapshotId: string;
    recordCount: number;
    manifestHash: string;
    resetEpoch: number;
    boundaryLibraryRevision: number;
    expiresAt: string;
    schemaVersion?: number;
    collectionManifests?: Partial<Record<AccountDataSnapshotCollection, AccountDataSnapshotCollectionManifest>>;
    collectionNames?: AccountDataSnapshotCollection[];
};

export type AccountDataSnapshotRecord = {
    ordinal: number;
    recordId: string;
    payload: Record<string, unknown>;
    payloadHash: string;
};

export type AccountDataSnapshotPage = {
    manifest: LibrarySnapshotManifest;
    records: AccountDataSnapshotRecord[];
    hasNextPage: boolean;
};

export type LibrarySnapshotPage = {
    manifest: LibrarySnapshotManifest;
    records: LibrarySnapshotWireRecord[];
    hasNextPage: boolean;
};

export type CreateLibrarySnapshotResult =
    | { state: "ready"; manifest: LibrarySnapshotManifest }
    | { state: "building"; snapshotId: string }
    | { state: "failed"; snapshotId: string; code: string };

export class AccountDataSnapshotError extends Error {
    constructor(
        readonly code: "CONFIGURATION" | "NOT_FOUND" | "EXPIRED" | "TOO_LARGE" | "TIMED_OUT" | "IDEMPOTENCY_KEY_REUSED" | "FAILED",
        message: string,
    ) {
        super(message);
        this.name = "AccountDataSnapshotError";
    }
}

let pool: Pool | null = null;
let maintenancePool: Pool | null = null;

function getPool() {
    if (pool) return pool;

    const connectionString = process.env.SNAPSHOT_WORKER_DATABASE_URL;
    if (!connectionString) {
        throw new AccountDataSnapshotError(
            "CONFIGURATION",
            "Account-data snapshots require SNAPSHOT_WORKER_DATABASE_URL on the server.",
        );
    }

    // The four active copy slots are enforced by distributed advisory locks;
    // leave spare connections for lease renewal and recovery.
    pool = new Pool({ connectionString, max: 6, idleTimeoutMillis: 10_000 });
    return pool;
}

function getMaintenancePool() {
    if (maintenancePool) return maintenancePool;
    const connectionString = process.env.SNAPSHOT_MAINTENANCE_DATABASE_URL;
    if (!connectionString) throw new AccountDataSnapshotError("CONFIGURATION", "Snapshot maintenance requires SNAPSHOT_MAINTENANCE_DATABASE_URL on the server.");
    maintenancePool = new Pool({ connectionString, max: 1, idleTimeoutMillis: 10_000 });
    return maintenancePool;
}

async function releaseRestrictedWorker(client: PoolClient) {
    await client.query("RESET app.snapshot_account_id").catch(() => undefined);
    await client.query("RESET ROLE").catch(() => undefined);
}

async function withRestrictedWorkerTransaction<T>(
    client: PoolClient,
    accountId: string,
    work: () => Promise<T>,
): Promise<T> {
    await client.query("BEGIN");
    try {
        await client.query("SET LOCAL ROLE netflux_snapshot_worker");
        await client.query("SELECT set_config('app.snapshot_account_id', $1, true)", [accountId]);
        const result = await work();
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    }
}

async function withRestrictedWorkerSnapshotTransaction<T>(
    client: PoolClient,
    accountId: string,
    work: () => Promise<T>,
): Promise<T> {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    try {
        // Every copy query has a bounded execution time; the caller also
        // wraps this transaction in the 30-second operation deadline below.
        await client.query("SET LOCAL statement_timeout = '15s'");
        await client.query("SET LOCAL lock_timeout = '2s'");
        await client.query("SET LOCAL ROLE netflux_snapshot_worker");
        await client.query("SELECT set_config('app.snapshot_account_id', $1, true)", [accountId]);
        const result = await work();
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    }
}

async function withSnapshotMaintenanceTransaction<T>(client: PoolClient, work: () => Promise<T>): Promise<T> {
    await client.query("BEGIN");
    try {
        await client.query("SET LOCAL ROLE netflux_snapshot_maintenance");
        const result = await work();
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
    }
}

function requestFingerprint(collections: readonly AccountDataSnapshotCollection[]) {
    return createHash("sha256")
        .update(JSON.stringify({ collections, schemaVersion: LIBRARY_SNAPSHOT_SCHEMA_VERSION }))
        .digest("hex");
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

/**
 * Every adapter selects only fields promised by the owned-data inventory. The
 * query's ordinal is part of the stored immutable snapshot, so export pages
 * never derive order from a live source table.
 */
const snapshotCollectionQueries: Record<AccountDataSnapshotCollection, string> = {
    preferences: `
        SELECT p.id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY p.id ASC) AS ordinal,
               jsonb_build_object(
                   'id', p.id,
                   'onboarding_state', p.onboarding_state,
                   'reader_settings', p.reader_settings,
                   'created_at', p.created_at,
                   'updated_at', p.updated_at
               ) AS payload
        FROM public.profiles p
        WHERE p.id = $1`,
    user_library: `
        SELECT ul.content_id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY ul.library_updated_at DESC, ul.content_id ASC) AS ordinal,
               jsonb_build_object(
                   'content_id', ul.content_id,
                   'is_bookmarked', ul.is_bookmarked,
                   'progress', ul.progress,
                   'last_interacted_at', ul.last_interacted_at,
                   'library_updated_at', ul.library_updated_at,
                   'library_revision', ul.library_revision
               ) AS payload
        FROM public.user_library ul
        WHERE ul.user_id = $1`,
    highlights: `
        SELECT h.id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY h.created_at DESC NULLS LAST, h.id ASC) AS ordinal,
               jsonb_build_object(
                   'id', h.id,
                   'content_item_id', h.content_item_id,
                   'segment_id', h.segment_id,
                   'highlighted_text', h.highlighted_text,
                   'note_body', h.note_body,
                   'color', h.color,
                   'anchor_start', h.anchor_start,
                   'anchor_end', h.anchor_end,
                   'created_at', h.created_at,
                   'updated_at', h.updated_at
               ) AS payload
        FROM public.user_highlights h
        WHERE h.user_id = $1`,
    reflections: `
        SELECT r.id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY r.updated_at DESC, r.id ASC) AS ordinal,
               jsonb_build_object(
                   'id', r.id,
                   'content_item_id', r.content_item_id,
                   'prompt', r.prompt,
                   'reflection_text', r.reflection_text,
                   'created_at', r.created_at,
                   'updated_at', r.updated_at
               ) AS payload
        FROM public.user_reflections r
        WHERE r.user_id = $1`,
    reading_activity: `
        SELECT a.id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY a.activity_date DESC, a.id ASC) AS ordinal,
               jsonb_build_object(
                   'id', a.id,
                   'activity_date', a.activity_date,
                   'duration_seconds', a.duration_seconds,
                   'pages_read', a.pages_read,
                   'created_at', a.created_at,
                   'updated_at', a.updated_at
               ) AS payload
        FROM public.reading_activity a
        WHERE a.user_id = $1`,
    feedback: `
        SELECT f.id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY f.created_at DESC, f.id ASC) AS ordinal,
               jsonb_build_object(
                   'id', f.id,
                   'content_id', f.content_id,
                   'is_positive', f.is_positive,
                   'reason', f.reason,
                   'details', f.details,
                   'created_at', f.created_at
               ) AS payload
        FROM public.content_feedback f
        WHERE f.user_id = $1`,
    submitted_requests: `
        SELECT r.id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY r.created_at DESC, r.id ASC) AS ordinal,
               jsonb_build_object(
                   'id', r.id,
                   'title', r.title,
                   'author', r.author,
                   'source_url', r.source_url,
                   'content_type', r.content_type,
                   'thumbnail_url', r.thumbnail_url,
                   'status', r.status,
                   'published_content_id', r.published_content_id,
                   'created_at', r.created_at,
                   'updated_at', r.updated_at
               ) AS payload
        FROM public.content_requests r
        WHERE r.submitted_by = $1`,
    request_votes: `
        SELECT v.request_id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY v.created_at DESC, v.request_id ASC) AS ordinal,
               jsonb_build_object(
                   'request_id', v.request_id,
                   'created_at', v.created_at
               ) AS payload
        FROM public.content_request_votes v
        WHERE v.user_id = $1`,
    notification_preferences: `
        SELECT n.user_id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY n.user_id ASC) AS ordinal,
               jsonb_build_object(
                   'request_published_email_enabled', n.request_published_email_enabled,
                   'created_at', n.created_at,
                   'updated_at', n.updated_at
               ) AS payload
        FROM public.user_notification_preferences n
        WHERE n.user_id = $1`,
    request_notifications: `
        SELECT n.id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY n.created_at DESC, n.id ASC) AS ordinal,
               jsonb_build_object(
                   'id', n.id,
                   'request_id', n.request_id,
                   'type', n.type,
                   'status', n.status,
                   'queued_at', n.queued_at,
                   'sent_at', n.sent_at,
                   'skipped_at', n.skipped_at,
                   'created_at', n.created_at,
                   'updated_at', n.updated_at
               ) AS payload
        FROM public.content_request_notifications n
        WHERE n.user_id = $1`,
    ai_usage: `
        SELECT u.id::text AS record_id,
               ROW_NUMBER() OVER (ORDER BY u.created_at DESC, u.id ASC) AS ordinal,
               jsonb_build_object(
                   'id', u.id,
                   'feature', u.feature,
                   'created_at', u.created_at
               ) AS payload
        FROM public.ai_message_usage u
        WHERE u.user_id = $1`,
};

function snapshotCollectionQuery(collection: AccountDataSnapshotCollection, accountParameter = 1) {
    // The source adapters use $1 when executed independently for admission.
    // When nested in the copy INSERT, $1 and $2 belong to the snapshot root
    // and collection name, so bind the account as $3 instead.
    return snapshotCollectionQueries[collection].replaceAll("$1", `$${accountParameter}`);
}

export function normalizeSnapshotCollections(collections: readonly string[] | undefined): AccountDataSnapshotCollection[] {
    const requested = collections?.length ? new Set(collections) : new Set([LIBRARY_SNAPSHOT_COLLECTION]);
    if ([...requested].some((collection) => !ACCOUNT_DATA_SNAPSHOT_COLLECTIONS.includes(collection as AccountDataSnapshotCollection))) {
        throw new AccountDataSnapshotError("FAILED", "SNAPSHOT_COLLECTION_INVALID");
    }
    return ACCOUNT_DATA_SNAPSHOT_COLLECTIONS.filter((collection) => requested.has(collection));
}

function payloadHash(payload: unknown) {
    return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function expiresAt() {
    return new Date(Date.now() + LIBRARY_SNAPSHOT_TTL_MS).toISOString();
}

async function acquireGlobalSnapshotSlot(client: PoolClient) {
    for (let slot = 0; slot < LIBRARY_SNAPSHOT_GLOBAL_CONCURRENCY; slot += 1) {
        const result = await client.query<{ locked: boolean }>(
            "SELECT pg_try_advisory_lock($1, $2) AS locked",
            [91_007, slot],
        );
        if (result.rows[0]?.locked) return slot;
    }
    return null;
}

async function getReadyManifest(
    client: PoolClient,
    accountId: string,
    snapshotId: string,
    allowExpired = false,
): Promise<LibrarySnapshotManifest | null> {
    const result = await client.query<{
        id: string;
        record_count: number;
        manifest_hash: string | null;
        reset_epoch: number;
        boundary_library_revision: number;
        expires_at: string;
        schema_version: number;
        collection_manifests: Record<string, AccountDataSnapshotCollectionManifest> | null;
        collection_names: AccountDataSnapshotCollection[];
    }>(
        `SELECT id, record_count, manifest_hash, reset_epoch, boundary_library_revision, expires_at,
                schema_version, collection_manifests, collection_names
         FROM snapshot_private.account_data_snapshots
         WHERE id = $1 AND account_id = $2 AND status = 'ready'`,
        [snapshotId, accountId],
    );
    const row = result.rows[0];
    if (!row || !row.manifest_hash) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
        if (allowExpired) return null;
        throw new AccountDataSnapshotError("EXPIRED", "This account-data snapshot has expired.");
    }
    return {
        snapshotId: row.id,
        recordCount: Number(row.record_count),
        manifestHash: row.manifest_hash,
        resetEpoch: Number(row.reset_epoch),
        boundaryLibraryRevision: Number(row.boundary_library_revision),
        expiresAt: new Date(row.expires_at).toISOString(),
        schemaVersion: Number(row.schema_version),
        collectionManifests: row.collection_manifests ?? {},
        collectionNames: row.collection_names,
    };
}

async function cleanupExpiredSnapshots(client: PoolClient, accountId: string) {
    try {
        await client.query(
            `DELETE FROM snapshot_private.account_data_snapshots
             WHERE account_id = $1 AND expires_at <= now()`,
            [accountId],
        );
        await client.query(
            `DELETE FROM snapshot_private.account_data_snapshot_operations operation
             WHERE operation.account_id = $1
               AND operation.status <> 'building'
               AND operation.updated_at < now() - interval '25 hours'
               AND NOT EXISTS (
                   SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
                   WHERE snapshot.operation_id = operation.id
               )`,
            [accountId],
        );
    } catch (error) {
        console.error("Account-data snapshot cleanup failed", { error });
        throw new AccountDataSnapshotError("FAILED", "SNAPSHOT_CLEANUP_FAILED");
    }
}

function accountLockName(accountId: string) {
    return `account-data:${accountId}`;
}

async function tryAcquireAccountLock(client: PoolClient, accountId: string) {
    const result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
        [accountLockName(accountId)],
    );
    return result.rows[0]?.locked === true;
}

async function releaseAccountLock(client: PoolClient, accountId: string) {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [accountLockName(accountId)]).catch(() => undefined);
}

function startOperationLeaseRenewal(accountId: string, operationId: string) {
    let stopped = false;
    let inFlight: Promise<void> | null = null;
    const renew = () => {
        if (stopped || inFlight) return;
        inFlight = (async () => {
            const client = await getPool().connect();
            try {
                await withRestrictedWorkerTransaction(client, accountId, async () => {
                    await client.query(
                        `UPDATE snapshot_private.account_data_snapshot_operations
                         SET lease_expires_at = now() + interval '45 seconds', updated_at = now()
                         WHERE id = $1 AND status = 'building'`,
                        [operationId],
                    );
                });
            } finally {
                client.release();
            }
        })().catch((error) => {
            console.error("Account-data snapshot lease renewal failed", { operationId, error });
        }).finally(() => {
            inFlight = null;
        });
    };
    const timer = setInterval(renew, Math.floor(LIBRARY_SNAPSHOT_OPERATION_LEASE_MS / 3));
    timer.unref?.();
    return async () => {
        stopped = true;
        clearInterval(timer);
        await inFlight;
    };
}

export async function reconcileExpiredAccountDataSnapshots() {
    const client = await getMaintenancePool().connect();
    try {
        return await withSnapshotMaintenanceTransaction(client, async () => {
            const expiredOperations = await client.query<{ id: string; account_id: string }>(
                `SELECT id, account_id
                 FROM snapshot_private.account_data_snapshot_operations
                 WHERE status = 'building' AND lease_expires_at <= now()`,
            );
            let abortedCount = 0;
            for (const operation of expiredOperations.rows) {
                if (!await tryAcquireAccountLock(client, operation.account_id)) continue;
                try {
                    const aborted = await client.query(
                        `UPDATE snapshot_private.account_data_snapshot_operations operation
                         SET status = 'aborted', failure_code = 'SNAPSHOT_WORKER_INTERRUPTED', lease_expires_at = NULL, updated_at = now()
                         WHERE operation.id = $1
                           AND operation.status = 'building'
                           AND operation.lease_expires_at <= now()
                           AND NOT EXISTS (
                               SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
                               WHERE snapshot.operation_id = operation.id AND snapshot.status = 'ready'
                           )`,
                        [operation.id],
                    );
                    abortedCount += aborted.rowCount ?? 0;
                } finally {
                    await releaseAccountLock(client, operation.account_id);
                }
            }
            const expired = await client.query(
                `DELETE FROM snapshot_private.account_data_snapshots WHERE expires_at <= now()`,
            );
            const pruned = await client.query(
                `DELETE FROM snapshot_private.account_data_snapshot_operations operation
                 WHERE operation.status <> 'building'
                   AND operation.updated_at < now() - interval '25 hours'
                   AND NOT EXISTS (
                       SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
                       WHERE snapshot.operation_id = operation.id
                   )`,
            );
            return { aborted: abortedCount, expired: expired.rowCount ?? 0, pruned: pruned.rowCount ?? 0 };
        });
    } finally {
        client.release();
    }
}

export async function resetLibraryForAccount(accountId: string) {
    const client = await getPool().connect();
    try {
        return await withRestrictedWorkerTransaction(client, accountId, async () => {
            await client.query("DELETE FROM public.user_library WHERE user_id = $1", [accountId]);
            const state = await client.query<{ reset_epoch: string; current_revision: string }>(
                `INSERT INTO public.account_library_state (user_id, reset_epoch, current_revision)
                 VALUES ($1, 1, 1)
                 ON CONFLICT (user_id) DO UPDATE
                 SET reset_epoch = public.account_library_state.reset_epoch + 1,
                     current_revision = public.account_library_state.current_revision + 1,
                     updated_at = now()
                 RETURNING reset_epoch, current_revision`,
                [accountId],
            );
            const row = state.rows[0];
            if (!row) throw new AccountDataSnapshotError("FAILED", "Could not record the library reset.");
            return { resetEpoch: Number(row.reset_epoch), currentRevision: Number(row.current_revision) };
        });
    } finally {
        client.release();
    }
}

/**
 * Commits a library mutation through the account-bound worker and returns the
 * exact library boundary from the same transaction. This must remain a
 * server-only operation: browser clients receive the acknowledgement through
 * the authenticated route and never get direct access to worker privileges.
 */
export async function commitLibraryMutationForAccount(
    accountId: string,
    input: {
        contentId: string;
        isBookmarked: boolean;
        progress: unknown | null;
        lastInteractedAt: string;
        deleteIfEmpty: boolean;
    },
) {
    const client = await getPool().connect();
    try {
        return await withRestrictedWorkerTransaction(client, accountId, async () => {
            if (input.deleteIfEmpty) {
                await client.query(
                    "DELETE FROM public.user_library WHERE user_id = $1 AND content_id = $2",
                    [accountId, input.contentId],
                );
            } else {
                await client.query(
                    `INSERT INTO public.user_library
                        (user_id, content_id, is_bookmarked, progress, last_interacted_at)
                     VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
                     ON CONFLICT (user_id, content_id) DO UPDATE
                     SET is_bookmarked = EXCLUDED.is_bookmarked,
                         progress = EXCLUDED.progress,
                         last_interacted_at = EXCLUDED.last_interacted_at`,
                    [
                        accountId,
                        input.contentId,
                        input.isBookmarked,
                        input.progress === null ? null : JSON.stringify(input.progress),
                        input.lastInteractedAt,
                    ],
                );
            }

            const state = await client.query<{ reset_epoch: string; current_revision: string }>(
                `SELECT reset_epoch, current_revision
                 FROM public.account_library_state
                 WHERE user_id = $1`,
                [accountId],
            );
            const row = state.rows[0];
            // A delete of a never-written item is a valid idempotent mutation.
            if (!row) return { resetEpoch: 0, libraryRevision: 0 };
            return {
                resetEpoch: Number(row.reset_epoch),
                libraryRevision: Number(row.current_revision),
            };
        });
    } finally {
        client.release();
    }
}

async function persistOperationFailure(client: PoolClient, operationId: string, code: string) {
    await client.query(
        `UPDATE snapshot_private.account_data_snapshot_operations
         SET status = 'failed', failure_code = $2, lease_expires_at = NULL, updated_at = now()
         WHERE id = $1`,
        [operationId, code],
    );
}

export async function createAccountDataSnapshot(
    accountId: string,
    idempotencyKey: string,
    requestedCollections?: readonly string[],
): Promise<CreateLibrarySnapshotResult> {
    const client = await getPool().connect();
    const collections = normalizeSnapshotCollections(requestedCollections);
    const fingerprint = requestFingerprint(collections);
    const snapshotId = randomUUID();
    let globalSlot: number | null = null;
    let stopLeaseRenewal: (() => Promise<void>) | null = null;
    const startedAt = Date.now();
    const ensureDeadline = () => {
        if (Date.now() - startedAt > LIBRARY_SNAPSHOT_OPERATION_DEADLINE_MS) {
            throw new AccountDataSnapshotError("TIMED_OUT", "SNAPSHOT_TIMED_OUT");
        }
    };

    try {
        // This commit deliberately precedes the snapshot-copy transaction. It
        // makes the idempotency outcome durable even if a worker is killed
        // during the following repeatable-read traversal.
        const operation = await withRestrictedWorkerTransaction(client, accountId, async () => {
            const result = await client.query<SnapshotOperationRow>(
                `INSERT INTO snapshot_private.account_data_snapshot_operations
                (account_id, idempotency_key, request_fingerprint, collection_names, schema_version, snapshot_id, status, lease_expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'building', now() + interval '30 seconds')
             ON CONFLICT (account_id, idempotency_key) DO UPDATE
             SET idempotency_key = EXCLUDED.idempotency_key
             RETURNING id, snapshot_id, status, failure_code, request_fingerprint, collection_names, schema_version,
                       lease_expires_at, (xmax = 0) AS inserted`,
                [accountId, idempotencyKey, fingerprint, collections, LIBRARY_SNAPSHOT_SCHEMA_VERSION, snapshotId],
            );
            const row = result.rows[0];
            if (!row) throw new AccountDataSnapshotError("FAILED", "Could not create a snapshot operation.");
            return row;
        });

        if (
            operation.request_fingerprint !== fingerprint
            || operation.schema_version !== LIBRARY_SNAPSHOT_SCHEMA_VERSION
            || operation.collection_names.length !== collections.length
            || operation.collection_names.some((collection, index) => collection !== collections[index])
        ) {
            throw new AccountDataSnapshotError("IDEMPOTENCY_KEY_REUSED", "This idempotency key belongs to a different snapshot request.");
        }

        if (!operation.inserted) {
            const existing = await withRestrictedWorkerTransaction(client, accountId, async () => {
                const manifest = await getReadyManifest(client, accountId, operation.snapshot_id, true);
                if (manifest) {
                    await client.query(
                        `UPDATE snapshot_private.account_data_snapshot_operations
                         SET status = 'ready', failure_code = NULL, lease_expires_at = NULL, updated_at = now()
                         WHERE id = $1`,
                        [operation.id],
                    );
                    return { state: "ready" as const, manifest };
                }
                const current = await client.query<Pick<SnapshotOperationRow, "status" | "failure_code" | "lease_expires_at">>(
                    `SELECT status, failure_code, lease_expires_at
                     FROM snapshot_private.account_data_snapshot_operations WHERE id = $1`,
                    [operation.id],
                );
                const row = current.rows[0];
                if (!row || row.status === "failed" || row.status === "aborted") {
                    return { state: "failed" as const, snapshotId: operation.snapshot_id, code: row?.failure_code ?? "SNAPSHOT_FAILED" };
                }
                // A completed operation is immutable. Once its only ready
                // snapshot expires, the same idempotency key cannot be
                // rebuilt; return a terminal result so the client can make an
                // explicit fresh attempt with a new key.
                if (row.status === "ready") {
                    return { state: "failed" as const, snapshotId: operation.snapshot_id, code: "SNAPSHOT_EXPIRED" };
                }
                if (row.lease_expires_at && new Date(row.lease_expires_at).getTime() > Date.now()) {
                    return { state: "building" as const, snapshotId: operation.snapshot_id };
                }
                return { state: "building" as const, snapshotId: operation.snapshot_id };
            });
            if (existing.state !== "building") return existing;
            // An expired lease alone is not proof that its worker died. Only
            // the holder of the account lock may complete the operation; if
            // that lock is live, preserve the stable building outcome.
            if (!await tryAcquireAccountLock(client, accountId)) return existing;
            try {
                return await withRestrictedWorkerTransaction(client, accountId, async () => {
                    const aborted = await client.query<{ snapshot_id: string }>(
                        `UPDATE snapshot_private.account_data_snapshot_operations operation
                         SET status = 'aborted', failure_code = 'SNAPSHOT_WORKER_INTERRUPTED', lease_expires_at = NULL, updated_at = now()
                         WHERE operation.id = $1
                           AND operation.status = 'building'
                           AND operation.lease_expires_at <= now()
                           AND NOT EXISTS (
                               SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
                               WHERE snapshot.operation_id = operation.id AND snapshot.status = 'ready'
                           )
                         RETURNING snapshot_id`,
                        [operation.id],
                    );
                    if (aborted.rows[0]) {
                        return { state: "failed" as const, snapshotId: operation.snapshot_id, code: "SNAPSHOT_WORKER_INTERRUPTED" };
                    }
                    const refreshed = await getReadyManifest(client, accountId, operation.snapshot_id, true);
                    if (refreshed) return { state: "ready" as const, manifest: refreshed };
                    return { state: "building" as const, snapshotId: operation.snapshot_id };
                });
            } finally {
                await releaseAccountLock(client, accountId);
            }
        }

        if (!await tryAcquireAccountLock(client, accountId)) {
            await withRestrictedWorkerTransaction(client, accountId, async () => {
                await persistOperationFailure(client, operation.id, "SNAPSHOT_BUSY");
            });
            return { state: "failed", snapshotId: operation.snapshot_id, code: "SNAPSHOT_BUSY" };
        }

        try {
            stopLeaseRenewal = startOperationLeaseRenewal(accountId, operation.id);
            globalSlot = await acquireGlobalSnapshotSlot(client);
            if (globalSlot === null) {
                await withRestrictedWorkerTransaction(client, accountId, async () => {
                    await persistOperationFailure(client, operation.id, "SNAPSHOT_BUSY");
                });
                return { state: "failed", snapshotId: operation.snapshot_id, code: "SNAPSHOT_BUSY" };
            }
            await withRestrictedWorkerTransaction(client, accountId, async () => {
                await cleanupExpiredSnapshots(client, accountId);
            });
            const snapshotExpiry = expiresAt();
            const manifest = await withRestrictedWorkerSnapshotTransaction(client, accountId, async () => {
                const state = await client.query<{ reset_epoch: number; current_revision: number }>(
                `SELECT reset_epoch, current_revision
                 FROM public.account_library_state
                 WHERE user_id = $1`,
                [accountId],
                );
                const libraryState = state.rows[0] ?? { reset_epoch: 0, current_revision: 0 };
                ensureDeadline();

                // Admission happens for every requested collection before any
                // payload row is copied. The complete-export limit is an
                // aggregate limit, never a reason to silently omit a tail.
                let admittedRecords = 0;
                let admittedBytes = 0;
                for (const collection of collections) {
                    const preflight = await client.query<{ record_count: number; payload_bytes: number }>(
                        `SELECT COUNT(*)::int AS record_count,
                                COALESCE(SUM(octet_length(payload::text)), 0)::int AS payload_bytes
                         FROM (${snapshotCollectionQuery(collection)}) AS source`,
                        [accountId],
                    );
                    const admission = preflight.rows[0];
                    admittedRecords += Number(admission?.record_count ?? 0);
                    admittedBytes += Number(admission?.payload_bytes ?? 0);
                }
                if (admittedRecords > LIBRARY_SNAPSHOT_MAX_RECORDS || admittedBytes > LIBRARY_SNAPSHOT_MAX_BYTES) {
                    throw new AccountDataSnapshotError("TOO_LARGE", "SNAPSHOT_TOO_LARGE");
                }
                ensureDeadline();

                await client.query(
                `INSERT INTO snapshot_private.account_data_snapshots
                    (id, operation_id, account_id, collection_names, schema_version, reset_epoch, boundary_library_revision, status, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'building', $8)
                 ON CONFLICT (id) DO NOTHING`,
                [operation.snapshot_id, operation.id, accountId, collections, LIBRARY_SNAPSHOT_SCHEMA_VERSION, libraryState.reset_epoch, libraryState.current_revision, snapshotExpiry],
                );

                for (const collection of collections) {
                    await client.query(
                        `INSERT INTO snapshot_private.account_data_snapshot_records (snapshot_id, collection_name, ordinal, record_id, payload)
                         SELECT $1, $2, source.ordinal, source.record_id, source.payload
                         FROM (${snapshotCollectionQuery(collection, 3)}) AS source
                         ORDER BY source.ordinal ASC`,
                        [operation.snapshot_id, collection, accountId],
                    );
                }
                ensureDeadline();

                const totals = await client.query<{ record_count: number; payload_bytes: number }>(
                `SELECT COUNT(*)::int AS record_count,
                        COALESCE(SUM(octet_length(payload::text)), 0)::int AS payload_bytes
                 FROM snapshot_private.account_data_snapshot_records
                 WHERE snapshot_id = $1`,
                [operation.snapshot_id],
                );
                const total = totals.rows[0];
                if (!total || total.record_count > LIBRARY_SNAPSHOT_MAX_RECORDS || total.payload_bytes > LIBRARY_SNAPSHOT_MAX_BYTES) {
                    throw new AccountDataSnapshotError("TOO_LARGE", "SNAPSHOT_TOO_LARGE");
                }

                const collectionManifests: Partial<Record<AccountDataSnapshotCollection, AccountDataSnapshotCollectionManifest>> = {};
                const allPayloadHashes: string[] = [];
                for (const collection of collections) {
                    const payloads = await client.query<{ payload: unknown }>(
                        `SELECT payload FROM snapshot_private.account_data_snapshot_records
                         WHERE snapshot_id = $1 AND collection_name = $2 ORDER BY ordinal ASC`,
                        [operation.snapshot_id, collection],
                    );
                    const hashes = payloads.rows.map((row) => payloadHash(row.payload));
                    const collectionHash = createHash("sha256").update(hashes.join("\n")).digest("hex");
                    collectionManifests[collection] = { recordCount: hashes.length, manifestHash: collectionHash };
                    allPayloadHashes.push(...hashes);
                }
                const manifestHash = createHash("sha256").update(allPayloadHashes.join("\n")).digest("hex");

                const retained = await client.query<{ payload_bytes: string }>(
                `SELECT COALESCE(SUM(payload_bytes), 0)::bigint AS payload_bytes
                 FROM snapshot_private.account_data_snapshots
                 WHERE account_id = $1 AND id <> $2 AND status = 'ready' AND expires_at > now()`,
                [accountId, operation.snapshot_id],
                );
                const retainedBytes = Number(retained.rows[0]?.payload_bytes ?? 0);
                if (retainedBytes + total.payload_bytes > LIBRARY_SNAPSHOT_MAX_ACCOUNT_BYTES) {
                    throw new AccountDataSnapshotError("TOO_LARGE", "SNAPSHOT_ACCOUNT_CAPACITY");
                }
                ensureDeadline();

                await client.query(
                `UPDATE snapshot_private.account_data_snapshots
                 SET record_count = $2, payload_bytes = $3, manifest_hash = $4, collection_manifests = $5, status = 'ready'
                 WHERE id = $1`,
                [operation.snapshot_id, total.record_count, total.payload_bytes, manifestHash, JSON.stringify(collectionManifests)],
                );
                return {
                    snapshotId: operation.snapshot_id,
                    recordCount: total.record_count,
                    manifestHash,
                    resetEpoch: Number(libraryState.reset_epoch),
                    boundaryLibraryRevision: Number(libraryState.current_revision),
                    expiresAt: snapshotExpiry,
                    schemaVersion: LIBRARY_SNAPSHOT_SCHEMA_VERSION,
                    collectionManifests,
                } satisfies LibrarySnapshotManifest;
            });

            await withRestrictedWorkerTransaction(client, accountId, async () => {
                await client.query(
                    `UPDATE snapshot_private.account_data_snapshot_operations
                     SET status = 'ready', failure_code = NULL, lease_expires_at = NULL, updated_at = now()
                     WHERE id = $1`,
                    [operation.id],
                );
            });

            return { state: "ready", manifest };
        } catch (error) {
            const code = error instanceof AccountDataSnapshotError
                ? error.code === "TOO_LARGE" ? error.message : error.code === "FAILED" && error.message.startsWith("SNAPSHOT_") ? error.message : error.code
                : (error as { code?: string }).code === "57014" ? "SNAPSHOT_TIMED_OUT" : "SNAPSHOT_FAILED";
            await withRestrictedWorkerTransaction(client, accountId, async () => {
                await persistOperationFailure(client, operation.id, code);
            });
            return { state: "failed", snapshotId: operation.snapshot_id, code };
        } finally {
            await stopLeaseRenewal?.();
            if (globalSlot !== null) {
                await client.query("SELECT pg_advisory_unlock($1, $2)", [91_007, globalSlot]).catch(() => undefined);
            }
            await releaseAccountLock(client, accountId);
        }
    } finally {
        client.release();
    }
}

/** Reads a persisted page for one allowlisted collection. */
export async function getAccountDataSnapshotPage(
    accountId: string,
    snapshotId: string,
    collection: AccountDataSnapshotCollection,
    afterOrdinal: number,
    pageSize: number,
): Promise<AccountDataSnapshotPage> {
    const client = await getPool().connect();
    try {
        return await withRestrictedWorkerTransaction(client, accountId, async () => {
            const manifest = await getReadyManifest(client, accountId, snapshotId);
            if (!manifest) throw new AccountDataSnapshotError("NOT_FOUND", "Snapshot not found.");
            if (manifest.collectionNames && !manifest.collectionNames.includes(collection)) {
                throw new AccountDataSnapshotError("NOT_FOUND", "This collection was not included in the snapshot.");
            }
            const result = await client.query<{
                ordinal: string;
                record_id: string;
                payload: Record<string, unknown>;
            }>(
            `SELECT ordinal, record_id, payload
             FROM snapshot_private.account_data_snapshot_records
             WHERE snapshot_id = $1 AND collection_name = $2 AND ordinal > $3
             ORDER BY ordinal ASC
             LIMIT $4`,
            [snapshotId, collection, afterOrdinal, pageSize + 1],
            );
            const rows = result.rows;
            const hasNextPage = rows.length > pageSize;
            return {
                manifest,
                records: rows.slice(0, pageSize).map((row) => ({
                    ordinal: Number(row.ordinal),
                    recordId: row.record_id,
                    payload: row.payload,
                    payloadHash: payloadHash(row.payload),
                })),
                hasNextPage,
            };
        });
    } finally {
        await releaseRestrictedWorker(client);
        client.release();
    }
}

export async function createLibrarySnapshot(accountId: string, idempotencyKey: string): Promise<CreateLibrarySnapshotResult> {
    return createAccountDataSnapshot(accountId, idempotencyKey, [LIBRARY_SNAPSHOT_COLLECTION]);
}

export async function getLibrarySnapshotPage(accountId: string, snapshotId: string, afterOrdinal: number, pageSize: number): Promise<LibrarySnapshotPage> {
    const page = await getAccountDataSnapshotPage(accountId, snapshotId, LIBRARY_SNAPSHOT_COLLECTION, afterOrdinal, pageSize);
    return {
        manifest: page.manifest,
        hasNextPage: page.hasNextPage,
        records: page.records.map((row) => ({
            content_id: String(row.payload.content_id),
            is_bookmarked: row.payload.is_bookmarked as boolean | null,
            progress: row.payload.progress as Record<string, unknown> | null,
            last_interacted_at: row.payload.last_interacted_at as string | null,
            library_updated_at: String(row.payload.library_updated_at),
            library_revision: Number(row.payload.library_revision),
            ordinal: row.ordinal,
            payloadHash: row.payloadHash,
        })),
    };
}

export async function getLiveLibraryPage(
    accountId: string,
    after: { updatedAt: string; contentId: string } | null,
    pageSize: number,
) {
    const client = await getPool().connect();
    try {
        return await withRestrictedWorkerTransaction(client, accountId, async () => {
            const result = await client.query<{
            content_id: string;
            is_bookmarked: boolean | null;
            progress: Record<string, unknown> | null;
            last_interacted_at: string | null;
            library_updated_at: string;
            library_revision: number;
        }>(
            `SELECT content_id, is_bookmarked, progress, last_interacted_at,
                    library_updated_at::text AS library_updated_at, library_revision
             FROM public.user_library
             WHERE user_id = $1
               AND (
                   $2::timestamptz IS NULL
                   OR library_updated_at < $2::timestamptz
                   OR (library_updated_at = $2::timestamptz AND content_id > $3::uuid)
               )
             ORDER BY library_updated_at DESC, content_id ASC
             LIMIT $4`,
            [accountId, after?.updatedAt ?? null, after?.contentId ?? null, pageSize + 1],
        );
            const hasNextPage = result.rows.length > pageSize;
            const rows = result.rows.slice(0, pageSize);
            return { rows, hasNextPage };
        });
    } finally {
        await releaseRestrictedWorker(client);
        client.release();
    }
}

export function resetAccountDataSnapshotPoolForTests() {
    const activePool = pool;
    const activeMaintenancePool = maintenancePool;
    pool = null;
    maintenancePool = null;
    return Promise.all([activePool?.end(), activeMaintenancePool?.end()]);
}
