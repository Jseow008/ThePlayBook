"use client";

import { useMemo } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentLane } from "@/components/ui/ContentLane";
import { useRecommendations } from "@/hooks/use-content-queries";

export function RecommendationsRow({
    cardTitleDensity = "default",
}: {
    cardTitleDensity?: "default" | "app-compact";
}) {
    const { completedIds, inProgressIds, myListIds, isLoaded } = useReadingProgress();
    const shouldLoadRecommendations = isLoaded;

    const mostRecentId = completedIds[0] || inProgressIds[0] || null;
    const clusterIds = useMemo(
        () => Array.from(new Set([...completedIds, ...myListIds])),
        [completedIds, myListIds]
    );
    const knownRecommendationIds = useMemo(
        () => Array.from(new Set([...completedIds, ...inProgressIds, ...myListIds])),
        [completedIds, inProgressIds, myListIds],
    );

    const isWorthFetchingGeneral = clusterIds.length >= 5;

    const { data: recentItems = [], isLoading: recentLoading } = useRecommendations(
        mostRecentId ? [mostRecentId] : [],
        {
            enabled: isLoaded && shouldLoadRecommendations && !!mostRecentId,
            excludeIds: knownRecommendationIds,
        }
    );
    const shouldFetchGeneral = (
        isLoaded
        && shouldLoadRecommendations
        && isWorthFetchingGeneral
    );

    const { data: generalItems = [], isLoading: generalLoading } = useRecommendations(
        clusterIds,
        {
            enabled: shouldFetchGeneral,
            excludeIds: knownRecommendationIds,
        }
    );
    const recentItemIds = useMemo(
        () => new Set(recentItems.map((item) => item.id)),
        [recentItems],
    );
    const dedupedGeneralItems = useMemo(
        () => generalItems.filter((item) => !recentItemIds.has(item.id)),
        [generalItems, recentItemIds],
    );
    const shouldRefillGeneral = (
        shouldFetchGeneral
        && recentItems.length > 0
        && !recentLoading
        && !generalLoading
        && generalItems.length > 0
        && dedupedGeneralItems.length < Math.min(4, generalItems.length)
    );
    const generalRefillExcludeIds = useMemo(
        () => Array.from(new Set([
            ...knownRecommendationIds,
            ...recentItems.map((item) => item.id),
        ])),
        [knownRecommendationIds, recentItems],
    );
    const { data: refilledGeneralItems = [] } = useRecommendations(
        clusterIds,
        {
            enabled: shouldRefillGeneral,
            excludeIds: generalRefillExcludeIds,
        }
    );
    const dedupedRefilledGeneralItems = useMemo(
        () => refilledGeneralItems.filter((item) => !recentItemIds.has(item.id)),
        [refilledGeneralItems, recentItemIds],
    );
    const finalGeneralItems = dedupedRefilledGeneralItems.length > dedupedGeneralItems.length
        ? dedupedRefilledGeneralItems
        : dedupedGeneralItems;

    const hasItems = recentItems.length > 0 || finalGeneralItems.length > 0;

    if (!isLoaded || (!mostRecentId && clusterIds.length === 0)) return null;
    if (!hasItems) return null;

    return (
        <>
            {/* Lane 1: Specific Context */}
            {recentItems.length > 0 && (
                <ContentLane
                    title="Based on your recent reading"
                    items={recentItems}
                    cardTitleDensity={cardTitleDensity}
                />
            )}

            {/* Lane 2: General Taste */}
            {isWorthFetchingGeneral && finalGeneralItems.length > 0 && (
                <ContentLane
                    title="Based on your library"
                    items={finalGeneralItems}
                    cardTitleDensity={cardTitleDensity}
                />
            )}
        </>
    );
}
