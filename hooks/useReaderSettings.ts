"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import type { Database } from "@/types/database";
import {
    getStorageScope,
    migrateLegacyStorageToGuest,
    readerSettingsKey,
    type StorageScope,
    GUEST_STORAGE_SCOPE,
} from "@/lib/local-user-storage";

export type FontSize = "small" | "medium" | "large";
export type FontFamily = "sans" | "serif";
export type ReaderTheme = "dark" | "light" | "sepia";
export type LineHeight = "compact" | "default" | "relaxed";

interface ReaderSettingsState {
    fontSize: FontSize;
    fontFamily: FontFamily;
    readerTheme: ReaderTheme;
    lineHeight: LineHeight;
    updatedAt: string;
    setFontSize: (size: FontSize) => void;
    setFontFamily: (family: FontFamily) => void;
    setReaderTheme: (theme: ReaderTheme) => void;
    setLineHeight: (height: LineHeight) => void;
    syncFromCloud: () => Promise<void>;
}

type ReaderSettingsFields = Pick<
    ReaderSettingsState,
    "fontSize" | "fontFamily" | "readerTheme" | "lineHeight"
>;

type ReaderSettingsPayload = Partial<ReaderSettingsFields> & {
    updatedAt?: string;
};

type NormalizedReaderSettingsPayload = ReaderSettingsFields & {
    updatedAt: string;
};

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const DEFAULT_READER_SETTINGS: NormalizedReaderSettingsPayload = {
    fontSize: "medium",
    fontFamily: "serif",
    readerTheme: "dark",
    lineHeight: "default",
    updatedAt: "",
};

let currentScope: StorageScope = getStorageScope(null);
let authSyncInitialized = false;
let suppressStorageWrites = false;
let currentReaderSettingsUserId: string | null | undefined = undefined;

function isReaderSettingsPayload(value: unknown): value is Partial<ReaderSettingsPayload> {
    if (!value || typeof value !== "object") return false;

    const candidate = value as Record<string, unknown>;
    const validFontSize = ["small", "medium", "large"];
    const validFontFamily = ["sans", "serif"];
    const validReaderTheme = ["dark", "light", "sepia"];
    const validLineHeight = ["compact", "default", "relaxed"];

    if (candidate.fontSize !== undefined && !validFontSize.includes(String(candidate.fontSize))) return false;
    if (candidate.fontFamily !== undefined && !validFontFamily.includes(String(candidate.fontFamily))) return false;
    if (candidate.readerTheme !== undefined && !validReaderTheme.includes(String(candidate.readerTheme))) return false;
    if (candidate.lineHeight !== undefined && !validLineHeight.includes(String(candidate.lineHeight))) return false;
    if (candidate.updatedAt !== undefined && typeof candidate.updatedAt !== "string") return false;

    return true;
}

function hasSettingsPayload(value: Partial<ReaderSettingsPayload> | null): value is Partial<ReaderSettingsPayload> {
    return Boolean(
        value
        && (
            value.fontSize !== undefined
            || value.fontFamily !== undefined
            || value.readerTheme !== undefined
            || value.lineHeight !== undefined
        ),
    );
}

function toReaderSettingsFields(value: Partial<ReaderSettingsPayload> | ReaderSettingsState): ReaderSettingsFields {
    return {
        fontSize: value.fontSize ?? DEFAULT_READER_SETTINGS.fontSize,
        fontFamily: value.fontFamily ?? DEFAULT_READER_SETTINGS.fontFamily,
        readerTheme: value.readerTheme ?? DEFAULT_READER_SETTINGS.readerTheme,
        lineHeight: value.lineHeight ?? DEFAULT_READER_SETTINGS.lineHeight,
    };
}

function normalizeReaderSettingsPayload(
    value: Partial<ReaderSettingsPayload> | ReaderSettingsState,
    fallbackUpdatedAt?: string,
): NormalizedReaderSettingsPayload {
    return {
        ...toReaderSettingsFields(value),
        updatedAt: value.updatedAt || fallbackUpdatedAt || new Date().toISOString(),
    };
}

function areReaderSettingsEqual(a: Partial<ReaderSettingsPayload>, b: Partial<ReaderSettingsPayload>) {
    return (
        (a.fontSize ?? DEFAULT_READER_SETTINGS.fontSize) === (b.fontSize ?? DEFAULT_READER_SETTINGS.fontSize)
        && (a.fontFamily ?? DEFAULT_READER_SETTINGS.fontFamily) === (b.fontFamily ?? DEFAULT_READER_SETTINGS.fontFamily)
        && (a.readerTheme ?? DEFAULT_READER_SETTINGS.readerTheme) === (b.readerTheme ?? DEFAULT_READER_SETTINGS.readerTheme)
        && (a.lineHeight ?? DEFAULT_READER_SETTINGS.lineHeight) === (b.lineHeight ?? DEFAULT_READER_SETTINGS.lineHeight)
    );
}

function getTimestampMs(value?: string) {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function resolveReaderSettingsConflict(
    localSettings: Partial<ReaderSettingsPayload> | null,
    cloudSettings: Partial<ReaderSettingsPayload> | null,
): {
    payload: NormalizedReaderSettingsPayload | null;
    source: "local" | "cloud" | null;
    shouldWriteLocal: boolean;
    shouldWriteCloud: boolean;
} {
    const hasLocal = hasSettingsPayload(localSettings);
    const hasCloud = hasSettingsPayload(cloudSettings);

    if (!hasLocal && !hasCloud) {
        return {
            payload: null,
            source: null,
            shouldWriteLocal: false,
            shouldWriteCloud: false,
        };
    }

    if (hasLocal && !hasCloud) {
        return {
            payload: normalizeReaderSettingsPayload(localSettings),
            source: "local",
            shouldWriteLocal: !Boolean(localSettings?.updatedAt),
            shouldWriteCloud: true,
        };
    }

    if (!hasLocal && hasCloud) {
        return {
            payload: normalizeReaderSettingsPayload(cloudSettings),
            source: "cloud",
            shouldWriteLocal: true,
            shouldWriteCloud: !Boolean(cloudSettings?.updatedAt),
        };
    }

    const localTimestamp = getTimestampMs(localSettings?.updatedAt);
    const cloudTimestamp = getTimestampMs(cloudSettings?.updatedAt);

    if (localTimestamp !== null && cloudTimestamp !== null) {
        const source = localTimestamp >= cloudTimestamp ? "local" : "cloud";
        return {
            payload: normalizeReaderSettingsPayload(source === "local" ? localSettings! : cloudSettings!),
            source,
            shouldWriteLocal: source === "cloud",
            shouldWriteCloud: source === "local",
        };
    }

    if (localTimestamp !== null) {
        return {
            payload: normalizeReaderSettingsPayload(localSettings!),
            source: "local",
            shouldWriteLocal: false,
            shouldWriteCloud: true,
        };
    }

    if (cloudTimestamp !== null) {
        return {
            payload: normalizeReaderSettingsPayload(cloudSettings!),
            source: "cloud",
            shouldWriteLocal: true,
            shouldWriteCloud: false,
        };
    }

    const preferLocal = !areReaderSettingsEqual(localSettings!, cloudSettings!);
    const payload = normalizeReaderSettingsPayload(preferLocal ? localSettings! : cloudSettings!);

    return {
        payload,
        source: preferLocal ? "local" : "cloud",
        shouldWriteLocal: true,
        shouldWriteCloud: true,
    };
}

function applyReaderSettingsPayload(payload: NormalizedReaderSettingsPayload) {
    useReaderSettingsStore.setState(payload);
}

function getReaderSettingsStateStorage(): StateStorage {
    return {
        getItem: () => {
            if (typeof window === "undefined") return null;
            return localStorage.getItem(readerSettingsKey(currentScope));
        },
        setItem: (_name, value) => {
            if (typeof window === "undefined") return;
            if (suppressStorageWrites) return;
            localStorage.setItem(readerSettingsKey(currentScope), value);
        },
        removeItem: () => {
            if (typeof window === "undefined") return;
            if (suppressStorageWrites) return;
            localStorage.removeItem(readerSettingsKey(currentScope));
        },
    };
}

function readPersistedReaderSettings(scope: StorageScope) {
    if (typeof window === "undefined") return null;

    try {
        const raw = localStorage.getItem(readerSettingsKey(scope));
        if (!raw) return null;

        const parsed = JSON.parse(raw) as { state?: unknown };
        if (!isReaderSettingsPayload(parsed.state)) return null;
        return parsed.state;
    } catch {
        return null;
    }
}

function writePersistedReaderSettings(scope: StorageScope, payload: ReaderSettingsPayload) {
    if (typeof window === "undefined") return;
    localStorage.setItem(
        readerSettingsKey(scope),
        JSON.stringify({ state: payload, version: 0 }),
    );
}

async function pushToCloud(userId: string, settings: ReaderSettingsPayload) {
    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("profiles")
            // @ts-expect-error - generated profile types lag the schema additions
            .update({ reader_settings: settings })
            .eq("id", userId);

        if (error) {
            console.error("Failed to push reader settings to cloud:", error);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Failed to push reader settings to cloud:", error);
        return false;
    }
}

const useReaderSettingsStore = create<ReaderSettingsState>()(
    persist(
        (set, get) => ({
            ...DEFAULT_READER_SETTINGS,
            setFontSize: (size) => {
                const nextState = normalizeReaderSettingsPayload({ ...get(), fontSize: size });
                set(nextState);
                void pushToCloudForCurrentUser(nextState);
            },
            setFontFamily: (family) => {
                const nextState = normalizeReaderSettingsPayload({ ...get(), fontFamily: family });
                set(nextState);
                void pushToCloudForCurrentUser(nextState);
            },
            setReaderTheme: (theme) => {
                const nextState = normalizeReaderSettingsPayload({ ...get(), readerTheme: theme });
                set(nextState);
                void pushToCloudForCurrentUser(nextState);
            },
            setLineHeight: (height) => {
                const nextState = normalizeReaderSettingsPayload({ ...get(), lineHeight: height });
                set(nextState);
                void pushToCloudForCurrentUser(nextState);
            },
            syncFromCloud: async () => {
                const supabase = createClient();
                const { user, error } = resolveAuthUserResult(await supabase.auth.getUser());
                if (error) {
                    console.error("Failed to resolve auth state for reader settings:", error);
                }
                await applyReaderSettingsScope(user);
            },
        }),
        {
            name: "flux_reader_settings",
            storage: createJSONStorage(getReaderSettingsStateStorage),
            partialize: (state) => ({
                fontSize: state.fontSize,
                fontFamily: state.fontFamily,
                readerTheme: state.readerTheme,
                lineHeight: state.lineHeight,
                updatedAt: state.updatedAt,
            }),
        },
    ),
);

async function pushToCloudForCurrentUser(settings: ReaderSettingsPayload) {
    if (currentReaderSettingsUserId !== undefined) {
        if (!currentReaderSettingsUserId) return true;
        return pushToCloud(currentReaderSettingsUserId, settings);
    }

    const supabase = createClient();
    const { user, error } = resolveAuthUserResult(await supabase.auth.getUser());
    if (error) {
        console.error("Failed to resolve auth state for reader settings:", error);
        return false;
    }
    currentReaderSettingsUserId = user?.id ?? null;
    if (!user) return true;
    return pushToCloud(user.id, settings);
}

async function rehydrateReaderSettings(scope: StorageScope) {
    currentScope = scope;
    suppressStorageWrites = true;
    try {
        useReaderSettingsStore.setState(DEFAULT_READER_SETTINGS);
    } finally {
        suppressStorageWrites = false;
    }
    await useReaderSettingsStore.persist.rehydrate();
}

function importGuestReaderSettings(scope: StorageScope) {
    if (typeof window === "undefined" || scope === GUEST_STORAGE_SCOPE) return false;

    const guestSettings = readPersistedReaderSettings(GUEST_STORAGE_SCOPE);
    const scopedSettings = readPersistedReaderSettings(scope);

    if (!hasSettingsPayload(guestSettings)) return false;
    if (hasSettingsPayload(scopedSettings)) return false;

    writePersistedReaderSettings(scope, normalizeReaderSettingsPayload(guestSettings));
    return true;
}

async function syncReaderSettingsWithCloud(user: User, scope: StorageScope) {
    try {
        const localSettings = readPersistedReaderSettings(scope);
        const supabase = createClient();
        const { data, error } = await supabase
            .from("profiles")
            .select("reader_settings")
            .eq("id", user.id)
            .single();

        if (error) {
            console.error("Failed to sync reader settings from cloud:", error);
            return false;
        }

        const profile = (data ?? null) as Pick<ProfileRow, "reader_settings"> | null;
        const cloudSettings = isReaderSettingsPayload(profile?.reader_settings)
            ? profile.reader_settings
            : null;
        const resolution = resolveReaderSettingsConflict(localSettings, cloudSettings);

        if (!resolution.payload) {
            return true;
        }

        applyReaderSettingsPayload(resolution.payload);

        let syncSucceeded = true;

        if (resolution.shouldWriteLocal) {
            writePersistedReaderSettings(scope, resolution.payload);
        }

        if (resolution.shouldWriteCloud) {
            syncSucceeded = await pushToCloud(user.id, resolution.payload);
        }

        return syncSucceeded;
    } catch (error) {
        console.error("Failed to sync reader settings from cloud:", error);
        return false;
    }
}

async function applyReaderSettingsScope(user: User | null) {
    if (typeof window === "undefined") return;

    currentReaderSettingsUserId = user?.id ?? null;
    migrateLegacyStorageToGuest(localStorage);

    const nextScope = getStorageScope(user?.id);
    const importedGuestSettings = user ? importGuestReaderSettings(nextScope) : false;

    await rehydrateReaderSettings(nextScope);

    if (!user) return;

    const syncSucceeded = await syncReaderSettingsWithCloud(user, nextScope);

    if (importedGuestSettings && syncSucceeded) {
        localStorage.removeItem(readerSettingsKey(GUEST_STORAGE_SCOPE));
    }
}

function ensureReaderSettingsAuthSync() {
    if (typeof window === "undefined" || authSyncInitialized) return;

    authSyncInitialized = true;

    const supabase = createClient();

    supabase.auth.getUser().then((result) => {
        const { user, error } = resolveAuthUserResult(result);
        if (error) {
            console.error("Failed to resolve auth state for reader settings:", error);
        }
        currentReaderSettingsUserId = user?.id ?? null;
        void applyReaderSettingsScope(user);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        currentReaderSettingsUserId = session?.user?.id ?? null;
        void applyReaderSettingsScope(session?.user ?? null);
    });
}

export function useReaderSettings() {
    useEffect(() => {
        ensureReaderSettingsAuthSync();
    }, []);

    return useReaderSettingsStore();
}
