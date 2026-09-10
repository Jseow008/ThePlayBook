import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

export const LIBRARY_SNAPSHOT_COLLECTION = "user_library";
export const LIBRARY_SNAPSHOT_SCHEMA_VERSION = 1;
export const LIBRARY_SNAPSHOT_MAX_RECORDS = 1_000;
export const LIBRARY_SNAPSHOT_MAX_BYTES = 25 * 1024 * 1024;
export const LIBRARY_SNAPSHOT_MAX_ACCOUNT_BYTES = 75 * 1024 * 1024;
export const LIBRARY_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
export const LIBRARY_SNAPSHOT_GLOBAL_CONCURRENCY = 4;

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

export type LibrarySnapshotManifest = {
    snapshotId: string;
    recordCount: number;
    manifestHash: string;
    resetEpoch: number;
    boundaryLibraryRevision: number;
    expiresAt: string;
};

export type LibrarySnapshotPage = {
    manifest: LibrarySnapshotManifest;
    records: Array<{
        ordinal: number;
        payloadHash: string;
        contentId: string;
        isBookmarked: boolean | null;
        progress: Record<string, unknown> | null;
        lastInteractedAt: string | null;
        libraryUpdatedAt: string;
        libraryRevision: number;
    }>;
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

function getPool() {
    if (pool) return pool;

    const connectionString = process.env.SNAPSHOT_ADMIN_DATABASE_URL;
    if (!connectionString) {
        throw new AccountDataSnapshotError(
            "CONFIGURATION",
            "Account-data snapshots require SNAPSHOT_ADMIN_DATABASE_URL on the server.",
        );
    }

    pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 10_000 });
    return pool;
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

function requestFingerprint() {
    return createHash("sha256")
        .update(JSON.stringify({ collections: [LIBRARY_SNAPSHOT_COLLECTION], schemaVersion: LIBRARY_SNAPSHOT_SCHEMA_VERSION }))
        .digest("hex");
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
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
    }>(
        `SELECT id, record_count, manifest_hash, reset_epoch, boundary_library_revision, expires_at
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

export async function reconcileExpiredAccountDataSnapshots() {
    const client = await getPool().connect();
    try {
        return await withSnapshotMaintenanceTransaction(client, async () => {
            const aborted = await client.query(
                `UPDATE snapshot_private.account_data_snapshot_operations
                 SET status = 'aborted', failure_code = 'SNAPSHOT_WORKER_INTERRUPTED', lease_expires_at = NULL, updated_at = now()
                 WHERE status = 'building' AND lease_expires_at <= now()
                   AND NOT EXISTS (
                       SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
                       WHERE snapshot.operation_id = account_data_snapshot_operations.id
                         AND snapshot.status = 'ready'
                   )`,
            );
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
            return { aborted: aborted.rowCount ?? 0, expired: expired.rowCount ?? 0, pruned: pruned.rowCount ?? 0 };
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

async function persistOperationFailure(client: PoolClient, operationId: string, code: string) {
    await client.query(
        `UPDATE snapshot_private.account_data_snapshot_operations
         SET status = 'failed', failure_code = $2, lease_expires_at = NULL, updated_at = now()
         WHERE id = $1`,
        [operationId, code],
    );
}

export async function createLibrarySnapshot(accountId: string, idempotencyKey: string): Promise<CreateLibrarySnapshotResult> {
    const client = await getPool().connect();
    const fingerprint = requestFingerprint();
    const snapshotId = randomUUID();
    let globalSlot: number | null = null;

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
                [accountId, idempotencyKey, fingerprint, [LIBRARY_SNAPSHOT_COLLECTION], LIBRARY_SNAPSHOT_SCHEMA_VERSION, snapshotId],
            );
            const row = result.rows[0];
            if (!row) throw new AccountDataSnapshotError("FAILED", "Could not create a snapshot operation.");
            return row;
        });

        if (
            operation.request_fingerprint !== fingerprint
            || operation.schema_version !== LIBRARY_SNAPSHOT_SCHEMA_VERSION
            || operation.collection_names.length !== 1
            || operation.collection_names[0] !== LIBRARY_SNAPSHOT_COLLECTION
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
                if (row.lease_expires_at && new Date(row.lease_expires_at).getTime() > Date.now()) {
                    return { state: "building" as const, snapshotId: operation.snapshot_id };
                }
                // A stale operation is reconciled to a stable terminal result,
                // never rebuilt under the same idempotency key. The client can
                // choose a new key to request a fresh snapshot.
                await client.query(
                    `UPDATE snapshot_private.account_data_snapshot_operations
                     SET status = 'aborted', failure_code = 'SNAPSHOT_WORKER_INTERRUPTED', lease_expires_at = NULL, updated_at = now()
                     WHERE id = $1 AND status = 'building'`,
                    [operation.id],
                );
                return { state: "failed" as const, snapshotId: operation.snapshot_id, code: "SNAPSHOT_WORKER_INTERRUPTED" };
            });
            return existing;
        }

        const lockResult = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [`account-data:${accountId}`]);
        if (!lockResult.rows[0]?.locked) {
            await withRestrictedWorkerTransaction(client, accountId, async () => {
                await persistOperationFailure(client, operation.id, "SNAPSHOT_BUSY");
            });
            return { state: "failed", snapshotId: operation.snapshot_id, code: "SNAPSHOT_BUSY" };
        }

        try {
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
            const startedAt = Date.now();
            const ensureDeadline = () => {
                if (Date.now() - startedAt > 30_000) throw new AccountDataSnapshotError("TIMED_OUT", "SNAPSHOT_TIMED_OUT");
            };
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

                // Admission happens before copying payload rows. Oversized
                // accounts receive a typed result, never a truncated snapshot.
                const preflight = await client.query<{ record_count: number; payload_bytes: number }>(
                `SELECT COUNT(*)::int AS record_count,
                        COALESCE(SUM(octet_length(jsonb_build_object(
                            'content_id', ul.content_id,
                            'is_bookmarked', ul.is_bookmarked,
                            'progress', ul.progress,
                            'last_interacted_at', ul.last_interacted_at,
                            'library_updated_at', ul.library_updated_at,
                            'library_revision', ul.library_revision
                        )::text)), 0)::int AS payload_bytes
                 FROM public.user_library ul
                 WHERE ul.user_id = $1`,
                [accountId],
                );
                const admission = preflight.rows[0];
                if (!admission || admission.record_count > LIBRARY_SNAPSHOT_MAX_RECORDS || admission.payload_bytes > LIBRARY_SNAPSHOT_MAX_BYTES) {
                    throw new AccountDataSnapshotError("TOO_LARGE", "SNAPSHOT_TOO_LARGE");
                }
                ensureDeadline();

                await client.query(
                `INSERT INTO snapshot_private.account_data_snapshots
                    (id, operation_id, account_id, collection_names, schema_version, reset_epoch, boundary_library_revision, status, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'building', $8)
                 ON CONFLICT (id) DO NOTHING`,
                [operation.snapshot_id, operation.id, accountId, [LIBRARY_SNAPSHOT_COLLECTION], LIBRARY_SNAPSHOT_SCHEMA_VERSION, libraryState.reset_epoch, libraryState.current_revision, snapshotExpiry],
                );

                await client.query(
                `INSERT INTO snapshot_private.account_data_snapshot_records (snapshot_id, collection_name, ordinal, record_id, payload)
                 SELECT
                    $1,
                    $2,
                    ROW_NUMBER() OVER (ORDER BY ul.library_updated_at DESC, ul.content_id ASC),
                    ul.content_id::text,
                    jsonb_build_object(
                        'content_id', ul.content_id,
                        'is_bookmarked', ul.is_bookmarked,
                        'progress', ul.progress,
                        'last_interacted_at', ul.last_interacted_at,
                        'library_updated_at', ul.library_updated_at,
                        'library_revision', ul.library_revision
                    )
                 FROM public.user_library ul
                 WHERE ul.user_id = $3
                 ORDER BY ul.library_updated_at DESC, ul.content_id ASC`,
                [operation.snapshot_id, LIBRARY_SNAPSHOT_COLLECTION, accountId],
                );
                ensureDeadline();

                const totals = await client.query<{ record_count: number; payload_bytes: number }>(
                `SELECT COUNT(*)::int AS record_count,
                        COALESCE(SUM(octet_length(payload::text)), 0)::int AS payload_bytes
                 FROM snapshot_private.account_data_snapshot_records
                 WHERE snapshot_id = $1 AND collection_name = $2`,
                [operation.snapshot_id, LIBRARY_SNAPSHOT_COLLECTION],
                );
                const total = totals.rows[0];
                if (!total || total.record_count > LIBRARY_SNAPSHOT_MAX_RECORDS || total.payload_bytes > LIBRARY_SNAPSHOT_MAX_BYTES) {
                    throw new AccountDataSnapshotError("TOO_LARGE", "SNAPSHOT_TOO_LARGE");
                }

                const payloads = await client.query<{ payload: unknown }>(
                `SELECT payload FROM snapshot_private.account_data_snapshot_records
                 WHERE snapshot_id = $1 AND collection_name = $2 ORDER BY ordinal ASC`,
                [operation.snapshot_id, LIBRARY_SNAPSHOT_COLLECTION],
                );
                const manifestHash = createHash("sha256")
                .update(payloads.rows.map((row) => payloadHash(row.payload)).join("\n"))
                    .digest("hex");

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
                 SET record_count = $2, payload_bytes = $3, manifest_hash = $4, status = 'ready'
                 WHERE id = $1`,
                [operation.snapshot_id, total.record_count, total.payload_bytes, manifestHash],
                );
                return {
                    snapshotId: operation.snapshot_id,
                    recordCount: total.record_count,
                    manifestHash,
                    resetEpoch: Number(libraryState.reset_epoch),
                    boundaryLibraryRevision: Number(libraryState.current_revision),
                    expiresAt: snapshotExpiry,
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
            if (globalSlot !== null) {
                await client.query("SELECT pg_advisory_unlock($1, $2)", [91_007, globalSlot]).catch(() => undefined);
            }
            await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`account-data:${accountId}`]).catch(() => undefined);
        }
    } finally {
        client.release();
    }
}

export async function getLibrarySnapshotPage(accountId: string, snapshotId: string, afterOrdinal: number, pageSize: number): Promise<LibrarySnapshotPage> {
    const client = await getPool().connect();
    try {
        return await withRestrictedWorkerTransaction(client, accountId, async () => {
            const manifest = await getReadyManifest(client, accountId, snapshotId);
            if (!manifest) throw new AccountDataSnapshotError("NOT_FOUND", "Snapshot not found.");
            const result = await client.query<{ ordinal: string; payload: Omit<LibrarySnapshotPage["records"][number], "ordinal" | "payloadHash"> }>(
            `SELECT ordinal, payload
             FROM snapshot_private.account_data_snapshot_records
             WHERE snapshot_id = $1 AND collection_name = $2 AND ordinal > $3
             ORDER BY ordinal ASC
             LIMIT $4`,
            [snapshotId, LIBRARY_SNAPSHOT_COLLECTION, afterOrdinal, pageSize + 1],
        );
            const rows = result.rows;
            const hasNextPage = rows.length > pageSize;
            return {
                manifest,
                records: rows.slice(0, pageSize).map((row) => ({
                ...row.payload,
                ordinal: Number(row.ordinal),
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
            `SELECT content_id, is_bookmarked, progress, last_interacted_at, library_updated_at, library_revision
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
    pool = null;
    return activePool?.end();
}
