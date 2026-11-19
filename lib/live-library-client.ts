"use client";

import { z } from "zod";
import { fetchCompleteLibrarySnapshot, LibrarySnapshotClientError, retryAfterMs } from "./account-data-client";

const pageSchema = z.object({
    accountId: z.string(),
    boundary: z.object({
        resetEpoch: z.number().int().nonnegative(),
        boundaryLibraryRevision: z.number().int().nonnegative(),
    }),
    data: z.array(z.object({
        content_id: z.guid(),
        is_bookmarked: z.boolean().nullable(),
        progress: z.record(z.string(), z.unknown()).nullable(),
    })),
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
});

export async function fetchLibraryForHydration(
    accountId: string, key: string, onBuilding: () => void, signal: AbortSignal,
) {
    const records: z.infer<typeof pageSchema>["data"] = [];
    const seen = new Set<string>();
    let boundary: z.infer<typeof pageSchema>["boundary"] | undefined;
    let cursor: string | null = null;
    while (true) {
        const query = new URLSearchParams({ limit: "200" });
        if (cursor) query.set("cursor", cursor);
        const response = await fetch(`/api/account-data/user_library?${query}`, { cache: "no-store", signal });
        if (!response.ok) {
            throw new LibrarySnapshotClientError("Could not read the library.", "LIVE_READ_FAILED", response.status, retryAfterMs(response));
        }
        const page = pageSchema.parse(await response.json());
        if (page.accountId !== accountId) throw new LibrarySnapshotClientError("The signed-in account changed.");
        if (boundary && (boundary.resetEpoch !== page.boundary.resetEpoch ||
            boundary.boundaryLibraryRevision !== page.boundary.boundaryLibraryRevision)) {
            // A write crossed page boundaries. Reconcile from an immutable copy.
            return fetchCompleteLibrarySnapshot(key, onBuilding, signal);
        }
        boundary = page.boundary;
        for (const row of page.data) {
            if (seen.has(row.content_id)) throw new LibrarySnapshotClientError("Duplicate library row.");
            seen.add(row.content_id);
            records.push(row);
        }
        if (!page.pageInfo.hasNextPage) return { manifest: boundary, records };
        const next = page.pageInfo.endCursor;
        if (!next || next === cursor || !page.data.length) throw new LibrarySnapshotClientError("Incomplete library page.");
        cursor = next;
    }
}
