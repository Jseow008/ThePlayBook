"use client";

import { useQuery } from "@tanstack/react-query";
import type { ContentItem } from "@/types/database";

function sortByInputOrder(items: ContentItem[], ids: string[]) {
    return [...items].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
}

export function useBatchContentItems(ids: string[], options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ["content-batch", ids],
        enabled: (options?.enabled ?? true) && ids.length > 0,
        queryFn: async () => {
            const response = await fetch("/api/content/batch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids }),
            });

            if (!response.ok) {
                throw new Error("Failed to fetch content batch");
            }

            const data = (await response.json()) as ContentItem[];
            return sortByInputOrder(data, ids);
        },
        staleTime: 60 * 1000,
    });
}

export function useRecommendations(completedIds: string[], options?: { enabled?: boolean }) {
    const uniqueIds = Array.from(new Set(completedIds));

    return useQuery({
        queryKey: ["recommendations", uniqueIds],
        enabled: (options?.enabled ?? true) && uniqueIds.length > 0,
        queryFn: async () => {
            const response = await fetch("/api/recommendations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ completedIds: uniqueIds }),
            });

            if (!response.ok) {
                throw new Error("Failed to fetch recommendations");
            }

            return (await response.json()) as ContentItem[];
        },
        staleTime: 2 * 60 * 1000,
    });
}
