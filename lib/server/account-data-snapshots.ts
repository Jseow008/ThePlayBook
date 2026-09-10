import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";

export const LIBRARY_SNAPSHOT_COLLECTION = "user_library";
export const LIBRARY_SNAPSHOT_SCHEMA_VERSION = 1;
export const LIBRARY_SNAPSHOT_MAX_RECORDS = 10_000;
export const LIBRARY_SNAPSHOT_MAX_BYTES = 25 * 1024 * 1024;
export const LIBRARY_SNAPSHOT_MAX_ACCOUNT_BYTES = 75 * 1024 * 1024;
export const LIBRARY_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

type OperationStatus = "building" | "ready" | "failed" | "aborted";

type SnapshotOperationRow = {
    id: string;
    snapshot_id: string;
    status: OperationStatus;
    failure_code: string | null;
    request_fingerprint: string;
    collection_names: string[];
    schema_version: number;
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

async function bindRestrictedWorker(client: PoolClient, accountId: string) {
    // The login role may only assume this NOLOGIN role. Every data statement
    // below therefore runs as the restricted worker rather than as postgres.
    await client.query("SET ROLE netflux_snapshot_worker");
    await client.query("SELECT set_config('app.snapshot_account_id', $1, false)", [accountId]);
}

async function releaseRestrictedWorker(client: PoolClient) {
    await client.query("RESET app.snapshot_account_id").catch(() => undefined);
    await client.query("RESET ROLE").catch(() => undefined);
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

async function cleanupExpiredSnapshots(client: PoolClient) {
    try {
        await client.query(
            `DELETE FROM snapshot_private.account_data_snapshots
             WHERE expires_at <= now()`,
        );
        await client.query(
            `DELETE FROM snapshot_private.account_data_snapshot_operations operation
             WHERE operation.status <> 'building'
               AND operation.updated_at < now() - interval '25 hours'
               AND NOT EXISTS (
                   SELECT 1 FROM snapshot_private.account_data_snapshots snapshot
                   WHERE snapshot.operation_id = operation.id
               )`,
        );
    } catch (error) {
        console.error("Account-data snapshot cleanup failed", { error });
        throw new AccountDataSnapshotError("FAILED", "SNAPSHOT_CLEANUP_FAILED");
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
    let operation: SnapshotOperationRow | null = null;

    try {
        await bindRestrictedWorker(client, accountId);
        const operationResult = await client.query<SnapshotOperationRow>(
            `INSERT INTO snapshot_private.account_data_snapshot_operations
                (account_id, idempotency_key, request_fingerprint, collection_names, schema_version, snapshot_id, status, lease_expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'building', now() + interval '30 seconds')
             ON CONFLICT (account_id, idempotency_key) DO UPDATE
             SET updated_at = now()
             RETURNING id, snapshot_id, status, failure_code, request_fingerprint, collection_names, schema_version`,
            [accountId, idempotencyKey, fingerprint, [LIBRARY_SNAPSHOT_COLLECTION], LIBRARY_SNAPSHOT_SCHEMA_VERSION, snapshotId],
        );
        operation = operationResult.rows[0] ?? null;
        if (!operation) throw new AccountDataSnapshotError("FAILED", "Could not create a snapshot operation.");

        if (
            operation.request_fingerprint !== fingerprint
            || operation.schema_version !== LIBRARY_SNAPSHOT_SCHEMA_VERSION
            || operation.collection_names.length !== 1
            || operation.collection_names[0] !== LIBRARY_SNAPSHOT_COLLECTION
        ) {
            throw new AccountDataSnapshotError("IDEMPOTENCY_KEY_REUSED", "This idempotency key belongs to a different snapshot request.");
        }

        const recovered = await getReadyManifest(client, accountId, operation.snapshot_id, true);
        if (recovered) {
            await client.query(
                `UPDATE snapshot_private.account_data_snapshot_operations
                 SET status = 'ready', failure_code = NULL, lease_expires_at = NULL, updated_at = now()
                 WHERE id = $1`,
                [operation.id],
            );
            return { state: "ready", manifest: recovered };
        }

        if (operation.status === "failed" || operation.status === "aborted") {
            return { state: "failed", snapshotId: operation.snapshot_id, code: operation.failure_code ?? "SNAPSHOT_FAILED" };
        }

        const lockResult = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [`account-data:${accountId}`]);
        if (!lockResult.rows[0]?.locked) return { state: "building", snapshotId: operation.snapshot_id };

        try {
            await cleanupExpiredSnapshots(client);
            await client.query(
                `UPDATE snapshot_private.account_data_snapshot_operations
                 SET status = 'building', lease_expires_at = now() + interval '30 seconds', updated_at = now()
                 WHERE id = $1`,
                [operation.id],
            );

            await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
            await client.query("SET LOCAL statement_timeout = '15s'");
            await client.query("SET LOCAL lock_timeout = '2s'");

            const state = await client.query<{ reset_epoch: number; current_revision: number }>(
                `SELECT reset_epoch, current_revision
                 FROM public.account_library_state
                 WHERE user_id = $1`,
                [accountId],
            );
            const libraryState = state.rows[0] ?? { reset_epoch: 0, current_revision: 0 };

            await client.query(
                `INSERT INTO snapshot_private.account_data_snapshots
                    (id, operation_id, account_id, collection_names, schema_version, reset_epoch, boundary_library_revision, status, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'building', $8)
                 ON CONFLICT (id) DO NOTHING`,
                [operation.snapshot_id, operation.id, accountId, [LIBRARY_SNAPSHOT_COLLECTION], LIBRARY_SNAPSHOT_SCHEMA_VERSION, libraryState.reset_epoch, libraryState.current_revision, expiresAt()],
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

            await client.query(
                `UPDATE snapshot_private.account_data_snapshots
                 SET record_count = $2, payload_bytes = $3, manifest_hash = $4, status = 'ready'
                 WHERE id = $1`,
                [operation.snapshot_id, total.record_count, total.payload_bytes, manifestHash],
            );
            await client.query("COMMIT");

            await client.query(
                `UPDATE snapshot_private.account_data_snapshot_operations
                 SET status = 'ready', failure_code = NULL, lease_expires_at = NULL, updated_at = now()
                 WHERE id = $1`,
                [operation.id],
            );

            const manifest = await getReadyManifest(client, accountId, operation.snapshot_id);
            if (!manifest) throw new AccountDataSnapshotError("FAILED", "Snapshot commit did not produce a manifest.");
            return { state: "ready", manifest };
        } catch (error) {
            await client.query("ROLLBACK").catch(() => undefined);
            const code = error instanceof AccountDataSnapshotError
                ? error.code === "TOO_LARGE" ? error.message : error.code === "FAILED" && error.message.startsWith("SNAPSHOT_") ? error.message : error.code
                : (error as { code?: string }).code === "57014" ? "SNAPSHOT_TIMED_OUT" : "SNAPSHOT_FAILED";
            await persistOperationFailure(client, operation.id, code);
            return { state: "failed", snapshotId: operation.snapshot_id, code };
        } finally {
            await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`account-data:${accountId}`]).catch(() => undefined);
        }
    } finally {
        await releaseRestrictedWorker(client);
        client.release();
    }
}

export async function getLibrarySnapshotPage(accountId: string, snapshotId: string, afterOrdinal: number, pageSize: number): Promise<LibrarySnapshotPage> {
    const client = await getPool().connect();
    try {
        await bindRestrictedWorker(client, accountId);
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
        await bindRestrictedWorker(client, accountId);
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
               AND ($2::timestamptz IS NULL OR (library_updated_at, content_id) < ($2::timestamptz, $3::uuid))
             ORDER BY library_updated_at DESC, content_id ASC
             LIMIT $4`,
            [accountId, after?.updatedAt ?? null, after?.contentId ?? null, pageSize + 1],
        );
        const hasNextPage = result.rows.length > pageSize;
        const rows = result.rows.slice(0, pageSize);
        return { rows, hasNextPage };
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
