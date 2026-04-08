"use client";

import { useEffect, useMemo, useState } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentLane } from "@/components/ui/ContentLane";
import { useRecommendations } from "@/hooks/use-content-queries";

export function RecommendationsRow({
    cardTitleDensity = "default",
}: {
    cardTitleDensity?: "default" | "app-compact";
}) {
    const { completedIds, inProgressIds, myListIds, isLoaded } = useReadingProgress();
    const [shouldLoadRecommendations, setShouldLoadRecommendations] = useState(false);

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

    useEffect(() => {
        if (!isLoaded) {
            setShouldLoadRecommendations(false);
            return;
        }

        let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
        let idleId: number | null = null;

        const enableRecommendations = () => {
            setShouldLoadRecommendations(true);
        };

        if ("requestIdleCallback" in globalThis) {
            idleId = globalThis.requestIdleCallback(enableRecommendations, { timeout: 1200 });
        } else {
            timeoutId = globalThis.setTimeout(enableRecommendations, 400);
        }

        return () => {
            if (idleId !== null && "cancelIdleCallback" in globalThis) {
                globalThis.cancelIdleCallback(idleId);
            }
            if (timeoutId !== null) {
                globalThis.clearTimeout(timeoutId);
            }
        };
    }, [isLoaded]);

    const { data: recentItems = [], isLoading: recentLoading } = useRecommendations(
        mostRecentId ? [mostRecentId] : [],
        {
            enabled: isLoaded && shouldLoadRecommendations && !!mostRecentId,
            excludeIds: knownRecommendationIds,
        }
    );
    const generalExcludeIds = useMemo(
        () => Array.from(new Set([
            ...knownRecommendationIds,
            ...recentItems.map((item) => item.id),
        ])),
        [knownRecommendationIds, recentItems],
    );
    const shouldFetchGeneral = (
        isLoaded
        && shouldLoadRecommendations
        && isWorthFetchingGeneral
        && (!mostRecentId || !recentLoading)
    );

    const { data: generalItems = [], isLoading: generalLoading } = useRecommendations(
        clusterIds,
        {
            enabled: shouldFetchGeneral,
            excludeIds: generalExcludeIds,
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

    const isLoading = recentLoading || generalLoading;
    const hasItems = recentItems.length > 0 || dedupedGeneralItems.length > 0;

    if (!isLoaded || (!mostRecentId && clusterIds.length === 0)) return null;
    if (!isLoading && !hasItems) return null;

    if (isLoading && !hasItems) {
        return (
            <section className="space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center gap-2 px-4 md:px-6 lg:px-16">
                    <div className="h-7 w-64 bg-card/50 rounded-md animate-pulse" />
                </div>
                <div className="flex gap-3 overflow-hidden px-4 pb-3 md:gap-4 md:px-6 md:pb-4 lg:px-16">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="flex-none w-[168px] aspect-[2/3] rounded-lg bg-card/50 animate-pulse md:w-[240px]" />
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
                    title="Because of your recent reading"
                    items={recentItems}
                    cardTitleDensity={cardTitleDensity}
                />
            )}

            {/* Lane 2: General Taste */}
            {isWorthFetchingGeneral && dedupedGeneralItems.length > 0 && (
                <ContentLane
                    title="Recommended for You"
                    items={dedupedGeneralItems}
                    cardTitleDensity={cardTitleDensity}
                />
            )}
        </>
    );
}
