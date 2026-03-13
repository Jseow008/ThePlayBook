"use client";

import { useMemo } from "react";
import { ContentLane } from "@/components/ui/ContentLane";
import type { ContentItem } from "@/types/database";
import { useReadingProgress } from "@/hooks/useReadingProgress";

interface ContinueReadingProps {
    allItems: ContentItem[];
}

export function ContinueReading({ allItems }: ContinueReadingProps) {
    const { inProgressIds, isLoaded } = useReadingProgress();

    const inProgressItems = useMemo(
        () =>
            inProgressIds
                .map((id) => allItems.find((item) => item.id === id))
                .filter((item): item is ContentItem => item !== undefined),
        [allItems, inProgressIds],
    );

    if (!isLoaded || inProgressItems.length === 0) {
        return null;
    }

    return (
        <ContentLane
            title="Continue Reading"
            items={inProgressItems}
            cardNavigationMode="resume"
        />
    );
}
