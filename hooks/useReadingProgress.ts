"use client";

import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { AuthUser as User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import { deleteUserLibrary, upsertUserLibrary } from "@/lib/server/user-library-repository";
import type { Json } from "@/types/database";
import {
    clearScopedProgress,
    getScopedProgressKeys,
    getStorageScope,
    isScopeStorageEventKey,
    myListKey,
    parseProgressItemId,
    progressKey,
    readScopedMyList,
    type StorageScope,
    writeScopedMyList,
    GUEST_STORAGE_SCOPE,
    migrateLegacyStorageToGuest,
} from "@/lib/local-user-storage";

/**
 * Reading progress data stored in localStorage
 */
export interface ReadingProgressData {
    itemId: string;
    completed: string[];
    lastSegmentIndex: number;
    lastReadAt: string;
    isCompleted: boolean;
    totalSegments?: number;
    maxSegmentIndex?: number;
}

interface UserLibraryRow {
    content_id: string;
    is_bookmarked: boolean;
    progress: ReadingProgressData | null;
    last_interacted_at: string;
}

function hasProgressData(value: ReadingProgressData | null) {
    return Boolean(value && Object.keys(value).length > 0);
}

function isLocalProgressNewer(localData: ReadingProgressData | null, cloudTimestamp: string | null) {
    if (!localData?.lastReadAt || !cloudTimestamp) return false;
    return new Date(localData.lastReadAt).getTime() > new Date(cloudTimestamp).getTime();
}

function useReadingProgressController() {
    const [inProgressIds, setInProgressIds] = useState<string[]>([]);
    const [completedIds, setCompletedIds] = useState<string[]>([]);
    const [myListIds, setMyListIds] = useState<string[]>([]);
    const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressData>>({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [storageScope, setStorageScope] = useState<StorageScope>(getStorageScope(null));
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;

    const scopeRef = useRef<StorageScope>(getStorageScope(null));
    const userRef = useRef<User | null>(null);
    const hydrateRunRef = useRef(0);

    const readProgressFromScope = useCallback((scope: StorageScope, itemId: string) => {
        try {
            const stored = localStorage.getItem(progressKey(scope, itemId));
            return stored ? JSON.parse(stored) as ReadingProgressData : null;
        } catch {
            return null;
        }
    }, []);

    const resetState = useCallback(() => {
        setInProgressIds([]);
        setCompletedIds([]);
        setMyListIds([]);
        setProgressMap({});
        setIsLoaded(false);
    }, []);

    const loadProgress = useCallback((scope: StorageScope = scopeRef.current) => {
        if (typeof window === "undefined") return;

        const progressKeys = getScopedProgressKeys(localStorage, scope);
        const inProgress: { id: string; lastReadAt: string }[] = [];
        const completed: { id: string; lastReadAt: string }[] = [];
        const newProgressMap: Record<string, ReadingProgressData> = {};

        progressKeys.forEach((key) => {
            const itemId = parseProgressItemId(key, scope);
            if (!itemId) return;

            try {
                const data = JSON.parse(localStorage.getItem(key) || "{}") as ReadingProgressData;
                const entry = { id: itemId, lastReadAt: data.lastReadAt || "" };

                newProgressMap[itemId] = data;

                if (data.isCompleted) {
                    completed.push(entry);
                } else {
                    inProgress.push(entry);
                }
            } catch {
                // Ignore malformed local entries.
            }
        });

        const sortByRecent = (a: { lastReadAt: string }, b: { lastReadAt: string }) => {
            if (!a.lastReadAt) return 1;
            if (!b.lastReadAt) return -1;
            return new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime();
        };

        setStorageScope(scope);
        setInProgressIds(inProgress.sort(sortByRecent).map((entry) => entry.id));
        setCompletedIds(completed.sort(sortByRecent).map((entry) => entry.id));
        setProgressMap(newProgressMap);
        setMyListIds(readScopedMyList(localStorage, scope));
        setIsLoaded(true);
    }, []);

    const insertOrMoveToFront = useCallback((ids: string[], itemId: string) => {
        const filtered = ids.filter((id) => id !== itemId);
        return [itemId, ...filtered];
    }, []);

    const syncItemToCloud = useCallback(async (
        currentUser: User | null,
        scope: StorageScope,
        itemId: string,
        isBookmarked?: boolean,
        progressData?: ReadingProgressData | null,
    ) => {
        if (!currentUser) return true;

        try {
            let currentBookmarkState = isBookmarked;
            if (currentBookmarkState === undefined) {
                currentBookmarkState = readScopedMyList(localStorage, scope).includes(itemId);
            }

            let currentProgress = progressData;
            if (currentProgress === undefined) {
                currentProgress = readProgressFromScope(scope, itemId);
            }

            if (!currentBookmarkState && currentProgress === null) {
                const { error } = await deleteUserLibrary(supabase, currentUser.id, itemId);

                if (error) {
                    console.error("Cloud sync delete error:", error);
                    return false;
                }
                return true;
            }

            const payload: {
                user_id: string;
                content_id: string;
                last_interacted_at: string;
                is_bookmarked?: boolean;
                progress?: ReadingProgressData | null;
            } = {
                user_id: currentUser.id,
                content_id: itemId,
                last_interacted_at: new Date().toISOString(),
            };

            if (currentBookmarkState !== undefined) {
                payload.is_bookmarked = currentBookmarkState;
            }

            if (currentProgress !== undefined) {
                payload.progress = currentProgress;
            }

            const { error } = await upsertUserLibrary(supabase, {
                ...payload,
                progress: payload.progress as Json | undefined,
            });

            if (error) {
                console.error("Cloud sync error:", error);
                return false;
            }

            return true;
        } catch (error) {
            console.error("Failed to sync item:", itemId, error);
            return false;
        }
    }, [readProgressFromScope, supabase]);

    const importGuestDataToScope = useCallback((scope: StorageScope) => {
        if (typeof window === "undefined" || scope === GUEST_STORAGE_SCOPE) return false;

        let importedAny = false;

        getScopedProgressKeys(localStorage, GUEST_STORAGE_SCOPE).forEach((key) => {
            const itemId = parseProgressItemId(key, GUEST_STORAGE_SCOPE);
            if (!itemId) return;

            const guestData = readProgressFromScope(GUEST_STORAGE_SCOPE, itemId);
            const scopedData = readProgressFromScope(scope, itemId);

            if (!guestData) return;
            if (!scopedData || isLocalProgressNewer(guestData, scopedData.lastReadAt)) {
                localStorage.setItem(progressKey(scope, itemId), JSON.stringify(guestData));
                importedAny = true;
            }
        });

        const currentMyList = readScopedMyList(localStorage, scope);
        const guestMyList = readScopedMyList(localStorage, GUEST_STORAGE_SCOPE);
        const mergedMyList = Array.from(new Set([...currentMyList, ...guestMyList]));

        if (mergedMyList.length !== currentMyList.length) {
            writeScopedMyList(localStorage, scope, mergedMyList);
            importedAny = true;
        }

        return importedAny;
    }, [readProgressFromScope]);

    const syncCloudForScope = useCallback(async (currentUser: User, scope: StorageScope) => {
        const { data, error } = await supabase
            .from("user_library")
            .select("content_id, is_bookmarked, progress, last_interacted_at")
            .eq("user_id", currentUser.id);

        if (error || !data) {
            if (error) {
                console.error("Cloud sync fetch error:", error);
            }
            return false;
        }

        const rows = data as unknown as UserLibraryRow[];
        const cloudContentIds = new Set(rows.map((row) => row.content_id));
        const mergedMyList = new Set(readScopedMyList(localStorage, scope));
        let syncSucceeded = true;

        for (const row of rows) {
            const localData = readProgressFromScope(scope, row.content_id);
            const cloudProgress = hasProgressData(row.progress) ? row.progress : null;
            const finalBookmarked = mergedMyList.has(row.content_id) || row.is_bookmarked;

            if (finalBookmarked) {
                mergedMyList.add(row.content_id);
            }

            let progressForCloud: ReadingProgressData | null | undefined = undefined;

            if (localData && (!cloudProgress || isLocalProgressNewer(localData, row.last_interacted_at))) {
                progressForCloud = localData;
            } else if (cloudProgress) {
                localStorage.setItem(progressKey(scope, row.content_id), JSON.stringify(cloudProgress));
            }

            if (progressForCloud !== undefined || finalBookmarked !== row.is_bookmarked) {
                const didSync = await syncItemToCloud(
                    currentUser,
                    scope,
                    row.content_id,
                    finalBookmarked,
                    progressForCloud,
                );
                syncSucceeded = didSync && syncSucceeded;
            }
        }

        const localProgressKeys = getScopedProgressKeys(localStorage, scope);
        for (const key of localProgressKeys) {
            const itemId = parseProgressItemId(key, scope);
            if (!itemId || cloudContentIds.has(itemId)) continue;

            const localData = readProgressFromScope(scope, itemId);
            if (!localData) continue;

            const didSync = await syncItemToCloud(
                currentUser,
                scope,
                itemId,
                mergedMyList.has(itemId) ? true : undefined,
                localData,
            );
            syncSucceeded = didSync && syncSucceeded;
        }

        for (const itemId of mergedMyList) {
            if (cloudContentIds.has(itemId)) continue;

            const didSync = await syncItemToCloud(currentUser, scope, itemId, true, undefined);
            syncSucceeded = didSync && syncSucceeded;
        }

        writeScopedMyList(localStorage, scope, Array.from(mergedMyList));

        return syncSucceeded;
    }, [readProgressFromScope, supabase, syncItemToCloud]);

    const hydrateForUser = useCallback(async (nextUser: User | null) => {
        if (typeof window === "undefined") return;

        const runId = ++hydrateRunRef.current;
        resetState();
        migrateLegacyStorageToGuest(localStorage);

        const nextScope = getStorageScope(nextUser?.id);
        userRef.current = nextUser;
        scopeRef.current = nextScope;
        setUser(nextUser);
        setStorageScope(nextScope);

        let importedGuestData = false;
        let syncSucceeded = true;

        if (nextUser) {
            importedGuestData = importGuestDataToScope(nextScope);
            syncSucceeded = await syncCloudForScope(nextUser, nextScope);
        }

        if (runId !== hydrateRunRef.current) return;

        if (nextUser && importedGuestData && syncSucceeded) {
            clearScopedProgress(localStorage, GUEST_STORAGE_SCOPE);
            localStorage.removeItem(myListKey(GUEST_STORAGE_SCOPE));
        }

        loadProgress(nextScope);
    }, [importGuestDataToScope, loadProgress, resetState, syncCloudForScope]);

    useEffect(() => {
        let isMounted = true;

        const initialize = async () => {
            const { user, error } = resolveAuthUserResult(await supabase.auth.getUser());
            if (!isMounted) return;
            if (error) {
                console.error("Failed to resolve auth state for reading progress:", error);
            }
            await hydrateForUser(user);
        };

        initialize();

        const { data: { subscription } } = (supabase.auth as {
            onAuthStateChange: (callback: (event: string, session: { user: User | null } | null) => void) => {
                data: { subscription: { unsubscribe: () => void } };
            };
        }).onAuthStateChange((_event, session) => {
            if (!isMounted) return;
            hydrateForUser(session?.user ?? null);
        });

        return () => {
            isMounted = false;
            hydrateRunRef.current += 1;
            subscription.unsubscribe();
        };
    }, [hydrateForUser, supabase]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleStorage = (event: StorageEvent) => {
            if (isScopeStorageEventKey(event.key, scopeRef.current)) {
                loadProgress(scopeRef.current);
            }
        };

        const handleCustomUpdate = () => {
            loadProgress(scopeRef.current);
        };

        window.addEventListener("storage", handleStorage);
        window.addEventListener("flux_progress_updated", handleCustomUpdate);

        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener("flux_progress_updated", handleCustomUpdate);
        };
    }, [loadProgress]);

    const removeFromProgress = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        localStorage.removeItem(progressKey(scope, itemId));

        setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        setProgressMap((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
        });

        if (userRef.current) {
            syncItemToCloud(userRef.current, scope, itemId, undefined, null);
        }

        window.dispatchEvent(new Event("flux_progress_updated"));
    }, [syncItemToCloud]);

    const addToMyList = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentList = readScopedMyList(localStorage, scope);
        if (currentList.includes(itemId)) return;

        const newList = [itemId, ...currentList];
        writeScopedMyList(localStorage, scope, newList);
        setMyListIds(newList);

        syncItemToCloud(userRef.current, scope, itemId, true, undefined);
        window.dispatchEvent(new Event("flux_progress_updated"));
    }, [syncItemToCloud]);

    const removeFromMyList = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentList = readScopedMyList(localStorage, scope);
        const newList = currentList.filter((id) => id !== itemId);

        writeScopedMyList(localStorage, scope, newList);
        setMyListIds(newList);

        syncItemToCloud(userRef.current, scope, itemId, false, undefined);
        window.dispatchEvent(new Event("flux_progress_updated"));
    }, [syncItemToCloud]);

    const toggleMyList = useCallback((itemId: string) => {
        if (myListIds.includes(itemId)) {
            removeFromMyList(itemId);
            return;
        }

        addToMyList(itemId);
    }, [addToMyList, myListIds, removeFromMyList]);

    const saveReadingProgress = useCallback((itemId: string, data: ReadingProgressData) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        localStorage.setItem(progressKey(scope, itemId), JSON.stringify(data));

        setProgressMap((prev) => ({ ...prev, [itemId]: data }));

        if (data.isCompleted) {
            setCompletedIds((prev) => insertOrMoveToFront(prev, itemId));
            setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        } else {
            setInProgressIds((prev) => insertOrMoveToFront(prev, itemId));
            setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        }

        syncItemToCloud(userRef.current, scope, itemId, undefined, data);
        window.dispatchEvent(new Event("flux_progress_updated"));
    }, [insertOrMoveToFront, syncItemToCloud]);

    const isInMyList = useCallback((itemId: string) => myListIds.includes(itemId), [myListIds]);
    const getProgress = useCallback((itemId: string) => progressMap[itemId] || null, [progressMap]);
    const totalLibraryItems = inProgressIds.length + completedIds.length + myListIds.length;

    return {
        inProgressIds,
        completedIds,
        inProgressCount: inProgressIds.length,
        completedCount: completedIds.length,
        isLoaded,
        refresh: () => loadProgress(scopeRef.current),
        removeFromProgress,
        saveReadingProgress,
        getProgress,
        myListIds,
        myListCount: myListIds.length,
        addToMyList,
        removeFromMyList,
        toggleMyList,
        isInMyList,
        totalLibraryItems,
        storageScope,
        user,
    };
}

type ReadingProgressValue = ReturnType<typeof useReadingProgressController>;

const ReadingProgressContext = createContext<ReadingProgressValue | undefined>(undefined);

export function ReadingProgressProvider({ children }: { children: ReactNode }) {
    const value = useReadingProgressController();

    return createElement(ReadingProgressContext.Provider, { value }, children);
}

export function useReadingProgress() {
    const value = useContext(ReadingProgressContext);

    if (value === undefined) {
        throw new Error("useReadingProgress must be used within a ReadingProgressProvider");
    }

    return value;
}
