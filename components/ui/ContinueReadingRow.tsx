"use client";

import { useEffect, useState } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import type { ContentItem } from "@/types/database";
import { ContentCard } from "@/components/ui/ContentCard";
import { ChevronRight } from "lucide-react";

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

    if (!isLoaded || isLoading || items.length === 0) return null;

    return (
        <section className="mb-10 space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center gap-2 px-6 lg:px-16">
                <h2 className="text-xl md:text-2xl font-semibold text-white">Continue Reading</h2>
            </div>

            <div className="relative group/row">
                <div
                    className="flex gap-4 overflow-x-auto px-6 lg:px-16 pb-4 scrollbar-hide snap-x snap-mandatory"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {items.map((item) => (
                        <div key={item.id} className="flex-none w-[200px] md:w-[240px] snap-start">
                            <ContentCard item={item} />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
