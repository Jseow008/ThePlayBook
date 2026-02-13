"use client";

import { useEffect, useState } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import type { ContentItem } from "@/types/database";
import { ContentLane } from "@/components/ui/ContentLane";

export function ContinueReadingRow() {
    const { inProgressIds, isLoaded } = useReadingProgress();
    const [items, setItems] = useState<ContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded) return;
        if (inProgressIds.length === 0) {
            setIsLoading(false);
            return;
        }

        const ids = inProgressIds.slice(0, 10); // Limit to top 10 recent items

        const fetchItems = async () => {
            try {
                const response = await fetch("/api/content/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids }),
                });

                if (response.ok) {
                    const data: ContentItem[] = await response.json();
                    // Sort by recency (matching the order of inProgressIds)
                    const sorted = data.sort((a, b) => {
                        return ids.indexOf(a.id) - ids.indexOf(b.id);
                    });
                    setItems(sorted);
                }
            } catch (error) {
                console.error("Failed to fetch continue reading items", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();
    }, [inProgressIds, isLoaded]);

    if (!isLoaded || (inProgressIds.length === 0 && !isLoading)) return null;

    if (isLoading) {
        return (
            <section className="mb-10 space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center gap-2 px-6 lg:px-16">
                    <div className="h-7 w-48 bg-card/50 rounded-md animate-pulse" />
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

    return (
        <ContentLane
            title="Continue Reading"
            items={items}
        />
    );
}
