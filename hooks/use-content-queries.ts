"use client";

import { useEffect, useMemo } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { cachedContentBatch, fetchContentBatch, invalidateContentRecords } from "@/lib/content-record-cache";
import type { ContentItem } from "@/types/database";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import {
    readCachedBrowseRecommendations,
    recordCachedBrowseRecommendations,
} from "@/lib/browse-recommendation-cache";
import {
    readCachedRecommendations,
    readRecentRecommendationIds,
    recordCachedRecommendations,
    recordRecentRecommendations,
} from "@/lib/recommendation-memory";

function sortByInputOrder(items: ContentItem[], ids: string[]) {
    return [...items].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

function filterExcludedItems(items: ContentItem[] | null | undefined, excludeIds: string[]) {
    if (!items || items.length === 0) {
        return null;
    }

    const excludedIdSet = new Set(excludeIds);
    const filteredItems = items.filter((item) => !excludedIdSet.has(item.id));

    return filteredItems.length > 0 ? filteredItems : null;
}

export function useBatchContentItems(ids: string[], options?: { enabled?: boolean }) {
    const client = useQueryClient();
    const canonicalIds = useMemo(() => [...new Set(ids)].sort(), [ids]);
    const queryKey = ["content-batch", canonicalIds];
    const idSet = new Set(ids);
    const result = useQuery({
        queryKey,
        enabled: (options?.enabled ?? true) && canonicalIds.length > 0,
        queryFn: ({ signal }) => fetchContentBatch(client, canonicalIds, signal, client.getQueryState(queryKey)?.isInvalidated),
        initialData: () => canonicalIds.length ? cachedContentBatch(client, canonicalIds) : undefined,
        placeholderData: keepPreviousData,
        select: data => sortByInputOrder(data.items.filter(item => idSet.has(item.id)), ids),
        staleTime: query => Math.max(0, (query.state.data?.expiresAt ?? 0) - query.state.dataUpdatedAt),
    });
    return { ...result, refetch: (options?: Parameters<typeof result.refetch>[0]) => {
        invalidateContentRecords(client, canonicalIds);
        return result.refetch(options);
    } };
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
        storageScope,
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
    const recommendationQueryKey = useMemo(() => JSON.stringify({
        seedIds: [...uniqueSeedIds].sort(),
        excludeIds: [...combinedExcludeIds].sort(),
        matchCount: options?.matchCount ?? 10,
        storageScope,
    }), [combinedExcludeIds, options?.matchCount, storageScope, uniqueSeedIds]);
    const baselineRecommendationQueryKey = useMemo(() => JSON.stringify({
        seedIds: [...uniqueSeedIds].sort(),
        excludeIds: [...uniqueExcludeIds].sort(),
        matchCount: options?.matchCount ?? 10,
        storageScope,
    }), [options?.matchCount, storageScope, uniqueExcludeIds, uniqueSeedIds]);
    const exactCachedRecommendations = useMemo(() => {
        if (typeof window === "undefined") {
            return null;
        }

        return readCachedRecommendations(localStorage, storageScope, recommendationQueryKey);
    }, [recommendationQueryKey, storageScope]);
    const fallbackCachedRecommendations = useMemo(() => {
        if (typeof window === "undefined") {
            return null;
        }

        return readCachedRecommendations(localStorage, storageScope, baselineRecommendationQueryKey);
    }, [baselineRecommendationQueryKey, storageScope]);
    const sanitizedFallbackCachedRecommendations = useMemo(() => {
        if (!fallbackCachedRecommendations) {
            return null;
        }

        const filteredItems = filterExcludedItems(fallbackCachedRecommendations.items, combinedExcludeIds);
        if (!filteredItems) {
            return null;
        }

        return {
            ...fallbackCachedRecommendations,
            items: filteredItems,
        };
    }, [combinedExcludeIds, fallbackCachedRecommendations]);
    const cachedRecommendations = exactCachedRecommendations ?? sanitizedFallbackCachedRecommendations;
    const cachedRecommendationsUpdatedAt = exactCachedRecommendations
        ? Date.parse(exactCachedRecommendations.storedAt)
        : sanitizedFallbackCachedRecommendations
            ? 0
            : undefined;

    const recommendationQuery = useQuery({
        queryKey: ["recommendations", recommendationQueryKey],
        enabled: (options?.enabled ?? true) && uniqueSeedIds.length > 0,
        initialData: cachedRecommendations?.items,
        initialDataUpdatedAt: cachedRecommendationsUpdatedAt,
        queryFn: async ({ signal }) => {
            const response = await fetch("/api/recommendations", {
                signal,
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
        if (typeof window === "undefined" || !recommendationQuery.data) {
            return;
        }

        if (recommendationQuery.data.length > 0) {
            recordRecentRecommendations(localStorage, storageScope, recommendationQuery.data.map((item) => item.id));
        }

        recordCachedRecommendations(localStorage, storageScope, recommendationQueryKey, recommendationQuery.data);
        recordCachedRecommendations(localStorage, storageScope, baselineRecommendationQueryKey, recommendationQuery.data);
    }, [baselineRecommendationQueryKey, recommendationQuery.data, recommendationQueryKey, storageScope]);

    return recommendationQuery;
}

export function useBrowseRecommendations(options: {
    recentSeedId: string | null;
    librarySeedIds: string[];
    excludeIds: string[];
    enabled?: boolean;
    targetCount?: number;
}) {
    const { storageScope } = useReadingProgress();
    const uniqueLibrarySeedIds = Array.from(new Set(options.librarySeedIds));
    const uniqueExcludeIds = Array.from(new Set(options.excludeIds));
    const targetCount = options.targetCount ?? 10;
    const queryKey = useMemo(() => JSON.stringify({
        recentSeedId: options.recentSeedId,
        librarySeedIds: [...uniqueLibrarySeedIds].sort(),
        excludeIds: [...uniqueExcludeIds].sort(),
        targetCount,
        storageScope,
    }), [options.recentSeedId, targetCount, uniqueExcludeIds, uniqueLibrarySeedIds, storageScope]);
    const cachedBrowseRecommendations = useMemo(() => {
        if (typeof window === "undefined") {
            return null;
        }

        return readCachedBrowseRecommendations(localStorage, storageScope, queryKey);
    }, [queryKey, storageScope]);

    const browseRecommendationsQuery = useQuery({
        queryKey: ["browse-recommendations", queryKey],
        enabled: (options.enabled ?? true)
            && Boolean(options.recentSeedId || uniqueLibrarySeedIds.length > 0),
        initialData: cachedBrowseRecommendations?.data,
        initialDataUpdatedAt: cachedBrowseRecommendations ? 0 : undefined,
        queryFn: async ({ signal }) => {
            const response = await fetch("/api/recommendations/browse", {
                signal,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recentSeedId: options.recentSeedId,
                    librarySeedIds: uniqueLibrarySeedIds,
                    excludeIds: uniqueExcludeIds,
                    targetCount,
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to fetch browse recommendations");
            }

            return (await response.json()) as {
                recentItems: ContentItem[];
                libraryItems: ContentItem[];
            };
        },
        placeholderData: keepPreviousData,
        staleTime: 2 * 60 * 1000,
    });

    useEffect(() => {
        if (typeof window === "undefined" || !browseRecommendationsQuery.data) {
            return;
        }

        recordCachedBrowseRecommendations(
            localStorage,
            storageScope,
            queryKey,
            browseRecommendationsQuery.data,
        );
    }, [browseRecommendationsQuery.data, queryKey, storageScope]);

    return browseRecommendationsQuery;
}
