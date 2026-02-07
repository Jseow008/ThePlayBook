"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Reading progress data stored in localStorage
 */
export interface ReadingProgressData {
    itemId: string;
    completed: string[]; // Array of completed segment IDs
    lastSegmentIndex: number;
    lastReadAt: string;
    isCompleted: boolean;
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
    const [isLoaded, setIsLoaded] = useState(false);

    const loadProgress = useCallback(() => {
        if (typeof window === "undefined") return;

        // 1. Load Reading Progress
        const progressKeys = Object.keys(localStorage)
            .filter(key => key.startsWith("lifebook_progress_"));

        const inProgress: { id: string; lastReadAt: string }[] = [];
        const completed: { id: string; lastReadAt: string }[] = [];

        progressKeys.forEach(key => {
            const id = key.replace("lifebook_progress_", "");
            try {
                const data = JSON.parse(localStorage.getItem(key) || "{}") as ReadingProgressData;
                const entry = { id, lastReadAt: data.lastReadAt || "" };

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

        // 2. Load My List
        try {
            const list = JSON.parse(localStorage.getItem("lifebook_mylist") || "[]");
            setMyListIds(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error("Error parsing My List", e);
            setMyListIds([]);
        }

        setIsLoaded(true);
    }, []);

    useEffect(() => {
        loadProgress();

        // Listen for storage changes (cross-tab sync)
        const handleStorage = (e: StorageEvent) => {
            if (e.key?.startsWith("lifebook_progress_") || e.key === "lifebook_mylist") {
                loadProgress();
            }
        };

        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [loadProgress]);

    const removeFromProgress = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        localStorage.removeItem(`lifebook_progress_${itemId}`);

        // Trigger storage event for other components/tabs
        window.dispatchEvent(new StorageEvent("storage", {
            key: `lifebook_progress_${itemId}`,
            newValue: null
        }));

        // Refresh local state
        loadProgress();
    }, [loadProgress]);

    // My List Actions
    const addToMyList = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const currentList = JSON.parse(localStorage.getItem("lifebook_mylist") || "[]");
        if (!currentList.includes(itemId)) {
            const newList = [itemId, ...currentList]; // Add to top
            localStorage.setItem("lifebook_mylist", JSON.stringify(newList));

            window.dispatchEvent(new StorageEvent("storage", {
                key: "lifebook_mylist",
                newValue: JSON.stringify(newList)
            }));
            loadProgress();
        }
    }, [loadProgress]);

    const removeFromMyList = useCallback((itemId: string) => {
        if (typeof window === "undefined") return;

        const currentList = JSON.parse(localStorage.getItem("lifebook_mylist") || "[]");
        const newList = currentList.filter((id: string) => id !== itemId);
        localStorage.setItem("lifebook_mylist", JSON.stringify(newList));

        window.dispatchEvent(new StorageEvent("storage", {
            key: "lifebook_mylist",
            newValue: JSON.stringify(newList)
        }));
        loadProgress();
    }, [loadProgress]);

    const toggleMyList = useCallback((itemId: string) => {
        if (myListIds.includes(itemId)) {
            removeFromMyList(itemId);
        } else {
            addToMyList(itemId);
        }
    }, [myListIds, addToMyList, removeFromMyList]);

    const isInMyList = useCallback((itemId: string) => myListIds.includes(itemId), [myListIds]);

    return {
        // Progress
        inProgressIds,
        completedIds,
        inProgressCount: inProgressIds.length,
        completedCount: completedIds.length,
        isLoaded,
        refresh: loadProgress,
        removeFromProgress,

        // My List
        myListIds,
        myListCount: myListIds.length,
        addToMyList,
        removeFromMyList,
        toggleMyList,
        isInMyList,
    };
}
