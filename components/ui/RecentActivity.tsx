"use client";

import { useEffect, useState } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import type { ContentItem } from "@/types/database";
import { ContentCard } from "@/components/ui/ContentCard";
import { Clock } from "lucide-react";
import Link from "next/link";

export function RecentActivity() {
    const { inProgressIds, isLoaded } = useReadingProgress();
    const [recentItems, setRecentItems] = useState<ContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isLoaded) return;

        if (inProgressIds.length === 0) {
            setIsLoading(false);
            return;
        }

        // Take only the top 4 most recent items
        const recentIds = inProgressIds.slice(0, 4);

        const fetchItems = async () => {
            try {
                const response = await fetch("/api/content/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: recentIds }),
                });

                if (response.ok) {
                    const data: ContentItem[] = await response.json();
                    // Sort by recency (matching the order of IDs in recentIds)
                    const sorted = data.sort((a, b) => {
                        return recentIds.indexOf(a.id) - recentIds.indexOf(b.id);
                    });
                    setRecentItems(sorted);
                }
            } catch (error) {
                console.error("Failed to fetch recent items", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();
    }, [inProgressIds, isLoaded]);

    if (!isLoaded || isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] bg-zinc-800/50 rounded-lg animate-pulse" />
                ))}
            </div>
        );
    }

    if (recentItems.length === 0) {
        return (
            <div className="text-center py-12 bg-zinc-900/30 rounded-xl border border-zinc-800/50 border-dashed">
                <div className="inline-flex items-center justify-center p-4 bg-zinc-800/50 rounded-full mb-4">
                    <Clock className="w-8 h-8 text-zinc-500" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No recent activity</h3>
                <p className="text-zinc-400 mb-6 max-w-sm mx-auto">
                    Start reading books or listening to podcasts to see your history here.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-white/90 transition-colors"
                >
                    Browse Library
                </Link>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {recentItems.map((item) => (
                <ContentCard key={item.id} item={item} />
            ))}
        </div>
    );
}
