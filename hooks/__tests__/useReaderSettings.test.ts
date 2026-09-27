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
let currentAuthError: { code?: string; message?: string; name?: string } | null = null;
let currentCloudReaderSettings: Partial<ReaderSettingsPayload> | null = null;
const profileUpdateMock = vi.fn();
const unsubscribeMock = vi.fn();
const getUserMock = vi.fn();
const readSettingsMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            onAuthStateChange: vi.fn((callback: (event: string, session: { user: { id: string } | null } | null) => void) => {
                authStateChangeHandler = callback;
                return {
                    data: {
                        subscription: {
                            unsubscribe: unsubscribeMock,
                        },
                    },
                };
            }),
            getUser: getUserMock,
        },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: readSettingsMock,
                })),
            })),

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
        currentAuthError = null;
        currentCloudReaderSettings = null;
        window.localStorage.clear();
        vi.clearAllMocks();
        vi.resetModules();
        getUserMock.mockReset().mockImplementation(() => Promise.resolve({ data: { user: currentAuthUser }, error: currentAuthError }));
        readSettingsMock.mockReset().mockImplementation(() => Promise.resolve({ data: { reader_settings: currentCloudReaderSettings }, error: null }));
        fetchMock.mockReset().mockImplementation((_url: string, options: RequestInit) => {
            const payload = JSON.parse(options.body as string);
            profileUpdateMock(payload.settings);
            currentCloudReaderSettings = payload.settings;
            return Promise.resolve({ ok: true });
        });
        vi.stubGlobal("fetch", fetchMock);
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

    it("treats missing-session bootstrap as guest settings without logging an error", async () => {
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const guestSettings: ReaderSettingsPayload = {
            fontSize: "large",
            fontFamily: "serif",
            readerTheme: "light",
            lineHeight: "relaxed",
            updatedAt: "2026-03-13T12:00:00.000Z",
        };

        currentAuthError = {
            code: "session_not_found",
            message: "Auth session missing!",
            name: "AuthSessionMissingError",
        };
        localStorage.setItem(
            readerSettingsKey(GUEST_STORAGE_SCOPE),
            createPersistedSettings(guestSettings),
        );

        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(result.current.fontSize).toBe("large");
            expect(result.current.readerTheme).toBe("light");
        });

        expect(consoleErrorSpy).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
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

    it("unsubscribes the auth listener when the last hook consumer unmounts", async () => {
        const useReaderSettings = await loadUseReaderSettings();
        const firstRender = renderHook(() => useReaderSettings());
        const secondRender = renderHook(() => useReaderSettings());

        await waitFor(() => {
            expect(authStateChangeHandler).not.toBeNull();
        });

        firstRender.unmount();
        expect(unsubscribeMock).not.toHaveBeenCalled();

        secondRender.unmount();
        expect(unsubscribeMock).toHaveBeenCalledTimes(1);
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
    it("keeps guest imports and account-local edits when the save fails", async () => {
        const settings: ReaderSettingsPayload = { fontSize: "large", fontFamily: "sans", readerTheme: "sepia", lineHeight: "relaxed", updatedAt: "2026-03-13T12:00:00.000Z" };
        localStorage.setItem(readerSettingsKey(GUEST_STORAGE_SCOPE), createPersistedSettings(settings));
        currentAuthUser = { id: "user-a" };
        fetchMock.mockResolvedValue({ ok: false });
        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(localStorage.getItem(readerSettingsKey(GUEST_STORAGE_SCOPE))).toBe(createPersistedSettings(settings));
        await act(async () => result.current.setReaderTheme("light"));
        expect(JSON.parse(localStorage.getItem(readerSettingsKey(getStorageScope("user-a")))!).state.readerTheme).toBe("light");
        expect(fetchMock).toHaveBeenLastCalledWith("/api/reader-settings", expect.objectContaining({
            body: expect.stringContaining('"expectedAccountId":"user-a"'),
        }));
        expect(result.current.updatedAt).not.toBe(settings.updatedAt);
    });

    it("ignores a delayed account A read after switching to account B", async () => {
        let finishRead!: (value: unknown) => void;
        currentAuthUser = { id: "user-a" };
        readSettingsMock.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());
        await waitFor(() => expect(readSettingsMock).toHaveBeenCalledTimes(1));
        currentAuthUser = { id: "user-b" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });
        await act(async () => { finishRead({ data: { reader_settings: { readerTheme: "sepia" } }, error: null }); });
        expect(result.current.readerTheme).toBe("dark");
        expect(localStorage.getItem(readerSettingsKey(getStorageScope("user-b")))).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("ignores delayed cloud settings after a local edit", async () => {
        let finishRead!: (value: unknown) => void;
        currentAuthUser = { id: "user-a" };
        readSettingsMock.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());
        await waitFor(() => expect(readSettingsMock).toHaveBeenCalled());
        act(() => result.current.setReaderTheme("light"));
        await act(async () => { finishRead({ data: { reader_settings: { readerTheme: "sepia", updatedAt: "2099-01-01T00:00:00.000Z" } }, error: null }); });
        expect(result.current.readerTheme).toBe("light");
        expect(JSON.parse(localStorage.getItem(readerSettingsKey(getStorageScope("user-a")))!).state.readerTheme).toBe("light");
    });

    it("ignores stale bootstrap auth after an account-change event", async () => {
        let finishAuth!: (value: unknown) => void;
        getUserMock.mockImplementationOnce(() => new Promise(resolve => { finishAuth = resolve; }));
        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());
        currentAuthUser = { id: "user-b" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });
        act(() => result.current.setReaderTheme("light"));
        await act(async () => { finishAuth({ data: { user: { id: "user-a" } }, error: null }); });
        expect(result.current.readerTheme).toBe("light");
        expect(localStorage.getItem(readerSettingsKey(getStorageScope("user-a")))).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("preserves a guest edit made while bootstrap auth is pending", async () => {
        let finishAuth!: (value: unknown) => void;
        getUserMock.mockImplementationOnce(() => new Promise(resolve => { finishAuth = resolve; }));
        currentCloudReaderSettings = { readerTheme: "sepia", updatedAt: "2099-01-01T00:00:00.000Z" };
        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());
        act(() => result.current.setReaderTheme("light"));
        await act(async () => { finishAuth({ data: { user: { id: "user-a" } }, error: null }); });
        expect(result.current.readerTheme).toBe("light");
        expect(JSON.parse(localStorage.getItem(readerSettingsKey(getStorageScope("user-a")))!).state.readerTheme).toBe("light");
        expect(localStorage.getItem(readerSettingsKey(GUEST_STORAGE_SCOPE))).not.toBeNull();
        expect(readSettingsMock).not.toHaveBeenCalled();
    });

    it("serializes same-account writes so an earlier request cannot finish after a newer save", async () => {
        currentAuthUser = { id: "user-a" };
        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());
        await waitFor(() => expect(readSettingsMock).toHaveBeenCalled());
        let finishFirst!: (value: unknown) => void;
        fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
        await act(async () => result.current.setReaderTheme("light"));
        await act(async () => result.current.setReaderTheme("sepia"));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => { finishFirst({ ok: true }); });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).settings.readerTheme).toBe("sepia");
    });

    it("discards queued account A writes after switching to B", async () => {
        currentAuthUser = { id: "user-a" };
        const useReaderSettings = await loadUseReaderSettings();
        const { result } = renderHook(() => useReaderSettings());
        await waitFor(() => expect(readSettingsMock).toHaveBeenCalled());
        let finishFirst!: (value: unknown) => void;
        fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }));
        await act(async () => result.current.setReaderTheme("light"));
        await act(async () => result.current.setReaderTheme("sepia"));
        currentAuthUser = { id: "user-b" };
        await act(async () => { authStateChangeHandler?.("SIGNED_IN", { user: currentAuthUser }); });
        await act(async () => { finishFirst({ ok: true }); });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).expectedAccountId).toBe("user-a");
        expect(result.current.readerTheme).toBe("dark");
        expect(JSON.parse(localStorage.getItem(readerSettingsKey(getStorageScope("user-a")))!).state.readerTheme).toBe("sepia");
    });

});
