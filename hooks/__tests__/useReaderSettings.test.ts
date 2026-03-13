// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    GUEST_STORAGE_SCOPE,
    getStorageScope,
    readerSettingsKey,
} from "@/lib/local-user-storage";

type ReaderSettingsPayload = {
    fontSize: "small" | "medium" | "large";
    fontFamily: "sans" | "serif";
    readerTheme: "dark" | "light" | "sepia";
    lineHeight: "compact" | "default" | "relaxed";
    updatedAt?: string;
};

let authStateChangeHandler: ((event: string, session: { user: { id: string } | null } | null) => void) | null = null;
let currentAuthUser: { id: string } | null = null;
let currentCloudReaderSettings: Partial<ReaderSettingsPayload> | null = null;
const profileUpdateMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            onAuthStateChange: vi.fn((callback: (event: string, session: { user: { id: string } | null } | null) => void) => {
                authStateChangeHandler = callback;
                return {
                    data: {
                        subscription: {
                            unsubscribe: vi.fn(),
                        },
                    },
                };
            }),
            getUser: vi.fn(() => Promise.resolve({ data: { user: currentAuthUser }, error: null })),
        },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({
                        data: { reader_settings: currentCloudReaderSettings },
                        error: null,
                    })),
                })),
            })),
            update: vi.fn((payload: { reader_settings: Partial<ReaderSettingsPayload> }) => {
                profileUpdateMock(payload.reader_settings);
                currentCloudReaderSettings = payload.reader_settings;

                return {
                    eq: vi.fn(() => Promise.resolve({ error: null })),
                };
            }),
        })),
    }),
}));

const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        get length() {
            return Object.keys(store).length;
        },
        key: vi.fn((index: number) => Object.keys(store)[index] || null),
    };
})();

Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
});

function createPersistedSettings(settings: ReaderSettingsPayload) {
    return JSON.stringify({ state: settings, version: 0 });
}

async function loadUseReaderSettings() {
    const hookModule = await import("../useReaderSettings");
    return hookModule.useReaderSettings;
}

describe("useReaderSettings", () => {
    beforeEach(() => {
        authStateChangeHandler = null;
        currentAuthUser = null;
        currentCloudReaderSettings = null;
        window.localStorage.clear();
        vi.clearAllMocks();
        vi.resetModules();
    });

    it("preserves guest reader settings across bootstrap and remount", async () => {
        const guestSettings: ReaderSettingsPayload = {
            fontSize: "large",
            fontFamily: "serif",
            readerTheme: "light",
            lineHeight: "relaxed",
            updatedAt: "2026-03-13T12:00:00.000Z",
        };
        const persistedSettings = createPersistedSettings(guestSettings);

        localStorage.setItem(readerSettingsKey(GUEST_STORAGE_SCOPE), persistedSettings);

        const useReaderSettings = await loadUseReaderSettings();
        const firstRender = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(firstRender.result.current.fontSize).toBe("large");
            expect(firstRender.result.current.fontFamily).toBe("serif");
            expect(firstRender.result.current.readerTheme).toBe("light");
            expect(firstRender.result.current.lineHeight).toBe("relaxed");
        });

        expect(localStorage.getItem(readerSettingsKey(GUEST_STORAGE_SCOPE))).toBe(persistedSettings);

        firstRender.unmount();

        const secondRender = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(secondRender.result.current.fontSize).toBe("large");
            expect(secondRender.result.current.fontFamily).toBe("serif");
            expect(secondRender.result.current.readerTheme).toBe("light");
            expect(secondRender.result.current.lineHeight).toBe("relaxed");
        });

        expect(localStorage.getItem(readerSettingsKey(GUEST_STORAGE_SCOPE))).toBe(persistedSettings);
    });

    it("imports guest reader settings into a signed-in scope without resetting them to defaults", async () => {
        const guestSettings: ReaderSettingsPayload = {
            fontSize: "medium",
            fontFamily: "serif",
            readerTheme: "light",
            lineHeight: "relaxed",
            updatedAt: "2026-03-13T12:05:00.000Z",
        };

        localStorage.setItem(
            readerSettingsKey(GUEST_STORAGE_SCOPE),
            createPersistedSettings(guestSettings),
        );

        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(result.current.readerTheme).toBe("light");
            expect(result.current.lineHeight).toBe("relaxed");
        });

        currentAuthUser = { id: "user-a" };

        await act(async () => {
            await authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser });
        });

        await waitFor(() => {
            expect(result.current.fontSize).toBe("medium");
            expect(result.current.fontFamily).toBe("serif");
            expect(result.current.readerTheme).toBe("light");
            expect(result.current.lineHeight).toBe("relaxed");
        });

        const scopedKey = readerSettingsKey(getStorageScope("user-a"));
        expect(localStorage.getItem(scopedKey)).toBe(createPersistedSettings(guestSettings));
        expect(localStorage.getItem(readerSettingsKey(GUEST_STORAGE_SCOPE))).toBeNull();
        expect(profileUpdateMock).toHaveBeenCalledWith(guestSettings);
    });

    it("keeps newer local signed-in settings and pushes them to cloud", async () => {
        const localSettings: ReaderSettingsPayload = {
            fontSize: "large",
            fontFamily: "sans",
            readerTheme: "sepia",
            lineHeight: "compact",
            updatedAt: "2026-03-13T12:20:00.000Z",
        };
        const staleCloudSettings: ReaderSettingsPayload = {
            fontSize: "small",
            fontFamily: "serif",
            readerTheme: "dark",
            lineHeight: "default",
            updatedAt: "2026-03-13T12:10:00.000Z",
        };

        currentAuthUser = { id: "user-a" };
        currentCloudReaderSettings = staleCloudSettings;
        localStorage.setItem(
            readerSettingsKey(getStorageScope("user-a")),
            createPersistedSettings(localSettings),
        );

        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(result.current.fontSize).toBe("large");
            expect(result.current.fontFamily).toBe("sans");
            expect(result.current.readerTheme).toBe("sepia");
            expect(result.current.lineHeight).toBe("compact");
        });

        expect(profileUpdateMock).toHaveBeenCalledWith(localSettings);
        expect(localStorage.getItem(readerSettingsKey(getStorageScope("user-a")))).toBe(
            createPersistedSettings(localSettings),
        );
    });

    it("applies newer cloud settings to local signed-in storage", async () => {
        const localSettings: ReaderSettingsPayload = {
            fontSize: "small",
            fontFamily: "sans",
            readerTheme: "dark",
            lineHeight: "compact",
            updatedAt: "2026-03-13T12:10:00.000Z",
        };
        const cloudSettings: ReaderSettingsPayload = {
            fontSize: "large",
            fontFamily: "serif",
            readerTheme: "light",
            lineHeight: "relaxed",
            updatedAt: "2026-03-13T12:30:00.000Z",
        };

        currentAuthUser = { id: "user-a" };
        currentCloudReaderSettings = cloudSettings;
        localStorage.setItem(
            readerSettingsKey(getStorageScope("user-a")),
            createPersistedSettings(localSettings),
        );

        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(result.current.fontSize).toBe("large");
            expect(result.current.fontFamily).toBe("serif");
            expect(result.current.readerTheme).toBe("light");
            expect(result.current.lineHeight).toBe("relaxed");
        });

        expect(profileUpdateMock).not.toHaveBeenCalled();
        expect(localStorage.getItem(readerSettingsKey(getStorageScope("user-a")))).toBe(
            createPersistedSettings(cloudSettings),
        );
    });

    it("prefers timestamped cloud settings over untimestamped local legacy settings", async () => {
        const legacyLocalSettings: ReaderSettingsPayload = {
            fontSize: "large",
            fontFamily: "sans",
            readerTheme: "sepia",
            lineHeight: "compact",
        };
        const cloudSettings: ReaderSettingsPayload = {
            fontSize: "medium",
            fontFamily: "serif",
            readerTheme: "light",
            lineHeight: "relaxed",
            updatedAt: "2026-03-13T12:40:00.000Z",
        };

        currentAuthUser = { id: "user-a" };
        currentCloudReaderSettings = cloudSettings;
        localStorage.setItem(
            readerSettingsKey(getStorageScope("user-a")),
            createPersistedSettings(legacyLocalSettings),
        );

        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(result.current.fontSize).toBe("medium");
            expect(result.current.fontFamily).toBe("serif");
            expect(result.current.readerTheme).toBe("light");
            expect(result.current.lineHeight).toBe("relaxed");
        });

        expect(localStorage.getItem(readerSettingsKey(getStorageScope("user-a")))).toBe(
            createPersistedSettings(cloudSettings),
        );
        expect(profileUpdateMock).not.toHaveBeenCalled();
    });

    it("prefers local legacy settings once when both local and cloud are untimestamped and differ", async () => {
        const legacyLocalSettings: ReaderSettingsPayload = {
            fontSize: "large",
            fontFamily: "sans",
            readerTheme: "sepia",
            lineHeight: "compact",
        };
        const legacyCloudSettings: ReaderSettingsPayload = {
            fontSize: "small",
            fontFamily: "serif",
            readerTheme: "dark",
            lineHeight: "default",
        };

        currentAuthUser = { id: "user-a" };
        currentCloudReaderSettings = legacyCloudSettings;
        localStorage.setItem(
            readerSettingsKey(getStorageScope("user-a")),
            createPersistedSettings(legacyLocalSettings),
        );

        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(result.current.fontSize).toBe("large");
            expect(result.current.fontFamily).toBe("sans");
            expect(result.current.readerTheme).toBe("sepia");
            expect(result.current.lineHeight).toBe("compact");
        });

        expect(profileUpdateMock).toHaveBeenCalledTimes(1);
        const pushedPayload = profileUpdateMock.mock.calls[0][0] as ReaderSettingsPayload;
        expect(pushedPayload).toMatchObject({
            fontSize: "large",
            fontFamily: "sans",
            readerTheme: "sepia",
            lineHeight: "compact",
        });
        expect(typeof pushedPayload.updatedAt).toBe("string");

        const persisted = JSON.parse(
            localStorage.getItem(readerSettingsKey(getStorageScope("user-a"))) || "{}",
        ) as { state?: ReaderSettingsPayload };
        expect(persisted.state).toMatchObject({
            fontSize: "large",
            fontFamily: "sans",
            readerTheme: "sepia",
            lineHeight: "compact",
        });
        expect(typeof persisted.state?.updatedAt).toBe("string");
    });
});
