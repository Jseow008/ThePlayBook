"use client";

import { useEffect, useState } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import type { ContentItem } from "@/types/database";
import { ContentCard } from "@/components/ui/ContentCard";
import { Clock, BookOpen } from "lucide-react";
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

        // Take only the top 3 most recent items for a cleaner look
        const recentIds = inProgressIds.slice(0, 3);

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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="aspect-[2/3] bg-card border border-border rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    if (recentItems.length === 0) {
        return (
            <div className="text-center py-16 bg-card/50 rounded-2xl border border-border border-dashed">
                <div className="inline-flex items-center justify-center p-4 bg-muted rounded-full mb-4">
                    <BookOpen className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No recent activity</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto px-4">
                    Start reading books or listening to podcasts to see your progress here.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center px-5 py-2.5 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors"
                >
                    Browse Library
                </Link>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {recentItems.map((item) => (
                <ContentCard key={item.id} item={item} />
            ))}
        </div>
    );
}
