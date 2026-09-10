"use client";

import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { AuthUser as User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { deleteUserLibrary, upsertUserLibrary } from "@/lib/server/user-library-repository";
import type { Json } from "@/types/database";
import { useAuthUser } from "@/hooks/useAuthUser";
import {
    clearScopedProgress,
    getScopedProgressKeys,
    getStorageScope,
    isScopeStorageEventKey,
    parseProgressItemId,
    progressKey,
    readScopedMyList,
    type StorageScope,
    writeScopedMyList,
    migrateLegacyStorageToGuest,
} from "@/lib/local-user-storage";
import { clearCachedBrowseRecommendations } from "@/lib/browse-recommendation-cache";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { fetchCompleteLibrarySnapshot } from "@/lib/account-data-client";
import {
    clearCachedRecommendations,
    clearRecentRecommendations,
} from "@/lib/recommendation-memory";

/**
 * Reading progress data stored in localStorage
 */
export type ProgressLibraryList = "reading" | "completed";

export interface ReadingProgressData {
    itemId: string;
    completed: string[];
    lastSegmentIndex: number;
    lastReadAt: string;
    completedAt?: string;
    isCompleted: boolean;
    totalSegments?: number;
    maxSegmentIndex?: number;
    archivedFromLists?: Partial<Record<ProgressLibraryList, boolean>>;
}

function getProgressLibraryList(data: ReadingProgressData): ProgressLibraryList {
    return data.isCompleted ? "completed" : "reading";
}

function isArchivedFromList(data: ReadingProgressData, list: ProgressLibraryList) {
    return data.archivedFromLists?.[list] === true;
}

function clearArchiveForCurrentList(data: ReadingProgressData): ReadingProgressData {
    const currentList = getProgressLibraryList(data);
    return clearArchiveForList(data, currentList);
}

function clearArchiveForList(data: ReadingProgressData, list: ProgressLibraryList): ReadingProgressData {
    const archivedFromLists = { ...(data.archivedFromLists ?? {}) };

    if (!archivedFromLists[list]) {
        return data;
    }

    delete archivedFromLists[list];

    return {
        ...data,
        archivedFromLists: Object.keys(archivedFromLists).length > 0
            ? archivedFromLists
            : undefined,
    };
}

function normalizeCloudSyncError(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
        };
    }

    if (typeof error === "string") {
        return { message: error };
    }

    if (!error || typeof error !== "object") {
        return { message: "Unknown cloud sync error" };
    }

    const candidate = error as Record<string, unknown>;
    const normalized = Object.fromEntries(
        Object.entries(candidate).filter(([, value]) => value !== undefined && value !== null)
    );

    if (Object.keys(normalized).length > 0) {
        return normalized;
    }

    return {
        message: "Unknown cloud sync error",
        rawType: Object.prototype.toString.call(error),
    };
}

function logRecoverableCloudSync(
    context: string,
    error: unknown,
    metadata: Record<string, unknown> = {}
) {
    console.warn(`[ReadingProgress] ${context}`, {
        ...metadata,
        error: normalizeCloudSyncError(error),
    });
}

function hasProgressData(value: ReadingProgressData | null) {
    return Boolean(value && Object.keys(value).length > 0);
}

function parseProgressTimestamp(value: string) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function useReadingProgressController(initialUser?: User | null) {
    const queryClient = useQueryClient();
    const [inProgressIds, setInProgressIds] = useState<string[]>([]);
    const [completedIds, setCompletedIds] = useState<string[]>([]);
    const [myListIds, setMyListIds] = useState<string[]>([]);
    const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressData>>({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [user, setUser] = useState<User | null>(initialUser ?? null);
    const [storageScope, setStorageScope] = useState<StorageScope>(getStorageScope(initialUser?.id));
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;

    const scopeRef = useRef<StorageScope>(getStorageScope(null));
    const userRef = useRef<User | null>(null);
    const hydrateRunRef = useRef(0);
    const localMutationGenerationRef = useRef(0);
    const isLoadedRef = useRef(false);
    const didRunLegacyMigrationRef = useRef(false);

    const markLocalMutation = useCallback(() => {
        if (userRef.current) localMutationGenerationRef.current += 1;
    }, []);

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
        isLoadedRef.current = false;
    }, []);

    const loadProgress = useCallback((scope: StorageScope = scopeRef.current) => {
        if (typeof window === "undefined") return;

        const progressKeys = getScopedProgressKeys(localStorage, scope);
        const inProgress: { id: string; sortTimestamp: string }[] = [];
        const completed: { id: string; sortTimestamp: string }[] = [];
        const newProgressMap: Record<string, ReadingProgressData> = {};

        progressKeys.forEach((key) => {
            const itemId = parseProgressItemId(key, scope);
            if (!itemId) return;

            try {
                const data = JSON.parse(localStorage.getItem(key) || "{}") as ReadingProgressData;
                const entry = {
                    id: itemId,
                    sortTimestamp: data.isCompleted
                        ? data.completedAt || data.lastReadAt || ""
                        : data.lastReadAt || "",
                };

                newProgressMap[itemId] = data;

                if (data.isCompleted) {
                    if (isArchivedFromList(data, "completed")) {
                        return;
                    }

                    completed.push(entry);
                } else {
                    if (isArchivedFromList(data, "reading")) {
                        return;
                    }

                    inProgress.push(entry);
                }
            } catch {
                // Ignore malformed local entries.
            }
        });

        const sortByRecent = (a: { sortTimestamp: string }, b: { sortTimestamp: string }) => {
            if (!a.sortTimestamp) return 1;
            if (!b.sortTimestamp) return -1;
            return parseProgressTimestamp(b.sortTimestamp) - parseProgressTimestamp(a.sortTimestamp);
        };

        setStorageScope(scope);
        setInProgressIds(inProgress.sort(sortByRecent).map((entry) => entry.id));
        setCompletedIds(completed.sort(sortByRecent).map((entry) => entry.id));
        setProgressMap(newProgressMap);
        setMyListIds(readScopedMyList(localStorage, scope));
        setIsLoaded(true);
        isLoadedRef.current = true;
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
                    logRecoverableCloudSync("Delete cloud progress failed", error, {
                        itemId,
                        scope,
                        userId: currentUser.id,
                    });
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
                logRecoverableCloudSync("Upsert cloud progress failed", error, {
                    itemId,
                    scope,
                    userId: currentUser.id,
                });
                return false;
            }

            return true;
        } catch (error) {
            logRecoverableCloudSync("Unexpected cloud sync failure", error, {
                itemId,
                scope,
                userId: currentUser.id,
            });
            return false;
        }
    }, [readProgressFromScope, supabase]);

    const hydrateCloudSnapshot = useCallback(async (
        currentUser: User,
        scope: StorageScope,
        runId: number,
        mutationGeneration: number,
    ) => {
        const snapshot = await fetchCompleteLibrarySnapshot();

        // Do not install a response from an earlier sign-in session or let an
        // older complete snapshot overwrite a local mutation made while it was
        // loading. A later hydration run reconciles canonical server state.
        if (
            runId !== hydrateRunRef.current
            || userRef.current?.id !== currentUser.id
            || scopeRef.current !== scope
            || localMutationGenerationRef.current !== mutationGeneration
        ) {
            return false;
        }

        clearScopedProgress(localStorage, scope);
        const bookmarkedIds: string[] = [];
        for (const row of snapshot.records) {
            if (row.is_bookmarked) bookmarkedIds.push(row.content_id);
            if (hasProgressData(row.progress as ReadingProgressData | null)) {
                localStorage.setItem(progressKey(scope, row.content_id), JSON.stringify(row.progress));
            }
        }
        writeScopedMyList(localStorage, scope, bookmarkedIds);
        return true;
    }, []);

    const hydrateForUser = useCallback(async (nextUser: User | null, force = false) => {
        if (typeof window === "undefined") return;

        const nextScope = getStorageScope(nextUser?.id);
        const currentUserId = userRef.current?.id ?? null;
        const nextUserId = nextUser?.id ?? null;

        if (!didRunLegacyMigrationRef.current) {
            migrateLegacyStorageToGuest(localStorage);
            didRunLegacyMigrationRef.current = true;
        }

        if (
            isLoadedRef.current
            && scopeRef.current === nextScope
            && currentUserId === nextUserId
            && !force
        ) {
            return;
        }

        const runId = ++hydrateRunRef.current;
        resetState();

        userRef.current = nextUser;
        scopeRef.current = nextScope;
        setUser(nextUser);
        setStorageScope(nextScope);

        loadProgress(nextScope);

        if (!nextUser) {
            return;
        }

        const mutationGeneration = localMutationGenerationRef.current;
        void hydrateCloudSnapshot(nextUser, nextScope, runId, mutationGeneration)
            .then((syncSucceeded) => {
                if (runId !== hydrateRunRef.current) return;

                if (syncSucceeded) {
                    loadProgress(nextScope);
                    return;
                }

                if (
                    userRef.current?.id === nextUser.id
                    && localMutationGenerationRef.current !== mutationGeneration
                ) {
                    window.setTimeout(() => void hydrateForUser(nextUser, true), 0);
                }
            })
            .catch((error) => {
                logRecoverableCloudSync("Fetch complete library snapshot failed", error, {
                    scope: nextScope,
                    userId: nextUser.id,
                });
            });
    }, [hydrateCloudSnapshot, loadProgress, resetState]);

    useEffect(() => {
        void hydrateForUser(initialUser ?? null);

        return () => {
            hydrateRunRef.current += 1;
        };
    }, [hydrateForUser, initialUser]);

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
        window.addEventListener("netflux_progress_updated", handleCustomUpdate);

        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener("netflux_progress_updated", handleCustomUpdate);
        };
    }, [loadProgress]);

    const removeFromProgress = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        markLocalMutation();
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

        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [markLocalMutation, syncItemToCloud]);

    const clearRecommendationMemory = useCallback((scope: StorageScope) => {
        if (typeof window === "undefined") return;

        clearRecentRecommendations(localStorage, scope);
        clearCachedRecommendations(localStorage, scope);
        clearCachedBrowseRecommendations(localStorage, scope);
    }, []);

    const removeFromHistory = useCallback(async (
        itemId: string,
        options?: { deleteNotesAndHighlights?: boolean },
    ) => {
        if (typeof window === "undefined") return false;

        const scope = scopeRef.current;
        markLocalMutation();
        localStorage.removeItem(progressKey(scope, itemId));
        clearRecommendationMemory(scope);

        setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        setProgressMap((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
        });

        const currentUser = userRef.current;
        const cloudSync = currentUser
            ? syncItemToCloud(currentUser, scope, itemId, undefined, null)
            : Promise.resolve(true);
        const activitySync = currentUser
            ? fetch(`/api/activity/history/content/${itemId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    deleteNotesAndHighlights: options?.deleteNotesAndHighlights === true,
                }),
            })
                .then((response) => response.ok)
                .catch(() => false)
            : Promise.resolve(true);

        const [didSyncCloud, didSyncActivity] = await Promise.all([cloudSync, activitySync]);

        if (options?.deleteNotesAndHighlights) {
            await queryClient.invalidateQueries({ queryKey: ["highlights"] });
        }

        window.dispatchEvent(new Event("netflux_progress_updated"));
        window.dispatchEvent(new Event("netflux_activity_history_updated"));

        return didSyncCloud && didSyncActivity;
    }, [clearRecommendationMemory, markLocalMutation, queryClient, syncItemToCloud]);

    const archiveFromProgressList = useCallback((itemId: string, list: ProgressLibraryList) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentProgress = readProgressFromScope(scope, itemId);
        if (!currentProgress) return;
        markLocalMutation();

        const nextProgress: ReadingProgressData = {
            ...currentProgress,
            archivedFromLists: {
                ...(currentProgress.archivedFromLists ?? {}),
                [list]: true,
            },
        };

        localStorage.setItem(progressKey(scope, itemId), JSON.stringify(nextProgress));
        setProgressMap((prev) => ({ ...prev, [itemId]: nextProgress }));

        if (list === "completed") {
            setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        } else {
            setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        }

        syncItemToCloud(userRef.current, scope, itemId, undefined, nextProgress);
        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [markLocalMutation, readProgressFromScope, syncItemToCloud]);

    const restoreProgressListArchive = useCallback((itemId: string, list: ProgressLibraryList) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentProgress = readProgressFromScope(scope, itemId);
        if (!currentProgress) return;
        markLocalMutation();

        const nextProgress = clearArchiveForList(currentProgress, list);
        localStorage.setItem(progressKey(scope, itemId), JSON.stringify(nextProgress));
        setProgressMap((prev) => ({ ...prev, [itemId]: nextProgress }));

        const currentList = getProgressLibraryList(nextProgress);
        if (currentList === "completed") {
            setCompletedIds((prev) => insertOrMoveToFront(prev, itemId));
            setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        } else {
            setInProgressIds((prev) => insertOrMoveToFront(prev, itemId));
            setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        }

        syncItemToCloud(userRef.current, scope, itemId, undefined, nextProgress);
        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [insertOrMoveToFront, markLocalMutation, readProgressFromScope, syncItemToCloud]);

    const addToMyList = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentList = readScopedMyList(localStorage, scope);
        if (currentList.includes(itemId)) return;
        markLocalMutation();

        const newList = [itemId, ...currentList];
        writeScopedMyList(localStorage, scope, newList);
        setMyListIds(newList);

        void syncItemToCloud(userRef.current, scope, itemId, true, undefined)
            .then((didSync) => {
                if (!didSync) return;

                captureAnalyticsEvent("library_saved", {
                    content_id: itemId,
                    route: "useReadingProgress.addToMyList",
                    save_state: "saved",
                    user_state: userRef.current ? "authenticated" : "anonymous",
                });
            });
        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [markLocalMutation, syncItemToCloud]);

    const removeFromMyList = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const scope = scopeRef.current;
        const currentList = readScopedMyList(localStorage, scope);
        markLocalMutation();
        const newList = currentList.filter((id) => id !== itemId);

        writeScopedMyList(localStorage, scope, newList);
        setMyListIds(newList);

        syncItemToCloud(userRef.current, scope, itemId, false, undefined);
        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [markLocalMutation, syncItemToCloud]);

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
        const currentProgress = readProgressFromScope(scope, itemId);
        markLocalMutation();
        const nextProgressData: ReadingProgressData = data.isCompleted
            ? {
                ...data,
                completedAt: currentProgress?.isCompleted && currentProgress.completedAt
                    ? currentProgress.completedAt
                    : data.completedAt || data.lastReadAt || new Date().toISOString(),
            }
            : (() => {
                const inProgressData = { ...data };
                delete inProgressData.completedAt;
                return inProgressData;
            })();
        const nextData = clearArchiveForCurrentList(nextProgressData);
        localStorage.setItem(progressKey(scope, itemId), JSON.stringify(nextData));

        setProgressMap((prev) => ({ ...prev, [itemId]: nextData }));

        if (nextData.isCompleted) {
            setCompletedIds((prev) => insertOrMoveToFront(prev, itemId));
            setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        } else {
            setInProgressIds((prev) => insertOrMoveToFront(prev, itemId));
            setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        }

        void syncItemToCloud(userRef.current, scope, itemId, undefined, nextData)
            .then((didSync) => {
                if (!didSync || !nextData.isCompleted || currentProgress?.isCompleted) {
                    return;
                }

                captureAnalyticsEvent("content_completed", {
                    content_id: itemId,
                    route: "useReadingProgress.saveReadingProgress",
                    completion_percent: 100,
                    user_state: userRef.current ? "authenticated" : "anonymous",
                });
            });
        window.dispatchEvent(new Event("netflux_progress_updated"));
    }, [insertOrMoveToFront, markLocalMutation, readProgressFromScope, syncItemToCloud]);

    const isInMyList = useCallback((itemId: string) => myListIds.includes(itemId), [myListIds]);
    const getProgress = useCallback((itemId: string) => progressMap[itemId] || null, [progressMap]);
    const totalLibraryItems = inProgressIds.length + completedIds.length + myListIds.length;

    const refresh = useCallback(() => loadProgress(scopeRef.current), [loadProgress]);

    return useMemo(() => ({
        inProgressIds,
        completedIds,
        inProgressCount: inProgressIds.length,
        completedCount: completedIds.length,
        isLoaded,
        refresh,
        archiveFromProgressList,
        restoreProgressListArchive,
        removeFromProgress,
        removeFromHistory,
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
    }), [inProgressIds, completedIds, isLoaded, refresh, archiveFromProgressList,
        restoreProgressListArchive, removeFromProgress, removeFromHistory, saveReadingProgress,
        getProgress, myListIds, addToMyList, removeFromMyList, toggleMyList, isInMyList,
        totalLibraryItems, storageScope, user]);
}

type ReadingProgressValue = ReturnType<typeof useReadingProgressController>;

const ReadingProgressContext = createContext<ReadingProgressValue | undefined>(undefined);

export function ReadingProgressProvider({
    children,
}: {
    children: ReactNode;
}) {
    const user = useAuthUser();
    const value = useReadingProgressController(user);

    return createElement(ReadingProgressContext.Provider, { value }, children);
}

export function useReadingProgress() {
    const value = useContext(ReadingProgressContext);

    if (value === undefined) {
        throw new Error("useReadingProgress must be used within a ReadingProgressProvider");
    }

    return value;
}
