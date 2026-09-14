/**
 * Stable, database-to-browser representation of a library snapshot record.
 *
 * Snapshot payloads are persisted as JSONB in this exact form, so keeping the
 * wire contract snake-cased prevents a route-level rename from invalidating
 * the client-side integrity hash.
 */
export type LibrarySnapshotWireRecord = {
    ordinal: number;
    payloadHash: string;
    content_id: string;
    is_bookmarked: boolean | null;
    progress: Record<string, unknown> | null;
    last_interacted_at: string | null;
    library_updated_at: string;
    library_revision: number;
};
