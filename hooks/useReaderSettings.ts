"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
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
    setFontSize: (size: FontSize) => void;
    setFontFamily: (family: FontFamily) => void;
    setReaderTheme: (theme: ReaderTheme) => void;
    setLineHeight: (height: LineHeight) => void;
    syncFromCloud: () => Promise<void>;
}

type ReaderSettingsPayload = Pick<
    ReaderSettingsState,
    "fontSize" | "fontFamily" | "readerTheme" | "lineHeight"
>;

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const DEFAULT_READER_SETTINGS: ReaderSettingsPayload = {
    fontSize: "medium",
    fontFamily: "serif",
    readerTheme: "dark",
    lineHeight: "default",
};

let currentScope: StorageScope = getStorageScope(null);
let authSyncInitialized = false;

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

    return true;
}

function hasSettingsPayload(value: Partial<ReaderSettingsPayload> | null): value is Partial<ReaderSettingsPayload> {
    return Boolean(value && Object.keys(value).length > 0);
}

function getReaderSettingsStateStorage(): StateStorage {
    return {
        getItem: () => {
            if (typeof window === "undefined") return null;
            return localStorage.getItem(readerSettingsKey(currentScope));
        },
        setItem: (_name, value) => {
            if (typeof window === "undefined") return;
            localStorage.setItem(readerSettingsKey(currentScope), value);
        },
        removeItem: () => {
            if (typeof window === "undefined") return;
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

function writePersistedReaderSettings(scope: StorageScope, payload: Partial<ReaderSettingsPayload>) {
    if (typeof window === "undefined") return;
    localStorage.setItem(
        readerSettingsKey(scope),
        JSON.stringify({ state: payload, version: 0 }),
    );
}

async function pushToCloud(userId: string, settings: Partial<ReaderSettingsPayload>) {
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
                set({ fontSize: size });
                const nextState = get();
                void pushToCloudForCurrentUser(nextState);
            },
            setFontFamily: (family) => {
                set({ fontFamily: family });
                const nextState = get();
                void pushToCloudForCurrentUser(nextState);
            },
            setReaderTheme: (theme) => {
                set({ readerTheme: theme });
                const nextState = get();
                void pushToCloudForCurrentUser(nextState);
            },
            setLineHeight: (height) => {
                set({ lineHeight: height });
                const nextState = get();
                void pushToCloudForCurrentUser(nextState);
            },
            syncFromCloud: async () => {
                const supabase = createClient();
                const { data, error } = await supabase.auth.getUser();
                if (error) {
                    console.error("Failed to resolve auth state for reader settings:", error);
                }
                await applyReaderSettingsScope(data.user ?? null);
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
            }),
        },
    ),
);

async function pushToCloudForCurrentUser(settings: Partial<ReaderSettingsPayload>) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        console.error("Failed to resolve auth state for reader settings:", error);
        return false;
    }
    if (!data.user) return true;
    return pushToCloud(data.user.id, settings);
}

async function rehydrateReaderSettings(scope: StorageScope) {
    currentScope = scope;
    useReaderSettingsStore.setState(DEFAULT_READER_SETTINGS);
    await useReaderSettingsStore.persist.rehydrate();
}

function importGuestReaderSettings(scope: StorageScope) {
    if (typeof window === "undefined" || scope === GUEST_STORAGE_SCOPE) return false;

    const guestSettings = readPersistedReaderSettings(GUEST_STORAGE_SCOPE);
    const scopedSettings = readPersistedReaderSettings(scope);

    if (!hasSettingsPayload(guestSettings)) return false;
    if (hasSettingsPayload(scopedSettings)) return false;

    writePersistedReaderSettings(scope, guestSettings);
    return true;
}

async function syncReaderSettingsWithCloud(user: User, scope: StorageScope) {
    try {
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
        if (isReaderSettingsPayload(profile?.reader_settings) && hasSettingsPayload(profile.reader_settings)) {
            useReaderSettingsStore.setState({
                fontSize: profile.reader_settings.fontSize || DEFAULT_READER_SETTINGS.fontSize,
                fontFamily: profile.reader_settings.fontFamily || DEFAULT_READER_SETTINGS.fontFamily,
                readerTheme: profile.reader_settings.readerTheme || DEFAULT_READER_SETTINGS.readerTheme,
                lineHeight: profile.reader_settings.lineHeight || DEFAULT_READER_SETTINGS.lineHeight,
            });
            return true;
        }

        const localSettings = readPersistedReaderSettings(scope);
        if (hasSettingsPayload(localSettings)) {
            return pushToCloud(user.id, localSettings);
        }

        return true;
    } catch (error) {
        console.error("Failed to sync reader settings from cloud:", error);
        return false;
    }
}

async function applyReaderSettingsScope(user: User | null) {
    if (typeof window === "undefined") return;

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

    supabase.auth.getUser().then(({ data, error }) => {
        if (error) {
            console.error("Failed to resolve auth state for reader settings:", error);
        }
        void applyReaderSettingsScope(data.user ?? null);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        void applyReaderSettingsScope(session?.user ?? null);
    });
}

export function useReaderSettings() {
    useEffect(() => {
        ensureReaderSettingsAuthSync();
    }, []);

    return useReaderSettingsStore();
}
