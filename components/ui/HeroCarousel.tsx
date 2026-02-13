"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Info, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/types/database";
import { APP_NAME } from "@/lib/brand";

interface HeroCarouselProps {
    items: ContentItem[];
}

export function HeroCarousel({ items }: HeroCarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [scrollY, setScrollY] = useState(0);

    // Parallax Scroll Effect
    useEffect(() => {
        const handleScroll = () => {
            setScrollY(window.scrollY);
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Auto-rotate every 5 seconds per design spec
    useEffect(() => {
        if (items.length <= 1) return;

        const interval = setInterval(() => {
            setIsTransitioning(true);
            setTimeout(() => {
                setActiveIndex((prev) => (prev + 1) % items.length);
                setIsTransitioning(false);
            }, 800); // Slightly longer transition sync
        }, 5000);

        return () => clearInterval(interval);
    }, [items.length]);

    if (items.length === 0) {
        return (
            <div className="relative h-[85vh] min-h-[500px] w-full overflow-hidden bg-zinc-900 flex items-center justify-center">
                <div className="absolute inset-0 bg-black/50" />
                <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
                    <h1 className="text-5xl md:text-7xl font-black text-white mb-6">
                        {APP_NAME}
                    </h1>
                    <p className="text-xl text-zinc-300 max-w-2xl mx-auto bg-black/40 p-4 rounded-xl backdrop-blur-sm">
                        A curated stream of insights from books, podcasts, and articles. Check back soon for featured content.
                    </p>
                </div>
                {/* Bottom Gradient to blend with content lanes */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-10" />
            </div>
        );
    }

    const activeItem = items[activeIndex];

    // Safely extract description from quick_mode_json
    const quickMode = activeItem.quick_mode_json as { hook?: string; big_idea?: string } | null;
    const description = quickMode?.hook || quickMode?.big_idea || `Experience this ${APP_NAME} content today.`;

    return (
        <div className="relative h-[85vh] min-h-[500px] w-full overflow-hidden bg-background">
            {/* Background Image Layer */}
            <div
                className="absolute inset-0 w-full h-full"
                style={{
                    transform: `translateY(${scrollY * 0.5}px)`, // Parallax: moves slower than scroll
                    opacity: Math.max(0, 1 - scrollY / 700), // Fade out
                }}
            >
                {/* Current Image */}
                <div
                    key={activeItem.id}
                    className={cn(
                        "absolute inset-0 w-full h-full transition-opacity duration-1000 ease-in-out",
                        isTransitioning ? "opacity-0" : "opacity-100"
                    )}
                >
                    {(activeItem.hero_image_url || activeItem.cover_image_url) ? (
                        <div className="absolute inset-0">
                            <Image
                                src={(activeItem.hero_image_url || activeItem.cover_image_url)!}
                                alt={activeItem.title}
                                fill
                                priority={activeIndex === 0}
                                className="object-cover object-[50%_20%]"
                            />
                            {/* Vignette Overlay (Top/Bottom) */}
                            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-background" />
                            {/* Vignette Overlay (Left/Right) - Heavy on left for text */}
                            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent" />
                        </div>
                    ) : (
                        <div className="w-full h-full bg-zinc-900" />
                    )}
                </div>
            </div>

            {/* Content Layer */}
            <div className="absolute inset-0 flex items-center z-30 pointer-events-none">
                <div className="w-full px-6 lg:px-16 pointer-events-auto">
                    <div className="max-w-6xl space-y-4 md:space-y-8">
                        {/* Featured Badge */}
                        <div
                            className={cn(
                                "flex items-center gap-3 transition-opacity duration-700 delay-300",
                                isTransitioning ? "opacity-0" : "opacity-100"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center text-black font-display font-bold text-lg">
                                    L
                                </div>
                                <span className="text-sm font-bold tracking-[0.2em] text-zinc-400 uppercase">
                                    FEATURED
                                </span>
                            </div>
                        </div>

                        {/* Title */}
                        <h1
                            className={cn(
                                "text-3xl md:text-5xl lg:text-7xl font-display font-bold text-white leading-[1.1] tracking-tight drop-shadow-2xl transition-all duration-700 delay-100 origin-left max-w-5xl",
                                isTransitioning ? "opacity-0 scale-95 translate-y-4" : "opacity-100 scale-100 translate-y-0"
                            )}
                        >
                            {activeItem.title}
                        </h1>

                        {/* Content Metadata */}
                        <div
                            className={cn(
                                "flex items-center gap-3 transition-opacity duration-700 delay-200",
                                isTransitioning ? "opacity-0" : "opacity-100"
                            )}
                        >
                            <span className="px-2 py-1 bg-white/20 backdrop-blur-sm rounded text-sm font-semibold text-white uppercase tracking-wide">
                                {activeItem.type}
                            </span>
                            {activeItem.author && (
                                <span className="text-white/80 text-sm md:text-base">
                                    by <span className="font-semibold text-white">{activeItem.author}</span>
                                </span>
                            )}
                            {activeItem.category && (
                                <span className="text-white/60 text-sm">
                                    • {activeItem.category}
                                </span>
                            )}
                        </div>

                        {/* Description */}
                        <p
                            className={cn(
                                "text-base md:text-xl text-white/90 font-medium leading-relaxed drop-shadow-md max-w-xl transition-all duration-700 delay-300 line-clamp-3 md:line-clamp-none",
                                isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                            )}
                        >
                            {description}
                        </p>

                        {/* Action Buttons */}
                        <div
                            className={cn(
                                "flex items-center gap-4 pt-4 transition-all duration-700 delay-500",
                                isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
                            )}
                        >
                            <Link
                                href={`/read/${activeItem.id}`}
                                className="focus-ring flex items-center gap-2 md:gap-3 bg-white text-black px-6 py-2 md:px-8 md:py-3 rounded md:rounded-md text-base md:text-xl font-bold hover:bg-white/90 transition hover:scale-105 active:scale-95"
                            >
                                <BookOpen className="fill-black w-5 h-5 md:w-7 md:h-7" />
                                Read
                            </Link>
                            <Link
                                href={`/preview/${activeItem.id}`}
                                className="focus-ring flex items-center gap-2 md:gap-3 bg-zinc-500/70 text-white px-6 py-2 md:px-8 md:py-3 rounded md:rounded-md text-base md:text-xl font-semibold hover:bg-zinc-500/50 transition hover:scale-105 active:scale-95 backdrop-blur-sm"
                            >
                                <Info className="w-5 h-5 md:w-7 md:h-7" />
                                More Info
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side Carousel Indicators (Optional, purely aesthetic or functional) */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-4 pr-6 z-20">
                {items.map((_, index) => (
                    <button
                        key={index}
                        onClick={() => {
                            setIsTransitioning(true);
                            setTimeout(() => {
                                setActiveIndex(index);
                                setIsTransitioning(false);
                            }, 300);
                        }}
                        className={cn(
                            "w-12 h-1 rounded-sm transition-all duration-300",
                            index === activeIndex
                                ? "bg-white opacity-100"
                                : "bg-zinc-600 opacity-50 hover:bg-zinc-400"
                        )}
                        aria-label={`Go to item ${index + 1}`}
                    />
                ))}
            </div>

            {/* Bottom Gradient for seamless merge with content below */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-10" />
        </div>
    );
}
