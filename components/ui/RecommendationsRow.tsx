"use client";

import { useMemo } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentLane } from "@/components/ui/ContentLane";
import { useBatchContentItems, useRecommendations } from "@/hooks/use-content-queries";

export function RecommendationsRow() {
    const { completedIds, inProgressIds, myListIds, isLoaded } = useReadingProgress();

    const mostRecentId = completedIds[0] || inProgressIds[0] || null;
    const clusterIds = useMemo(
        () => Array.from(new Set([...completedIds, ...myListIds])),
        [completedIds, myListIds]
    );

    const isWorthFetchingGeneral =
        clusterIds.length > 1 || (clusterIds.length === 1 && clusterIds[0] !== mostRecentId);

    const { data: recentItems = [], isLoading: recentLoading } = useRecommendations(
        mostRecentId ? [mostRecentId] : [],
        { enabled: isLoaded && !!mostRecentId }
    );

    const { data: recentTitleItems = [], isLoading: recentTitleLoading } = useBatchContentItems(
        mostRecentId ? [mostRecentId] : [],
        { enabled: isLoaded && !!mostRecentId }
    );

    const { data: generalItems = [], isLoading: generalLoading } = useRecommendations(
        clusterIds,
        { enabled: isLoaded && isWorthFetchingGeneral }
    );

    const recentTitle = recentTitleItems[0]?.title || "";
    const isLoading = recentLoading || recentTitleLoading || generalLoading;

    if (!isLoaded || (!mostRecentId && clusterIds.length === 0)) return null;
    if (!isLoading && !recentItems.length && !generalItems.length) return null;

    if (isLoading) {
        return (
            <section className="space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center gap-2 px-6 lg:px-16">
                    <div className="h-7 w-64 bg-card/50 rounded-md animate-pulse" />
                </div>
                <div className="flex gap-4 overflow-hidden px-6 lg:px-16 pb-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex-none w-[200px] md:w-[240px] aspect-[2/3] bg-card/50 rounded-lg animate-pulse" />
                    ))}
                </div>
            </section>
        );
    }

    return (
        <>
            {/* Lane 1: Specific Context */}
            {recentItems.length > 0 && (
                <ContentLane
                    title={recentTitle ? `Because you read "${recentTitle}"` : "Because of your recent reading"}
                    items={recentItems}
                />
            )}

            {/* Lane 2: General Taste */}
            {isWorthFetchingGeneral && generalItems.length > 0 && (
                <ContentLane
                    title="Recommended for You"
                    items={generalItems}
                />
            )}
        </>
    );
}
