"use client";

export type LibrarySnapshotRecord = {
    ordinal: number;
    payloadHash: string;
    content_id: string;
    is_bookmarked: boolean | null;
    progress: Record<string, unknown> | null;
    last_interacted_at: string | null;
    library_updated_at: string;
    library_revision: number;
};

type Manifest = {
    snapshotId: string;
    recordCount: number;
    manifestHash: string;
    resetEpoch: number;
    boundaryLibraryRevision: number;
    expiresAt: string;
};

type SnapshotPageResponse = {
    data: LibrarySnapshotRecord[];
    manifest: Manifest;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export class LibrarySnapshotClientError extends Error {
    constructor(message: string, readonly code = "SNAPSHOT_UNAVAILABLE") {
        super(message);
        this.name = "LibrarySnapshotClientError";
    }
}

function getErrorCode(payload: unknown) {
    if (!payload || typeof payload !== "object") return "SNAPSHOT_UNAVAILABLE";
    const error = (payload as { error?: { code?: unknown; details?: { snapshot_error?: unknown } } }).error;
    const snapshotError = error?.details?.snapshot_error;
    if (typeof snapshotError === "string") return snapshotError;
    return typeof error?.code === "string" ? error.code : "SNAPSHOT_UNAVAILABLE";
}

async function responsePayload(response: Response) {
    return response.json().catch(() => null) as Promise<unknown>;
}

async function sha256(value: string) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertSnapshotPage(value: unknown): asserts value is SnapshotPageResponse {
    const candidate = value as Partial<SnapshotPageResponse> | null;
    if (!candidate || !Array.isArray(candidate.data) || !candidate.manifest || !candidate.pageInfo) {
        throw new LibrarySnapshotClientError("The library snapshot response was incomplete.", "SNAPSHOT_INVALID");
    }
}

/**
 * Hydrates only after all pages and the server-issued manifest have been
 * validated. Callers must still discard the result when their auth generation
 * changes before installation.
 */
export async function fetchCompleteLibrarySnapshot(): Promise<{
    manifest: Manifest;
    records: LibrarySnapshotRecord[];
}> {
    const idempotencyKey = crypto.randomUUID();
    const creation = await fetch("/api/account-data/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ idempotencyKey }),
        cache: "no-store",
    });
    const creationPayload = await responsePayload(creation) as {
        state?: "ready" | "building" | "failed";
        manifest?: Manifest;
        snapshotId?: string;
    } | null;

    if (!creation.ok || creationPayload?.state !== "ready" || !creationPayload.manifest) {
        throw new LibrarySnapshotClientError(
            "A complete library snapshot is not available yet. Your existing local library was left unchanged.",
            getErrorCode(creationPayload),
        );
    }

    const manifest = creationPayload.manifest;
    const records: LibrarySnapshotRecord[] = [];
    let cursor: string | null = null;

    do {
        const url = new URL(`/api/account-data/snapshots/${manifest.snapshotId}/user_library`, window.location.origin);
        url.searchParams.set("limit", "200");
        if (cursor) url.searchParams.set("cursor", cursor);

        const response = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-store" } });
        const payload = await responsePayload(response);
        if (!response.ok) {
            throw new LibrarySnapshotClientError("The complete library snapshot could not be read.", getErrorCode(payload));
        }
        assertSnapshotPage(payload);
        if (payload.manifest.snapshotId !== manifest.snapshotId || payload.manifest.manifestHash !== manifest.manifestHash) {
            throw new LibrarySnapshotClientError("The library snapshot changed while it was being read.", "SNAPSHOT_INVALID");
        }

        records.push(...payload.data);
        cursor = payload.pageInfo.hasNextPage ? payload.pageInfo.endCursor : null;
        if (payload.pageInfo.hasNextPage && !cursor) {
            throw new LibrarySnapshotClientError("The library snapshot returned an incomplete page cursor.", "SNAPSHOT_INVALID");
        }
    } while (cursor);

    const uniqueIds = new Set(records.map((record) => record.content_id));
    const strictlyOrdered = records.every((record, index) => record.ordinal === index + 1);
    if (records.length !== manifest.recordCount || uniqueIds.size !== records.length || !strictlyOrdered) {
        throw new LibrarySnapshotClientError("The library snapshot did not contain every record exactly once.", "SNAPSHOT_INVALID");
    }

    const manifestHash = await sha256(records.map((record) => record.payloadHash).join("\n"));
    if (manifestHash !== manifest.manifestHash) {
        throw new LibrarySnapshotClientError("The library snapshot integrity check failed.", "SNAPSHOT_INVALID");
    }

    return { manifest, records };
}
