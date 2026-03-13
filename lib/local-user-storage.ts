"use client";

export const GUEST_STORAGE_SCOPE = "guest" as const;

export type StorageScope = typeof GUEST_STORAGE_SCOPE | `user:${string}`;

export const LEGACY_MY_LIST_KEY = "flux_mylist";
export const LEGACY_READER_SETTINGS_KEY = "flux_reader_settings";
export const PROGRESS_KEY_PREFIX = "flux_progress_";
export const MY_LIST_KEY_PREFIX = "flux_mylist_";
export const READER_SETTINGS_KEY_PREFIX = "flux_reader_settings_";

export function getStorageScope(userId?: string | null): StorageScope {
    return userId ? `user:${userId}` : GUEST_STORAGE_SCOPE;
}

export function progressKey(scope: StorageScope, itemId: string) {
    return `${PROGRESS_KEY_PREFIX}${scope}_${itemId}`;
}

export function myListKey(scope: StorageScope) {
    return `${MY_LIST_KEY_PREFIX}${scope}`;
}

export function readerSettingsKey(scope: StorageScope) {
    return `${READER_SETTINGS_KEY_PREFIX}${scope}`;
}

export function isScopedProgressKey(key: string) {
    return key.startsWith(`${PROGRESS_KEY_PREFIX}${GUEST_STORAGE_SCOPE}_`)
        || key.startsWith(`${PROGRESS_KEY_PREFIX}user:`);
}

export function isLegacyProgressKey(key: string) {
    return key.startsWith(PROGRESS_KEY_PREFIX) && !isScopedProgressKey(key);
}

export function parseProgressItemId(key: string, scope: StorageScope) {
    const scopedPrefix = `${PROGRESS_KEY_PREFIX}${scope}_`;
    if (!key.startsWith(scopedPrefix)) return null;
    return key.slice(scopedPrefix.length);
}

export function getScopedProgressKeys(storage: Storage, scope: StorageScope) {
    const keys: string[] = [];

    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        if (parseProgressItemId(key, scope) !== null) {
            keys.push(key);
        }
    }

    return keys;
}

export function readScopedMyList(storage: Storage, scope: StorageScope) {
    try {
        const list = JSON.parse(storage.getItem(myListKey(scope)) || "[]");
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

export function writeScopedMyList(storage: Storage, scope: StorageScope, ids: string[]) {
    storage.setItem(myListKey(scope), JSON.stringify(ids));
}

export function clearScopedProgress(storage: Storage, scope: StorageScope) {
    getScopedProgressKeys(storage, scope).forEach((key) => storage.removeItem(key));
}

export function clearScopedUserState(storage: Storage, scope: StorageScope) {
    clearScopedProgress(storage, scope);
    storage.removeItem(myListKey(scope));
    storage.removeItem(readerSettingsKey(scope));
}

export function migrateLegacyStorageToGuest(storage: Storage) {
    const guestScope = getStorageScope(null);

    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key || !isLegacyProgressKey(key)) continue;

        const itemId = key.slice(PROGRESS_KEY_PREFIX.length);
        const guestKey = progressKey(guestScope, itemId);

        if (!storage.getItem(guestKey)) {
            const value = storage.getItem(key);
            if (value !== null) {
                storage.setItem(guestKey, value);
            }
        }
    }

    if (!storage.getItem(myListKey(guestScope))) {
        const legacyMyList = storage.getItem(LEGACY_MY_LIST_KEY);
        if (legacyMyList !== null) {
            storage.setItem(myListKey(guestScope), legacyMyList);
        }
    }

    if (!storage.getItem(readerSettingsKey(guestScope))) {
        const legacyReaderSettings = storage.getItem(LEGACY_READER_SETTINGS_KEY);
        if (legacyReaderSettings !== null) {
            storage.setItem(readerSettingsKey(guestScope), legacyReaderSettings);
        }
    }

    const legacyProgressKeys = getAllLegacyProgressKeys(storage);
    legacyProgressKeys.forEach((key) => storage.removeItem(key));
    storage.removeItem(LEGACY_MY_LIST_KEY);
    storage.removeItem(LEGACY_READER_SETTINGS_KEY);
}

export function getAllLegacyProgressKeys(storage: Storage) {
    const keys: string[] = [];

    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && isLegacyProgressKey(key)) {
            keys.push(key);
        }
    }

    return keys;
}

export function isScopeStorageEventKey(key: string | null, scope: StorageScope) {
    if (key === null) return true;
    return key === myListKey(scope) || key === readerSettingsKey(scope) || parseProgressItemId(key, scope) !== null;
}
