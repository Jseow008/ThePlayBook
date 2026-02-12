"use client";

import { useEffect, useState, useRef } from "react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import type { ContentItem } from "@/types/database";
import { ContentCard } from "@/components/ui/ContentCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ContinueReadingRow() {
    const { inProgressIds, isLoaded } = useReadingProgress();
    const [items, setItems] = useState<ContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

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

    // Scroll handlers
    const scroll = (direction: "left" | "right") => {
        if (!scrollRef.current) return;
        const scrollAmount = scrollRef.current.clientWidth * 0.8;
        scrollRef.current.scrollBy({
            left: direction === "left" ? -scrollAmount : scrollAmount,
            behavior: "smooth",
        });
    };

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setShowLeftArrow(scrollLeft > 20);
        setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 20);
    };

    // Initialize arrow state when items load
    useEffect(() => {
        if (!isLoading && items.length > 0 && scrollRef.current) {
            const { scrollWidth, clientWidth } = scrollRef.current;
            setShowRightArrow(scrollWidth > clientWidth);
        }
    }, [isLoading, items]);


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
        <section className="mb-10 space-y-4 animate-in fade-in duration-500 group/lane">
            <div className="flex items-center gap-2 px-6 lg:px-16">
                <h2 className="text-xl md:text-2xl font-semibold text-foreground font-display">Continue Reading</h2>
            </div>

            <div className="relative">
                {/* Left Arrow */}
                <button
                    onClick={() => scroll("left")}
                    aria-label="Scroll left"
                    className={cn(
                        "focus-ring absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-card/90 text-foreground border border-border flex items-center justify-center transition-opacity hover:bg-card",
                        showLeftArrow
                            ? "opacity-0 group-hover/lane:opacity-100"
                            : "opacity-0 pointer-events-none"
                    )}
                >
                    <ChevronLeft className="size-6" />
                </button>

                {/* Right Arrow */}
                <button
                    onClick={() => scroll("right")}
                    aria-label="Scroll right"
                    className={cn(
                        "focus-ring absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-card/90 text-foreground border border-border flex items-center justify-center transition-opacity hover:bg-card",
                        showRightArrow
                            ? "opacity-0 group-hover/lane:opacity-100"
                            : "opacity-0 pointer-events-none"
                    )}
                >
                    <ChevronRight className="size-6" />
                </button>

                {/* Content Container */}
                <div className="relative w-full overflow-hidden">
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        className="flex gap-4 overflow-x-auto px-6 lg:px-16 pb-4 scrollbar-hide snap-x snap-mandatory scroll-smooth"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {items.map((item) => (
                            <div key={item.id} className="flex-none w-[200px] md:w-[240px] snap-start">
                                <ContentCard item={item} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none" />
            </div>
        </section>
    );
}
