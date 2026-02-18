"use client";

import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentLane } from "@/components/ui/ContentLane";
import { useBatchContentItems } from "@/hooks/use-content-queries";

export function ContinueReadingRow() {
    const { inProgressIds, isLoaded } = useReadingProgress();
    const ids = inProgressIds.slice(0, 10); // Limit to top 10 recent items

    const { data: items = [], isLoading } = useBatchContentItems(ids, {
        enabled: isLoaded,
    });

    if (!isLoaded || ids.length === 0) return null;

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

    if (items.length === 0 && !isLoading) return null;

    return (
        <ContentLane
            title="Continue Reading"
            items={items}
        />
    );
}
