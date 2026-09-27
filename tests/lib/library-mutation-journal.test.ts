// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readLibraryIntents, writeLibraryIntent, clearLibraryIntents, journalKey, type LibraryJournalEntry } from "@/lib/library-mutation-journal";
import { bindGuestSource, consumeGuestSource, guestLibrarySources, releaseGuestBinding } from "@/lib/guest-library-import";
import { myListKey, progressKey } from "@/lib/local-user-storage";

const entry = (accountId = "account-a"): LibraryJournalEntry => ({ version: 1, id: crypto.randomUUID(), accountId,
    itemId: "item", sequence: 1, createdAt: new Date().toISOString(), isBookmarked: true, progress: null,
    base: { resetEpoch: 0, libraryRevision: 1 }, status: "pending" });
const values = new Map<string, string>();
const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); }, clear() { values.clear(); },
};
beforeEach(() => storage.clear());
describe("account mutation journal", () => {
    it("preserves independently written intents and clears only the selected account", () => {
        const a = entry(), another = entry(), b = entry("account-b");
        writeLibraryIntent(storage, a); writeLibraryIntent(storage, b); writeLibraryIntent(storage, another);
        expect(readLibraryIntents(storage, a.accountId).entries.map(row => row.id).sort()).toEqual([a.id, another.id].sort());
        clearLibraryIntents(storage, a.accountId);
        expect(readLibraryIntents(storage, b.accountId).entries).toEqual([b]);
    });
    it("refuses a frozen request that disagrees with the displayed intent", () => {
        const original = entry();
        const corrupted = { ...original, request: {
            mutationId: original.id, createdAt: original.createdAt, contentId: original.itemId,
            lastInteractedAt: original.createdAt, baseRevision: 1, resetEpoch: 0,
            isBookmarked: false, progress: null, deleteIfEmpty: true,
        } };
        expect(() => writeLibraryIntent(storage, corrupted)).toThrow("original intent");
        storage.setItem(journalKey(original.accountId, original.id), JSON.stringify(corrupted));
        expect(readLibraryIntents(storage, original.accountId).entries).toEqual([]);
        expect(readLibraryIntents(storage, original.accountId).unreadableKeys).toHaveLength(1);
    });
    it("retains corrupt or mis-scoped records for explicit recovery without dispatching them", () => {
        const a = entry();
        storage.setItem(journalKey(a.accountId, a.id), JSON.stringify({ ...a, accountId: "account-b" }));
        storage.setItem(journalKey(a.accountId, crypto.randomUUID()), "truncated{");
        const recovered = readLibraryIntents(storage, a.accountId);
        expect(recovered.entries).toHaveLength(0); expect(recovered.unreadableKeys).toHaveLength(2);
        expect(storage.length).toBe(2);
    });
});
describe("guest import identity and local cleanup", () => {
    it("reuses source identity after interruption and releases a discarded destination binding", () => {
        storage.setItem(myListKey("guest"), JSON.stringify(["item"]));
        const source = guestLibrarySources(storage)[0];
        const original = bindGuestSource(storage, source, "a", crypto.randomUUID());
        expect(bindGuestSource(storage, source, "a", crypto.randomUUID())).toEqual(original);
        expect(() => bindGuestSource(storage, source, "b", crypto.randomUUID())).toThrow("another account");
        releaseGuestBinding(storage, source.itemId, "a", original.sourceRecordId);
        const moved = bindGuestSource(storage, source, "b", crypto.randomUUID());
        expect(moved.sourceRecordId).toBe(original.sourceRecordId);
        expect(moved.guestStorageId).toBe(original.guestStorageId);
    });
    it("does not erase a guest capture edited after import began", () => {
        storage.setItem(myListKey("guest"), JSON.stringify(["item"]));
        const source = guestLibrarySources(storage)[0];
        storage.setItem(progressKey("guest", "item"), JSON.stringify({ itemId: "item", completed: [], lastSegmentIndex: 1, lastReadAt: new Date().toISOString(), isCompleted: false }));
        consumeGuestSource(storage, source);
        expect(guestLibrarySources(storage)).toHaveLength(1);
        const updated = guestLibrarySources(storage)[0];
        consumeGuestSource(storage, updated);
        expect(guestLibrarySources(storage)).toEqual([]);
    });
});
