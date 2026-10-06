"use client";

import { z } from "zod";
import type { ReadingProgressData } from "@/hooks/useReadingProgress";
import type { LibraryBoundary } from "@/lib/user-library-mutation-contract";

export const LIBRARY_JOURNAL_PREFIX = "netflux.library-mutation.v1:";
const boundaryPrefix = "netflux.library-boundary.v1:";
const boundarySchema = z.object({ resetEpoch: z.number().int().nonnegative(), libraryRevision: z.number().int().nonnegative() });
const progressSchema = z.object({
    itemId: z.string(), completed: z.array(z.string()), lastSegmentIndex: z.number(),
    lastReadAt: z.string(), isCompleted: z.boolean(),
}).passthrough().nullable();
const guestSchema = z.object({ migrationId: z.string().uuid(), guestStorageId: z.string().uuid(), sourceRecordId: z.string().uuid() });
const requestSchema = z.object({
    mutationId: z.string().uuid(), createdAt: z.string().datetime(), baseRevision: z.number().int().nonnegative(),
    resetEpoch: z.number().int().nonnegative(), contentId: z.string(), isBookmarked: z.boolean(),
    progress: progressSchema, lastInteractedAt: z.string().datetime(), deleteIfEmpty: z.boolean(), guestImport: guestSchema.optional(),
});
const entrySchema = z.object({
    version: z.literal(1), id: z.string().uuid(), accountId: z.string().min(1), itemId: z.string().min(1),
    sequence: z.number().int().nonnegative(), createdAt: z.string().datetime(), isBookmarked: z.boolean(), progress: progressSchema,
    base: boundarySchema.optional(), predecessorId: z.string().uuid().optional(), replacesIntentId: z.string().uuid().optional(),
    request: requestSchema.optional(), guestImport: guestSchema.optional(),
    acknowledgement: boundarySchema.extend({ outcome: z.enum(["applied", "skipped"]).optional(), reason: z.enum(["destination_exists", "source_already_imported"]).optional() }).optional(),
    needsAttention: z.boolean().optional(), status: z.enum(["pending", "needs_attention", "acknowledged"]),
}).superRefine((entry, context) => {
    const request = entry.request;
    if (request && (request.mutationId !== entry.id || request.contentId !== entry.itemId
        || request.createdAt !== entry.createdAt || request.lastInteractedAt !== entry.createdAt
        || request.isBookmarked !== entry.isBookmarked
        || request.deleteIfEmpty !== (!entry.isBookmarked && entry.progress === null)
        || JSON.stringify(request.progress) !== JSON.stringify(entry.progress)
        || JSON.stringify(request.guestImport) !== JSON.stringify(entry.guestImport))) {
        context.addIssue({ code: "custom", message: "Stored request does not match its original intent" });
    }
});
export type LibraryJournalEntry = Omit<z.infer<typeof entrySchema>, "progress" | "request"> & {
    progress: ReadingProgressData | null;
    request?: Omit<z.infer<typeof requestSchema>, "progress"> & { progress: ReadingProgressData | null };
};
export function journalKey(accountId: string, id: string) { return `${LIBRARY_JOURNAL_PREFIX}${accountId}:${id}`; }

// One key per intent prevents two tabs from replacing each other's entire queue.
// A request is frozen before its first send; uncertain responses reuse it exactly.
export function writeLibraryIntent(storage: Storage, entry: LibraryJournalEntry) {
    entrySchema.parse(entry);
    const encoded = JSON.stringify(entry);
    if (encoded.length > 128_000) throw new Error("This change is too large to keep safely on this device.");
    if (storage.getItem(journalKey(entry.accountId, entry.id)) === null && readLibraryIntents(storage, entry.accountId).entries.length >= 1000) {
        throw new Error("Too many pending changes. Review Library sync before adding more.");
    }
    storage.setItem(journalKey(entry.accountId, entry.id), encoded);
}
export function readLibraryIntents(storage: Storage, accountId: string) {
    const entries: LibraryJournalEntry[] = [];
    const unreadableKeys: string[] = [];
    const prefix = `${LIBRARY_JOURNAL_PREFIX}${accountId}:`;
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix)) continue;
        try {
            const parsed = entrySchema.parse(JSON.parse(storage.getItem(key) ?? "null")) as LibraryJournalEntry;
            if (parsed.accountId !== accountId || key !== journalKey(accountId, parsed.id)
                || (parsed.request && (parsed.request.mutationId !== parsed.id || parsed.request.contentId !== parsed.itemId))) throw new Error("Invalid account journal");
            entries.push(parsed);
        } catch { unreadableKeys.push(key); }
    }
    entries.sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return { entries, unreadableKeys };
}
export function removeLibraryIntent(storage: Storage, accountId: string, id: string) { storage.removeItem(journalKey(accountId, id)); }
export function clearLibraryIntents(storage: Storage, accountId: string) {
    const prefix = `${LIBRARY_JOURNAL_PREFIX}${accountId}:`;
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => Boolean(key?.startsWith(prefix)));
    keys.forEach(key => storage.removeItem(key));
}
export function storeLibraryBoundary(storage: Storage, accountId: string, boundary: LibraryBoundary) {
    storage.setItem(boundaryPrefix + accountId, JSON.stringify(boundarySchema.parse(boundary)));
}
export function readLibraryBoundary(storage: Storage, accountId: string): LibraryBoundary | undefined {
    try { return boundarySchema.parse(JSON.parse(storage.getItem(boundaryPrefix + accountId) ?? "null")); } catch { return undefined; }
}
