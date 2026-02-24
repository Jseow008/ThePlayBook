"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthUser as User } from "@supabase/supabase-js";

/**
 * Reading progress data stored in localStorage
 */
export interface ReadingProgressData {
    itemId: string;
    completed: string[]; // Array of completed segment IDs
    lastSegmentIndex: number;
    lastReadAt: string;
    isCompleted: boolean;
    totalSegments?: number; // Optional total segments count for percentage calculation
    maxSegmentIndex?: number; // The furthest segment index reached
}

interface UserLibraryRow {
    content_id: string;
    is_bookmarked: boolean;
    progress: ReadingProgressData | null;
    last_interacted_at: string;
}

/**
 * Hook to retrieve all reading progress from localStorage
 * Returns in-progress and completed item IDs, sorted by recency
 * Also manages "My List" (bookmarks)
 */
export function useReadingProgress() {
    const [inProgressIds, setInProgressIds] = useState<string[]>([]);
    const [completedIds, setCompletedIds] = useState<string[]>([]);
    const [myListIds, setMyListIds] = useState<string[]>([]);
    const [progressMap, setProgressMap] = useState<Record<string, ReadingProgressData>>({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const supabase = createClient();

    // Track if we've done the initial cloud sync
    const hasSyncedRef = useRef(false);

    const loadProgress = useCallback(() => {
        if (typeof window === "undefined") return;

        // 1. Load Reading Progress
        const progressKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("flux_progress_")) {
                progressKeys.push(key);
            }
        }

        const inProgress: { id: string; lastReadAt: string }[] = [];
        const completed: { id: string; lastReadAt: string }[] = [];
        const newProgressMap: Record<string, ReadingProgressData> = {};

        progressKeys.forEach(key => {
            const id = key.replace("flux_progress_", "");
            try {
                const data = JSON.parse(localStorage.getItem(key) || "{}") as ReadingProgressData;
                const entry = { id, lastReadAt: data.lastReadAt || "" };

                newProgressMap[id] = data;

                if (data.isCompleted) {
                    completed.push(entry);
                } else {
                    inProgress.push(entry);
                }
            } catch {
                // Skip invalid entries
            }
        });

        // Sort by most recently read
        const sortByRecent = (a: { lastReadAt: string }, b: { lastReadAt: string }) => {
            if (!a.lastReadAt) return 1;
            if (!b.lastReadAt) return -1;
            return new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime();
        };

        setInProgressIds(inProgress.sort(sortByRecent).map(e => e.id));
        setCompletedIds(completed.sort(sortByRecent).map(e => e.id));
        setProgressMap(newProgressMap);

        // 2. Load My List
        try {
            const list = JSON.parse(localStorage.getItem("flux_mylist") || "[]");
            setMyListIds(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error("Error parsing My List", e);
            setMyListIds([]);
        }

        setIsLoaded(true);
    }, []);

    const insertOrMoveToFront = useCallback((ids: string[], itemId: string) => {
        const filtered = ids.filter((id) => id !== itemId);
        return [itemId, ...filtered];
    }, []);

    // Sync Helper: Upsert row to Supabase
    const syncItemToCloud = useCallback(async (itemId: string, isBookmarked?: boolean, progressData?: ReadingProgressData | null) => {
        if (!user) return;

        try {
            // If parameters are undefined, try to read from localStorage to fill gaps
            let currentBookmarkState = isBookmarked;
            if (currentBookmarkState === undefined) {
                const list = JSON.parse(localStorage.getItem("flux_mylist") || "[]");
                currentBookmarkState = list.includes(itemId);
            }

            let currentProgress = progressData;
            if (currentProgress === undefined) {
                const stored = localStorage.getItem(`flux_progress_${itemId}`);
                currentProgress = stored ? JSON.parse(stored) : null;
            }

            // If it's not bookmarked AND there is no progress, delete the row entirely
            if (!currentBookmarkState && currentProgress === null) {
                const { error } = await supabase
                    .from("user_library")
                    .delete()
                    .match({ user_id: user.id, content_id: itemId });

                if (error) console.error("Cloud sync delete error:", error);
                return;
            }

            // Construct payload
            const payload: any = {
                user_id: user.id,
                content_id: itemId,
                last_interacted_at: new Date().toISOString(),
            };

            if (currentBookmarkState !== undefined) {
                payload.is_bookmarked = currentBookmarkState;
            }

            // Only update progress if we have data or explicit null (to clear?) 
            if (currentProgress !== undefined) {
                payload.progress = currentProgress;
            }

            const { error } = await supabase
                .from("user_library")
                .upsert(payload, { onConflict: "user_id, content_id" });

            if (error) console.error("Cloud sync error:", error);

        } catch (err) {
            console.error("Failed to sync item:", itemId, err);
        }
    }, [user, supabase]);

    // Initial Cloud Sync
    useEffect(() => {
        if (!user || hasSyncedRef.current) return;

        const syncCloud = async () => {
            const { data, error } = await supabase
                .from("user_library")
                .select("content_id, is_bookmarked, progress, last_interacted_at");

            if (error || !data) return;

            // Cloud Overwrites Local on mount logic
            const rows = data as unknown as UserLibraryRow[];
            const cloudMyListIds: string[] = [];

            rows.forEach((row) => {
                // 1. Sync My List
                if (row.is_bookmarked) {
                    cloudMyListIds.push(row.content_id);
                }

                // 2. Sync Progress
                if (row.progress && Object.keys(row.progress).length > 0) {
                    const localKey = `flux_progress_${row.content_id}`;
                    const localDataStr = localStorage.getItem(localKey);

                    let shouldUpdateLocal = true;
                    if (localDataStr) {
                        const localData = JSON.parse(localDataStr);
                        // row.last_interacted_at vs localData.lastReadAt
                        if (localData.lastReadAt && row.last_interacted_at) {
                            if (new Date(localData.lastReadAt) > new Date(row.last_interacted_at)) {
                                shouldUpdateLocal = false;
                                // We have newer local data, maybe push to cloud?
                                syncItemToCloud(row.content_id, row.is_bookmarked, localData);
                            }
                        }
                    }

                    if (shouldUpdateLocal) {
                        localStorage.setItem(localKey, JSON.stringify(row.progress));
                    }
                }
            });

            // 3. Upload Local-only data to Cloud (Migration/Offline-sync)
            const cloudContentIds = new Set(rows.map(r => r.content_id));

            // Push missing Progress
            const localKeys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith("flux_progress_")) localKeys.push(k);
            }
            localKeys.forEach(key => {
                const id = key.replace("flux_progress_", "");
                if (!cloudContentIds.has(id)) {
                    try {
                        const localData = JSON.parse(localStorage.getItem(key) || "{}");
                        syncItemToCloud(id, undefined, localData);
                    } catch { }
                }
            });

            // Push missing My List to Cloud
            const localMyListForUpload = JSON.parse(localStorage.getItem("flux_mylist") || "[]");
            localMyListForUpload.forEach((id: string) => {
                if (!cloudContentIds.has(id)) {
                    syncItemToCloud(id, true, undefined);
                }
            });

            // Update My List in LocalStorage
            // Merge: Add cloud items to local list (union)
            const localMyList = JSON.parse(localStorage.getItem("flux_mylist") || "[]");
            const newMyList = new Set(localMyList);
            cloudMyListIds.forEach(id => {
                if (!newMyList.has(id)) newMyList.add(id);
            });

            localStorage.setItem("flux_mylist", JSON.stringify(Array.from(newMyList)));

            hasSyncedRef.current = true;
            loadProgress(); // Reload state from the updated localStorage
        };

        syncCloud();
    }, [user, supabase, loadProgress, syncItemToCloud]);

    // Auth Listener
    useEffect(() => {
        const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((event: string, session: any) => {
            setUser(session?.user || null);
            if (event === 'SIGNED_OUT') {
                hasSyncedRef.current = false;

                // 1. Clear LocalStorage
                localStorage.removeItem("flux_mylist");
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith("flux_progress_")) keysToRemove.push(k);
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));

                // 2. Clear State
                setInProgressIds([]);
                setCompletedIds([]);
                setMyListIds([]);
                setProgressMap({});
            }
        });
        return () => subscription.unsubscribe();
    }, [supabase]);

    useEffect(() => {
        loadProgress();

        // Listen for storage changes (cross-tab sync)
        const handleStorage = (e: StorageEvent) => {
            if (e.key?.startsWith("flux_progress_") || e.key === "flux_mylist") {
                loadProgress();
            }
        };

        // Listen for custom event (same-tab sync)
        const handleCustomUpdate = () => {
            loadProgress();
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

        localStorage.removeItem(`flux_progress_${itemId}`);

        // Update in-memory state without full localStorage rescan
        setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        setProgressMap((prev) => {
            const next = { ...prev };
            delete next[itemId];
            return next;
        });

        if (user) {
            syncItemToCloud(itemId, undefined, null);
        }

        window.dispatchEvent(new Event("flux_progress_updated"));
    }, [user, syncItemToCloud]);

    // My List Actions
    const addToMyList = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const currentList = JSON.parse(localStorage.getItem("flux_mylist") || "[]");
        if (!currentList.includes(itemId)) {
            const newList = [itemId, ...currentList]; // Add to top
            localStorage.setItem("flux_mylist", JSON.stringify(newList));
            setMyListIds(newList);

            // Cloud Sync
            syncItemToCloud(itemId, true, undefined);

            window.dispatchEvent(new Event("flux_progress_updated"));
        }
    }, [syncItemToCloud]);

    const removeFromMyList = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const currentList = JSON.parse(localStorage.getItem("flux_mylist") || "[]");
        const newList = currentList.filter((id: string) => id !== itemId);
        localStorage.setItem("flux_mylist", JSON.stringify(newList));
        setMyListIds(newList);

        // Cloud Sync
        syncItemToCloud(itemId, false, undefined);

        window.dispatchEvent(new Event("flux_progress_updated"));
    }, [syncItemToCloud]);

    const toggleMyList = useCallback((itemId: string) => {
        if (myListIds.includes(itemId)) {
            removeFromMyList(itemId);
        } else {
            addToMyList(itemId);
        }
    }, [myListIds, addToMyList, removeFromMyList]);

    // Expose a way to manually update progress (used by Reader components)
    // This is a new helper to replace direct localStorage calls in components
    const saveReadingProgress = useCallback((itemId: string, data: ReadingProgressData) => {
        if (typeof window === "undefined") return;

        localStorage.setItem(`flux_progress_${itemId}`, JSON.stringify(data));

        // Update in-memory state without full localStorage rescan
        setProgressMap((prev) => ({ ...prev, [itemId]: data }));

        if (data.isCompleted) {
            setCompletedIds((prev) => insertOrMoveToFront(prev, itemId));
            setInProgressIds((prev) => prev.filter((id) => id !== itemId));
        } else {
            setInProgressIds((prev) => insertOrMoveToFront(prev, itemId));
            setCompletedIds((prev) => prev.filter((id) => id !== itemId));
        }

        syncItemToCloud(itemId, undefined, data);

        window.dispatchEvent(new Event("flux_progress_updated"));
    }, [insertOrMoveToFront, syncItemToCloud]);

    const isInMyList = useCallback((itemId: string) => myListIds.includes(itemId), [myListIds]);

    const getProgress = useCallback((itemId: string) => progressMap[itemId] || null, [progressMap]);

    const totalLibraryItems = inProgressIds.length + completedIds.length + myListIds.length;

    return {
        // Progress
        inProgressIds,
        completedIds,
        inProgressCount: inProgressIds.length,
        completedCount: completedIds.length,
        isLoaded,
        refresh: loadProgress,
        removeFromProgress,
        saveReadingProgress,
        getProgress,

        // My List
        myListIds,
        myListCount: myListIds.length,
        addToMyList,
        removeFromMyList,
        toggleMyList,
        isInMyList,

        // Combined
        totalLibraryItems,
    };
}
