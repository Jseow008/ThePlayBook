"use client";

import {
    ACCOUNT_DATA_EXPORT_COLLECTIONS,
    type AccountDataSnapshotCollection,
} from "@/lib/account-data-snapshot-collections";

type CollectionManifest = { recordCount: number; manifestHash: string };

type SnapshotManifest = {
    snapshotId: string;
    recordCount: number;
    manifestHash: string;
    resetEpoch: number;
    boundaryLibraryRevision: number;
    expiresAt: string;
    schemaVersion: number;
    collectionManifests: Partial<Record<AccountDataSnapshotCollection, CollectionManifest>>;
};

type ExportRecord = {
    ordinal: number;
    recordId: string;
    payload: Record<string, unknown>;
    payloadHash: string;
};

type SnapshotPage = {
    data: unknown[];
    manifest: SnapshotManifest;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export class AccountDataExportError extends Error {
    constructor(message: string, readonly code = "EXPORT_UNAVAILABLE") {
        super(message);
        this.name = "AccountDataExportError";
    }
}

function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

async function sha256(value: string) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function responseErrorCode(value: unknown) {
    const candidate = value as { error?: { code?: unknown; details?: { snapshot_error?: unknown } } } | null;
    const detail = candidate?.error?.details?.snapshot_error;
    return typeof detail === "string" ? detail : typeof candidate?.error?.code === "string" ? candidate.error.code : "EXPORT_UNAVAILABLE";
}

function assertPage(value: unknown): asserts value is SnapshotPage {
    const page = value as Partial<SnapshotPage> | null;
    if (!page || !Array.isArray(page.data) || !page.manifest || !page.pageInfo) {
        throw new AccountDataExportError("The export snapshot response was incomplete.", "SNAPSHOT_INVALID");
    }
}

function toExportRecord(collection: AccountDataSnapshotCollection, value: unknown): ExportRecord {
    const row = value as Partial<ExportRecord> & Record<string, unknown>;
    if (collection === "user_library") {
        const { ordinal, payloadHash, ...payload } = row;
        if (typeof ordinal !== "number" || typeof payloadHash !== "string" || typeof payload.content_id !== "string") {
            throw new AccountDataExportError("The library export record was malformed.", "SNAPSHOT_INVALID");
        }
        return { ordinal, recordId: payload.content_id, payload, payloadHash };
    }
    if (
        typeof row.ordinal !== "number"
        || typeof row.recordId !== "string"
        || typeof row.payloadHash !== "string"
        || !row.payload
        || typeof row.payload !== "object"
        || Array.isArray(row.payload)
    ) {
        throw new AccountDataExportError("An export record was malformed.", "SNAPSHOT_INVALID");
    }
    return row as ExportRecord;
}

/**
 * Builds a downloadable export only after every persisted snapshot page and
 * per-collection manifest is verified. It intentionally never falls back to
 * direct browser table reads or a best-effort partial result.
 */
export async function fetchVerifiedAccountDataExport() {
    const idempotencyKey = crypto.randomUUID();
    const creation = await fetch("/api/account-data/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ idempotencyKey, collections: ACCOUNT_DATA_EXPORT_COLLECTIONS }),
        cache: "no-store",
    });
    const creationPayload = await creation.json().catch(() => null) as { state?: string; manifest?: SnapshotManifest } | null;
    if (!creation.ok || creationPayload?.state !== "ready" || !creationPayload.manifest) {
        throw new AccountDataExportError("A complete export snapshot is not available yet.", responseErrorCode(creationPayload));
    }

    const manifest = creationPayload.manifest;
    const data: Record<AccountDataSnapshotCollection, Record<string, unknown>[]> = {} as Record<AccountDataSnapshotCollection, Record<string, unknown>[]>;
    const allPayloadHashes: string[] = [];

    for (const collection of ACCOUNT_DATA_EXPORT_COLLECTIONS) {
        const expected = manifest.collectionManifests?.[collection];
        if (!expected) throw new AccountDataExportError(`The ${collection} export manifest is missing.`, "SNAPSHOT_INVALID");

        const records: ExportRecord[] = [];
        let cursor: string | null = null;
        do {
            const url = new URL(`/api/account-data/snapshots/${manifest.snapshotId}/${collection}`, window.location.origin);
            url.searchParams.set("limit", "200");
            if (cursor) url.searchParams.set("cursor", cursor);
            const response = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-store" } });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new AccountDataExportError("The export snapshot could not be read.", responseErrorCode(payload));
            assertPage(payload);
            if (payload.manifest.snapshotId !== manifest.snapshotId || payload.manifest.manifestHash !== manifest.manifestHash) {
                throw new AccountDataExportError("The export snapshot changed while it was being read.", "SNAPSHOT_INVALID");
            }
            records.push(...payload.data.map((row) => toExportRecord(collection, row)));
            cursor = payload.pageInfo.hasNextPage ? payload.pageInfo.endCursor : null;
            if (payload.pageInfo.hasNextPage && !cursor) throw new AccountDataExportError("The export page cursor was incomplete.", "SNAPSHOT_INVALID");
        } while (cursor);

        const uniqueIds = new Set(records.map((record) => record.recordId));
        const ordered = records.every((record, index) => record.ordinal === index + 1);
        if (records.length !== expected.recordCount || uniqueIds.size !== records.length || !ordered) {
            throw new AccountDataExportError(`The ${collection} export did not contain every record exactly once.`, "SNAPSHOT_INVALID");
        }
        const hashes = await Promise.all(records.map(async (record) => {
            const computed = await sha256(canonicalJson(record.payload));
            if (computed !== record.payloadHash) throw new AccountDataExportError(`The ${collection} export failed integrity verification.`, "SNAPSHOT_INVALID");
            return computed;
        }));
        if (await sha256(hashes.join("\n")) !== expected.manifestHash) {
            throw new AccountDataExportError(`The ${collection} export manifest failed integrity verification.`, "SNAPSHOT_INVALID");
        }
        allPayloadHashes.push(...hashes);
        data[collection] = records.map((record) => record.payload);
    }

    if (allPayloadHashes.length !== manifest.recordCount || await sha256(allPayloadHashes.join("\n")) !== manifest.manifestHash) {
        throw new AccountDataExportError("The complete export manifest failed integrity verification.", "SNAPSHOT_INVALID");
    }

    return {
        export_date: new Date().toISOString(),
        schema_version: manifest.schemaVersion,
        snapshot: {
            id: manifest.snapshotId,
            expires_at: manifest.expiresAt,
            reset_epoch: manifest.resetEpoch,
            boundary_library_revision: manifest.boundaryLibraryRevision,
            collection_manifests: manifest.collectionManifests,
        },
        data,
    };
}
