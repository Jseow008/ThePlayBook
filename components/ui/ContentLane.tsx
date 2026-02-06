"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, BookOpen, Headphones, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/types/database";

interface ContentLaneProps {
    title: string;
    items: ContentItem[];
    viewAllHref?: string;
}

function ContentCard({ item, index }: { item: ContentItem; index: number }) {
    const typeIcon = {
        podcast: Headphones,
        book: BookOpen,
        article: FileText,
    }[item.type];
    const Icon = typeIcon;

    return (
        <Link
            href={`/read/${item.id}`}
            className="group relative flex-shrink-0 w-[180px] md:w-[200px] lg:w-[220px] aspect-[2/3] rounded-md overflow-hidden transition-transform duration-300 hover:scale-105 hover:z-10"
            style={{ animationDelay: `${index * 50}ms` }}
        >
            {/* Background */}
            {item.cover_image_url ? (
                <img
                    src={item.cover_image_url}
                    alt={item.title}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-700 via-zinc-800 to-zinc-900 flex items-center justify-center">
                    <Icon className="size-16 text-zinc-600" />
                </div>
            )}

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            {/* Bottom Info - Always visible */}
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">
                    {item.type}
                </p>
                <h3 className="font-medium text-sm text-white line-clamp-2 group-hover:text-primary transition-colors">
                    {item.title}
                </h3>
            </div>

            {/* Hover Details */}
            <div className="absolute inset-x-0 top-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                {item.author && (
                    <p className="text-xs text-zinc-300 truncate">
                        {item.author}
                    </p>
                )}
            </div>

            {/* Border on hover */}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-primary/50 rounded-md transition-colors" />
        </Link>
    );
}

export function ContentLane({ title, items, viewAllHref }: ContentLaneProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [showLeftArrow, setShowLeftArrow] = useState(false);
    const [showRightArrow, setShowRightArrow] = useState(true);

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

    if (items.length === 0) return null;

    return (
        <section
            ref={sectionRef}
            className={cn(
                "py-6 group/lane transition-all duration-700 transform",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-6 lg:px-16">
                <h2 className="text-xl md:text-2xl font-semibold text-foreground flex items-center gap-2">
                    {title}
                    {viewAllHref && (
                        <Link
                            href={viewAllHref}
                            className="text-sm font-normal text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover/lane:opacity-100"
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
                    onClick={() => scroll("left")}
                    className={cn(
                        "absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 text-white flex items-center justify-center transition-opacity hover:bg-black",
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
                        onScroll={handleScroll}
                        className="flex gap-3 overflow-x-auto px-6 lg:px-16 scroll-smooth pb-12"
                        style={{
                            scrollbarWidth: 'none',
                            msOverflowStyle: 'none',
                            marginBottom: '-30px', /* Pull bottom up to hide any padding excess if needed */
                            clipPath: 'inset(0 0 20px 0)' /* Clip the bottom scrollbar area */
                        }}
                    >
                        {items.map((item, index) => (
                            <ContentCard key={item.id} item={item} index={index} />
                        ))}
                    </div>
                </div>

                {/* Right Arrow */}
                <button
                    onClick={() => scroll("right")}
                    className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 text-white flex items-center justify-center transition-opacity hover:bg-black",
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
