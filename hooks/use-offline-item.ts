"use client";

import { useEffect, useState, useCallback } from "react";
import { get, set, del } from "idb-keyval";
import type { ContentItemWithSegments, SegmentFull } from "@/types/domain";

/**
 * Offline Item Hook
 * 
 * Manages offline storage of content items in IndexedDB.
 * Follows the rehydration strategy: IDB -> React Query Cache -> Network
 */

interface OfflineItemData {
    item: ContentItemWithSegments;
    segments: SegmentFull[];
    savedAt: string;
}

export function useOfflineItem(itemId: string) {
    const [isAvailable, setIsAvailable] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [offlineData, setOfflineData] = useState<OfflineItemData | null>(null);

    const storageKey = `item-${itemId}`;

    // Check if item is available offline
    useEffect(() => {
        async function checkAvailability() {
            try {
                const data = await get<OfflineItemData>(storageKey);
                if (data) {
                    setOfflineData(data);
                    setIsAvailable(true);
                }
            } catch (error) {
                console.error("Error checking offline availability:", error);
            } finally {
                setIsLoading(false);
            }
        }

        checkAvailability();
    }, [storageKey]);

    // Save item for offline use
    const saveForOffline = useCallback(
        async (item: ContentItemWithSegments, segments: SegmentFull[]) => {
            try {
                const data: OfflineItemData = {
                    item,
                    segments,
                    savedAt: new Date().toISOString(),
                };
                await set(storageKey, data);
                setOfflineData(data);
                setIsAvailable(true);
                return true;
            } catch (error) {
                console.error("Error saving for offline:", error);
                return false;
            }
        },
        [storageKey]
    );

    // Remove offline data
    const removeOffline = useCallback(async () => {
        try {
            await del(storageKey);
            setOfflineData(null);
            setIsAvailable(false);
            return true;
        } catch (error) {
            console.error("Error removing offline data:", error);
            return false;
        }
    }, [storageKey]);

    // Get offline data
    const getOfflineData = useCallback(async () => {
        try {
            return await get<OfflineItemData>(storageKey);
        } catch (error) {
            console.error("Error getting offline data:", error);
            return null;
        }
    }, [storageKey]);

    return {
        isAvailable,
        isLoading,
        offlineData,
        saveForOffline,
        removeOffline,
        getOfflineData,
    };
}
