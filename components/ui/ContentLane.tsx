"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/types/database";
import { ContentCard } from "@/components/ui/ContentCard";

interface ContentLaneProps {
    title: React.ReactNode;
    items: ContentItem[];
    viewAllHref?: string;
    cardNavigationMode?: "preview" | "resume";
    cardTitleDensity?: "default" | "app-compact";
    enableCardUserState?: boolean;
}

const LANE_CARD_SELECTOR = "[data-content-lane-card]";

export function ContentLane({
    title,
    items,
    viewAllHref,
    cardNavigationMode = "preview",
    cardTitleDensity = "default",
    enableCardUserState = true,
}: ContentLaneProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    const scroll = (direction: "left" | "right") => {
        const container = scrollRef.current;
        if (!container) return;

        const cards = Array.from(container.querySelectorAll<HTMLElement>(LANE_CARD_SELECTOR));
        if (cards.length === 0) return;

        const containerStyle = window.getComputedStyle(container);
        const containerPaddingLeft = parseFloat(containerStyle.paddingLeft) || 0;
        const maxScrollLeft = container.scrollWidth - container.clientWidth;
        const getCardScrollLeft = (card: HTMLElement) => card.offsetLeft - containerPaddingLeft;
        const currentIndex = cards.reduce((closestIndex, card, index) => {
            const closestDistance = Math.abs(getCardScrollLeft(cards[closestIndex]) - container.scrollLeft);
            const cardDistance = Math.abs(getCardScrollLeft(card) - container.scrollLeft);
            return cardDistance < closestDistance ? index : closestIndex;
        }, 0);
        const cardStride = cards[1]
            ? cards[1].offsetLeft - cards[0].offsetLeft
            : cards[0].offsetWidth;
        const visibleCardCount = Math.max(1, Math.floor((container.clientWidth - containerPaddingLeft) / cardStride));
        const scrollStep = Math.max(1, visibleCardCount - 1);
        const targetIndex = Math.max(
            0,
            Math.min(
                cards.length - 1,
                direction === "left" ? currentIndex - scrollStep : currentIndex + scrollStep,
            ),
        );
        const targetScrollLeft = Math.max(0, Math.min(getCardScrollLeft(cards[targetIndex]), maxScrollLeft));

        container.scrollTo({
            left: targetScrollLeft,
            behavior: "smooth",
        });
    };

    const updateArrowState = useCallback(() => {
        const container = scrollRef.current;
        if (!container) return;

        const { scrollLeft, scrollWidth, clientWidth } = container;
        const hasOverflow = scrollWidth > clientWidth + 20;
        setShowLeftArrow(scrollLeft > 20);
        setShowRightArrow(hasOverflow && scrollLeft < scrollWidth - clientWidth - 20);
    }, []);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;
        const resizeObserver = typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(updateArrowState);

        updateArrowState();
        container.addEventListener("scroll", updateArrowState, { passive: true });
        window.addEventListener("resize", updateArrowState);
        resizeObserver?.observe(container);
        container.querySelectorAll<HTMLElement>(LANE_CARD_SELECTOR).forEach((card) => {
            resizeObserver?.observe(card);
        });

        return () => {
            resizeObserver?.disconnect();
            container.removeEventListener("scroll", updateArrowState);
            window.removeEventListener("resize", updateArrowState);
        };
    }, [items.length, updateArrowState]);

    if (items.length === 0) return null;

    return (
        <section
            className={cn("py-0.5 md:py-2 group/lane animate-in fade-in duration-500")}
        >
            {/* Header */}
            <div className="mb-1.5 flex items-center justify-between px-4 md:mb-2 md:px-6 lg:px-16">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground md:text-2xl">
                    {title}
                    {viewAllHref && (
                        <Link
                            href={viewAllHref}
                            className="focus-ring rounded-sm text-sm font-normal text-muted-foreground transition-all hover:translate-x-1 hover:text-primary md:opacity-0 md:group-hover/lane:opacity-100 md:focus-visible:opacity-100"
                        >
                            <span className="flex items-center gap-1">
                                Explore All <ChevronRight className="size-4" />
                            </span>
                        </Link>
                    )}
                </h2>
            </div>

            {/* Carousel */}
            <div className="relative">
                {/* Left Arrow */}
                <button
                    type="button"
                    onClick={() => scroll("left")}
                    aria-label="Scroll left"
                    className={cn(
                        "focus-ring absolute left-2 top-1/2 -translate-y-1/2 z-20 hidden w-11 h-11 rounded-full bg-background/70 backdrop-blur-md text-foreground border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.5)] items-center justify-center transition-all hover:bg-background/90 hover:scale-110 active:scale-95 md:flex",
                        showLeftArrow
                            ? "opacity-40 group-hover/lane:opacity-100"
                            : "opacity-0 pointer-events-none"
                    )}
                >
                    <ChevronLeft className="size-6" />
                </button>

                {/* Content */}
                {/* Scroll Container Wrapper - Clipped to hide scrollbar */}
                <div className="relative w-full overflow-hidden">
                    <div
                        ref={scrollRef}
                        className="scrollbar-hide flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-3 scroll-smooth md:scroll-px-6 md:gap-4 md:px-6 md:pb-4 md:pt-4 lg:scroll-px-16 lg:px-16"
                    >
                        {items.map((item) => (
                            <div
                                key={item.id}
                                data-content-lane-card
                                className="w-[168px] min-w-[168px] snap-start md:w-[240px] md:min-w-[240px]"
                            >
                                <ContentCard
                                    item={item}
                                    enableUserState={enableCardUserState}
                                    navigationMode={cardNavigationMode}
                                    titleDensity={cardTitleDensity}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Arrow */}
                <button
                    type="button"
                    onClick={() => scroll("right")}
                    aria-label="Scroll right"
                    className={cn(
                        "focus-ring absolute right-2 top-1/2 -translate-y-1/2 z-20 hidden w-11 h-11 rounded-full bg-background/70 backdrop-blur-md text-foreground border border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.5)] items-center justify-center transition-all hover:bg-background/90 hover:scale-110 active:scale-95 md:flex",
                        showRightArrow
                            ? "opacity-60 group-hover/lane:opacity-100"
                            : "opacity-0 pointer-events-none"
                    )}
                >
                    <ChevronRight className="size-6" />
                </button>

                {/* Fade edges */}
                <div
                    className={cn(
                        "absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-background to-transparent pointer-events-none transition-opacity duration-200 md:w-24",
                        showLeftArrow ? "opacity-100" : "opacity-0"
                    )}
                />
                <div
                    className={cn(
                        "absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-background to-transparent pointer-events-none transition-opacity duration-200 md:w-24",
                        showRightArrow ? "opacity-100" : "opacity-0"
                    )}
                />
            </div>
        </section>
    );
}
