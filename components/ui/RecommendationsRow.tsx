"use client";

import { useMemo } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentLane } from "@/components/ui/ContentLane";
import { useBrowseRecommendations } from "@/hooks/use-content-queries";

const BROWSE_LIBRARY_SEED_LIMIT = 20;

export function RecommendationsRow({
    cardTitleDensity = "default",
}: {
    cardTitleDensity?: "default" | "app-compact";
}) {
    const { completedIds, inProgressIds, myListIds, isLoaded } = useReadingProgress();
    const mostRecentId = completedIds[0] || inProgressIds[0] || null;
    const clusterIds = useMemo(
        () => Array.from(new Set([...completedIds, ...myListIds])),
        [completedIds, myListIds]
    );
    const librarySeedIds = useMemo(
        () => clusterIds.slice(0, BROWSE_LIBRARY_SEED_LIMIT),
        [clusterIds],
    );
    const knownRecommendationIds = useMemo(
        () => Array.from(new Set([...completedIds, ...inProgressIds, ...myListIds])),
        [completedIds, inProgressIds, myListIds],
    );

    const isWorthFetchingGeneral = clusterIds.length >= 5;
    const hasFetchableRecommendationSeeds = Boolean(
        mostRecentId || (isWorthFetchingGeneral && clusterIds.length > 0),
    );

    const { data } = useBrowseRecommendations({
        recentSeedId: mostRecentId,
        librarySeedIds: isWorthFetchingGeneral ? librarySeedIds : [],
        excludeIds: knownRecommendationIds,
        enabled: isLoaded && hasFetchableRecommendationSeeds,
        targetCount: 10,
    });

    if (!isLoaded || !hasFetchableRecommendationSeeds) return null;

    const recentItems = data?.recentItems ?? [];
    const libraryItems = data?.libraryItems ?? [];
    const hasItems = recentItems.length > 0 || libraryItems.length > 0;

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
            {isWorthFetchingGeneral && libraryItems.length > 0 && (
                <ContentLane
                    title="Based on your library"
                    items={libraryItems}
                    cardTitleDensity={cardTitleDensity}
                />
            )}
        </>
    );
}
