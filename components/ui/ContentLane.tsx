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
}


export function ContentLane({ title, items, viewAllHref }: ContentLaneProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(false);

    const scroll = (direction: "left" | "right") => {
        if (!scrollRef.current) return;
        const scrollAmount = scrollRef.current.clientWidth * 0.8;
        scrollRef.current.scrollBy({
            left: direction === "left" ? -scrollAmount : scrollAmount,
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

    const [isVisible, setIsVisible] = useState(false);
    const sectionRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect(); // Only animate once
                }
            },
            { threshold: 0.1, rootMargin: "50px" }
        );

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        updateArrowState();
        container.addEventListener("scroll", updateArrowState, { passive: true });
        window.addEventListener("resize", updateArrowState);

        return () => {
            container.removeEventListener("scroll", updateArrowState);
            window.removeEventListener("resize", updateArrowState);
        };
    }, [items.length, updateArrowState]);

    if (items.length === 0) return null;

    return (
        <section
            ref={sectionRef}
            className={cn(
                "py-0.5 md:py-2 group/lane transition-all duration-700 transform",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            )}
        >
            {/* Header */}
            <div className="mb-1.5 flex items-center justify-between px-4 md:mb-2 md:px-6 lg:px-16">
                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-foreground md:text-2xl">
                    {title}
                    {viewAllHref && (
                        <Link
                            href={viewAllHref}
                            className="focus-ring rounded-sm text-sm font-normal text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover/lane:opacity-100"
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
                        "focus-ring absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-card/90 text-foreground border border-border flex items-center justify-center transition-opacity hover:bg-card",
                        showLeftArrow
                            ? "opacity-0 group-hover/lane:opacity-100"
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
                        className="scrollbar-hide flex gap-3 overflow-x-auto px-4 pb-3 pt-3 scroll-smooth md:gap-4 md:px-6 md:pb-4 md:pt-4 lg:px-16"
                    >
                        {items.map((item) => (
                            <div key={item.id} className="w-[168px] min-w-[168px] md:w-[240px] md:min-w-[240px]">
                                <ContentCard item={item} />
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
                        "focus-ring absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-card/90 text-foreground border border-border flex items-center justify-center transition-opacity hover:bg-card",
                        showRightArrow
                            ? "opacity-0 group-hover/lane:opacity-100"
                            : "opacity-0 pointer-events-none"
                    )}
                >
                    <ChevronRight className="size-6" />
                </button>

                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent pointer-events-none" />
            </div>
        </section>
    );
}
