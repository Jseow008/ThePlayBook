"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ContentItem } from "@/types/database";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import {
    readRecentRecommendationIds,
    recordRecentRecommendations,
} from "@/lib/recommendation-memory";

function sortByInputOrder(items: ContentItem[], ids: string[]) {
    return [...items].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

export function useBatchContentItems(ids: string[], options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ["content-batch", ids],
        enabled: (options?.enabled ?? true) && ids.length > 0,
        queryFn: async () => {
            const response = await fetch("/api/content/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });

            if (!response.ok) {
                throw new Error("Failed to fetch content batch");
            }

            const data = (await response.json()) as ContentItem[];
            return sortByInputOrder(data, ids);
        },
        staleTime: 60 * 1000,
        placeholderData: (previousData) => previousData,
    });
}

export function useRecommendations(
    seedIds: string[],
    options?: { enabled?: boolean; excludeIds?: string[]; matchCount?: number },
) {
    const { storageScope } = useReadingProgress();
    const uniqueSeedIds = Array.from(new Set(seedIds));
    const uniqueExcludeIds = Array.from(new Set(options?.excludeIds ?? []));
    const recommendationContextKey = JSON.stringify({
        seedIds: uniqueSeedIds,
        excludeIds: uniqueExcludeIds,
        matchCount: options?.matchCount ?? 10,
    });
    const recentRecommendationIds = useMemo(() => {
        if (!recommendationContextKey || typeof window === "undefined") {
            return [];
        }

        return readRecentRecommendationIds(localStorage, storageScope);
    }, [recommendationContextKey, storageScope]);
    const combinedExcludeIds = useMemo(
        () => Array.from(new Set([...uniqueExcludeIds, ...recentRecommendationIds])),
        [recentRecommendationIds, uniqueExcludeIds],
    );

    const recommendationQuery = useQuery({
        queryKey: [
            "recommendations",
            uniqueSeedIds,
            combinedExcludeIds,
            options?.matchCount ?? 10,
        ],
        enabled: (options?.enabled ?? true) && uniqueSeedIds.length > 0,
        queryFn: async () => {
            const response = await fetch("/api/recommendations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    seedIds: uniqueSeedIds,
                    excludeIds: combinedExcludeIds,
                    matchCount: options?.matchCount ?? 10,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to fetch recommendations");
            }

            return (await response.json()) as ContentItem[];
        },
        staleTime: 2 * 60 * 1000,
    });

    useEffect(() => {
        if (
            typeof window === "undefined"
            || !recommendationQuery.data
            || recommendationQuery.data.length === 0
        ) {
            return;
        }

        recordRecentRecommendations(localStorage, storageScope, recommendationQuery.data.map((item) => item.id));
    }, [recommendationQuery.data, storageScope]);

    return recommendationQuery;
}
