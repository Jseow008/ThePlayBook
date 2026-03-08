"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentCard } from "@/components/ui/ContentCard";
import type { ContentItem } from "@/types/database";

interface FeaturedReadsCarouselProps {
    items: ContentItem[];
}

export function FeaturedReadsCarousel({ items }: FeaturedReadsCarouselProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScrollPosition = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;

        const tolerance = 2;
        setCanScrollLeft(el.scrollLeft > tolerance);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - tolerance);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        checkScrollPosition();

        el.addEventListener("scroll", checkScrollPosition, { passive: true });
        window.addEventListener("resize", checkScrollPosition);

        return () => {
            el.removeEventListener("scroll", checkScrollPosition);
            window.removeEventListener("resize", checkScrollPosition);
        };
    }, [checkScrollPosition, items]);

    function scrollBy(direction: "left" | "right") {
        const el = scrollRef.current;
        if (!el) return;

        // Scroll by roughly one card width + gap
        const scrollAmount = 260;
        el.scrollBy({
            left: direction === "left" ? -scrollAmount : scrollAmount,
            behavior: "smooth",
        });
    }

    return (
        <div className="group/carousel relative">
            {/* Scrollable track */}
            <div
                ref={scrollRef}
                className="-mx-6 snap-x snap-mandatory overflow-x-auto scroll-smooth px-6 pb-4 scrollbar-hide"
            >
                <div className="flex min-w-max gap-4 sm:gap-6">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className="relative w-[160px] flex-none shrink-0 snap-start sm:w-[200px] md:w-[240px]"
                        >
                            <ContentCard
                                item={item}
                                enableUserState={false}
                                hideBookmark
                                hideProgressBar
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Left arrow */}
            <button
                type="button"
                aria-label="Scroll left"
                onClick={() => scrollBy("left")}
                className={cn(
                    "focus-ring absolute -left-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/80 p-2 text-white/70 shadow-xl backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white md:flex",
                    canScrollLeft
                        ? "opacity-0 group-hover/carousel:opacity-100"
                        : "pointer-events-none opacity-0"
                )}
            >
                <ChevronLeft className="size-5" />
            </button>

            {/* Right arrow */}
            <button
                type="button"
                aria-label="Scroll right"
                onClick={() => scrollBy("right")}
                className={cn(
                    "focus-ring absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/80 p-2 text-white/70 shadow-xl backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white md:flex",
                    canScrollRight
                        ? "opacity-0 group-hover/carousel:opacity-100"
                        : "pointer-events-none opacity-0"
                )}
            >
                <ChevronRight className="size-5" />
            </button>
        </div>
    );
}
