"use client";

import { useEffect, useState } from "react";
import { ContentLane } from "@/components/ui/ContentLane";
import type { ContentItem } from "@/types/database";

interface ContinueReadingProps {
    allItems: ContentItem[];
}

export function ContinueReading({ allItems }: ContinueReadingProps) {
    const [inProgressItems, setInProgressItems] = useState<ContentItem[]>([]);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);

        // Find all progress keys in localStorage
        const progressKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith("flux_progress_")) progressKeys.push(k);
        }

        // Extract IDs and get corresponding items
        const inProgress = progressKeys
            .map(key => {
                const id = key.replace("flux_progress_", "");
                const item = allItems.find(i => i.id === id);

                // Get last read timestamp and completion status for sorting/filtering
                if (item) {
                    try {
                        const data = JSON.parse(localStorage.getItem(key) || "{}");
                        // Skip completed items
                        if (data.isCompleted) {
                            return null;
                        }
                        return { item, lastReadAt: data.lastReadAt || "" };
                    } catch {
                        return { item, lastReadAt: "" };
                    }
                }
                return null;
            })
            .filter((entry): entry is { item: ContentItem, lastReadAt: string } => entry !== null)
            .sort((a, b) => {
                // Sort by most recently read
                if (!a.lastReadAt) return 1;
                if (!b.lastReadAt) return -1;
                return new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime();
            })
            .map(entry => entry.item);

        setInProgressItems(inProgress);
    }, [allItems]);

    if (!isMounted || inProgressItems.length === 0) {
        return null;
    }

    return (
        <ContentLane
            title="Continue Reading"
            items={inProgressItems}
        />
    );
}
