"use client";

import { getScopedProgressKeys, parseProgressItemId, progressKey, readScopedMyList, writeScopedMyList } from "@/lib/local-user-storage";
import type { ReadingProgressData } from "@/hooks/useReadingProgress";
import type { LibraryGuestImport } from "@/lib/user-library-mutation-contract";

const identityKey = "netflux.guest-library.identity.v1";
const sourcePrefix = "netflux.guest-library.source.v1:";
export type GuestLibrarySource = { itemId: string; isBookmarked: boolean; progress: ReadingProgressData | null };
export function guestLibrarySources(storage: Storage): GuestLibrarySource[] {
    const bookmarks = readScopedMyList(storage, "guest");
    const ids = new Set([...bookmarks, ...getScopedProgressKeys(storage, "guest").map(key => parseProgressItemId(key, "guest")!).filter(Boolean)]);
    return [...ids].map(itemId => {
        const raw = storage.getItem(progressKey("guest", itemId));
        // Do not silently discard malformed guest captures during import.
        const progress = raw ? JSON.parse(raw) as ReadingProgressData : null;
        if (progress && (typeof progress !== "object" || !Array.isArray(progress.completed) || typeof progress.lastReadAt !== "string")) {
            throw new Error("Some guest reading progress needs repair before it can be imported.");
        }
        return { itemId, isBookmarked: bookmarks.includes(itemId), progress };
    });
}
export function bindGuestSource(storage: Storage, source: GuestLibrarySource, accountId: string, migrationId: string): LibraryGuestImport {
    let guestStorageId = storage.getItem(identityKey);
    if (!guestStorageId) { guestStorageId = crypto.randomUUID(); storage.setItem(identityKey, guestStorageId); }
    const fingerprint = JSON.stringify(source);
    const key = sourcePrefix + source.itemId;
    const previous = JSON.parse(storage.getItem(key) ?? "null") as { fingerprint: string; accountId: string | null; sourceRecordId: string; migrationId: string } | null;
    if (previous?.fingerprint === fingerprint) {
        if (previous.accountId !== null && previous.accountId !== accountId) throw new Error("This guest item is already assigned to another account's import. Finish or discard that import first.");
        if (previous.accountId === null) {
            previous.accountId = accountId; previous.migrationId = migrationId;
            storage.setItem(key, JSON.stringify(previous));
        }
        return { guestStorageId, migrationId: previous.migrationId, sourceRecordId: previous.sourceRecordId };
    }
    const binding = { fingerprint, accountId, sourceRecordId: crypto.randomUUID(), migrationId };
    storage.setItem(key, JSON.stringify(binding));
    return { guestStorageId, migrationId, sourceRecordId: binding.sourceRecordId };
}
export function consumeGuestSource(storage: Storage, source: GuestLibrarySource) {
    const current = guestLibrarySources(storage).find(row => row.itemId === source.itemId);
    if (!current || JSON.stringify(current) !== JSON.stringify(source)) return;
    writeScopedMyList(storage, "guest", readScopedMyList(storage, "guest").filter(id => id !== source.itemId));
    storage.removeItem(progressKey("guest", source.itemId));
    // Keep source identity so a duplicate queue/import cannot become a fresh source.
}

export function releaseGuestBinding(storage: Storage, itemId: string, accountId: string, sourceRecordId: string) {
    const key = sourcePrefix + itemId;
    const binding = JSON.parse(storage.getItem(key) ?? "null");
    if (binding?.accountId === accountId && binding.sourceRecordId === sourceRecordId) {
        storage.setItem(key, JSON.stringify({ ...binding, accountId: null }));
    }
}
