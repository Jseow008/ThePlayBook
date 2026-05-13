"use client";

export const GUEST_STORAGE_SCOPE = "guest" as const;

export type StorageScope = typeof GUEST_STORAGE_SCOPE | `user:${string}`;

export const LEGACY_MY_LIST_KEY = "netflux_mylist";
export const LEGACY_READER_SETTINGS_KEY = "netflux_reader_settings";
export const PROGRESS_KEY_PREFIX = "netflux_progress_";
export const MY_LIST_KEY_PREFIX = "netflux_mylist_";
export const READER_SETTINGS_KEY_PREFIX = "netflux_reader_settings_";
export const AUDIO_RESUME_KEY_PREFIX = "netflux_audio_resume_";

export interface AudioResumeData {
    currentTimeSec: number;
    lastUpdatedAt: string;
    audioSource: string;
}

function getResumeTimestampMs(value: Pick<AudioResumeData, "lastUpdatedAt"> | null) {
    if (!value?.lastUpdatedAt) {
        return Number.NEGATIVE_INFINITY;
    }

    const parsed = Date.parse(value.lastUpdatedAt);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

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

export function audioResumeKey(scope: StorageScope, itemId: string) {
    return `${AUDIO_RESUME_KEY_PREFIX}${scope}_${itemId}`;
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

export function parseAudioResumeItemId(key: string, scope: StorageScope) {
    const scopedPrefix = `${AUDIO_RESUME_KEY_PREFIX}${scope}_`;
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

export function getScopedAudioResumeKeys(storage: Storage, scope: StorageScope) {
    const keys: string[] = [];

    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key) continue;
        if (parseAudioResumeItemId(key, scope) !== null) {
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

export function readScopedAudioResume(storage: Storage, scope: StorageScope, itemId: string) {
    const key = audioResumeKey(scope, itemId);

    try {
        const raw = storage.getItem(key);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as Partial<AudioResumeData>;
        if (typeof parsed.currentTimeSec !== "number" || !Number.isFinite(parsed.currentTimeSec)) {
            storage.removeItem(key);
            return null;
        }

        return {
            currentTimeSec: parsed.currentTimeSec,
            lastUpdatedAt: typeof parsed.lastUpdatedAt === "string" ? parsed.lastUpdatedAt : "",
            audioSource: typeof parsed.audioSource === "string" ? parsed.audioSource : "",
        } satisfies AudioResumeData;
    } catch {
        storage.removeItem(key);
        return null;
    }
}

export function writeScopedAudioResume(storage: Storage, scope: StorageScope, itemId: string, data: AudioResumeData) {
    storage.setItem(audioResumeKey(scope, itemId), JSON.stringify(data));
}

export function clearScopedAudioResume(storage: Storage, scope: StorageScope, itemId: string) {
    storage.removeItem(audioResumeKey(scope, itemId));
}

export function migrateScopedAudioResume(
    storage: Storage,
    fromScope: StorageScope,
    toScope: StorageScope,
    itemId: string,
) {
    if (fromScope === toScope) {
        return readScopedAudioResume(storage, toScope, itemId);
    }

    const sourceResume = readScopedAudioResume(storage, fromScope, itemId);
    const targetResume = readScopedAudioResume(storage, toScope, itemId);

    if (!sourceResume) {
        return targetResume;
    }

    if (getResumeTimestampMs(targetResume) >= getResumeTimestampMs(sourceResume)) {
        return targetResume;
    }

    writeScopedAudioResume(storage, toScope, itemId, sourceResume);
    return sourceResume;
}

export function writeScopedMyList(storage: Storage, scope: StorageScope, ids: string[]) {
    storage.setItem(myListKey(scope), JSON.stringify(ids));
}

export function clearScopedProgress(storage: Storage, scope: StorageScope) {
    getScopedProgressKeys(storage, scope).forEach((key) => storage.removeItem(key));
}

export function clearScopedReadingHistory(storage: Storage, scope: StorageScope) {
    clearScopedProgress(storage, scope);
    getScopedAudioResumeKeys(storage, scope).forEach((key) => storage.removeItem(key));
    storage.removeItem(myListKey(scope));
}

export function clearScopedUserState(storage: Storage, scope: StorageScope) {
    clearScopedReadingHistory(storage, scope);
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
