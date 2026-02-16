"use client";

import { useEffect, useState } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import type { ContentItem } from "@/types/database";
import { ContentLane } from "@/components/ui/ContentLane";

export function RecommendationsRow() {
    const { completedIds, inProgressIds, myListIds, isLoaded } = useReadingProgress();

    // Lane 1: "Because you read X"
    const [recentItems, setRecentItems] = useState<ContentItem[]>([]);
    const [recentTitle, setRecentTitle] = useState<string>("");

    // Lane 2: "Recommended for You"
    const [generalItems, setGeneralItems] = useState<ContentItem[]>([]);

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded) return;

        const performFetches = async () => {
            // 1. Identify the "Source" book for Lane 1 (Most recent completed, or in-progress)
            const mostRecentId = completedIds[0] || inProgressIds[0];

            // 2. Identify the "Cluster" for Lane 2 (All completed + My List)
            // We use a Set to deduplicate
            const clusterIds = Array.from(new Set([...completedIds, ...myListIds]));

            // If we have absolutely no history, stop
            if (!mostRecentId && clusterIds.length === 0) {
                setIsLoading(false);
                return;
            }

            const promises = [];

            // --- FETCH LANE 1 (Specific) ---
            if (mostRecentId) {
                // Fetch recommendations for this specific book
                promises.push(
                    fetch("/api/recommendations", {
                        method: "POST",
                        body: JSON.stringify({ completedIds: [mostRecentId] }),
                    })
                        .then(r => r.ok ? r.json() : [])
                        .then(data => setRecentItems(data))
                );

                // Fetch title of this specific book
                promises.push(
                    fetch("/api/content/batch", {
                        method: "POST",
                        body: JSON.stringify({ ids: [mostRecentId] }),
                    })
                        .then(r => r.ok ? r.json() : [])
                        .then(data => {
                            if (data.length > 0) setRecentTitle(data[0].title);
                        })
                );
            }

            // --- FETCH LANE 2 (General) ---
            // Only fetch if we have a cluster AND it's different/larger than just the single recent book
            // (e.g. if I've only read 1 book, Lane 1 and Lane 2 would be identical, so skip Lane 2)
            const isWorthFetchingGeneral = clusterIds.length > 1 || (clusterIds.length === 1 && clusterIds[0] !== mostRecentId);

            if (isWorthFetchingGeneral) {
                promises.push(
                    fetch("/api/recommendations", {
                        method: "POST",
                        body: JSON.stringify({ completedIds: clusterIds }),
                    })
                        .then(r => r.ok ? r.json() : [])
                        .then(data => setGeneralItems(data))
                );
            }

            try {
                await Promise.all(promises);
            } catch (error) {
                console.error("Failed to fetch recommendations", error);
            } finally {
                setIsLoading(false);
            }
        };

        performFetches();
    }, [completedIds, inProgressIds, myListIds, isLoaded]);

    if (!isLoaded || (!recentItems.length && !generalItems.length && !isLoading)) return null;

    if (isLoading) {
        return (
            <section className="mb-10 space-y-4 animate-in fade-in duration-500">
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
        <div className="space-y-8">
            {/* Lane 1: Specific Context */}
            {recentItems.length > 0 && (
                <ContentLane
                    title={recentTitle ? `Because you read "${recentTitle}"` : "Because of your recent reading"}
                    items={recentItems}
                />
            )}

            {/* Lane 2: General Taste */}
            {generalItems.length > 0 && (
                <ContentLane
                    title="Recommended for You"
                    items={generalItems}
                />
            )}
        </div>
    );
}
