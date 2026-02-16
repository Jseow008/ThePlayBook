"use client";

import { useEffect, useState } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import type { ContentItem } from "@/types/database";
import { ContentLane } from "@/components/ui/ContentLane";

export function RecommendationsRow() {
    const { completedIds, inProgressIds, isLoaded } = useReadingProgress();
    const [items, setItems] = useState<ContentItem[]>([]);
    const [sourceTitle, setSourceTitle] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded) return;

        // Use completed books first, fall back to in-progress
        const historyIds = completedIds.length > 0 ? completedIds : inProgressIds;

        if (historyIds.length === 0) {
            setIsLoading(false);
            return;
        }

        const fetchRecommendations = async () => {
            try {
                const response = await fetch("/api/recommendations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ completedIds: historyIds }),
                });

                if (response.ok) {
                    const data: ContentItem[] = await response.json();
                    setItems(data);
                }

                // Also fetch the title of the most recent completed book for the lane header
                if (historyIds.length > 0) {
                    try {
                        const batchRes = await fetch("/api/content/batch", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ids: [historyIds[0]] }),
                        });
                        if (batchRes.ok) {
                            const batchData: ContentItem[] = await batchRes.json();
                            if (batchData.length > 0) {
                                setSourceTitle(batchData[0].title);
                            }
                        }
                    } catch {
                        // Non-critical — just won't show dynamic title
                    }
                }
            } catch (error) {
                console.error("Failed to fetch recommendations", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchRecommendations();
    }, [completedIds, inProgressIds, isLoaded]);

    if (!isLoaded || (completedIds.length === 0 && inProgressIds.length === 0 && !isLoading)) return null;

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

    if (items.length === 0) return null;

    const title = sourceTitle
        ? `Because you enjoyed "${sourceTitle}"`
        : "Recommended for You";

    return (
        <ContentLane
            title={title}
            items={items}
        />
    );
}
