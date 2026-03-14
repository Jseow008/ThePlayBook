"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Info, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/types/database";
import { APP_NAME } from "@/lib/brand";
import { ResilientImage } from "@/components/ui/ResilientImage";

interface HeroCarouselProps {
    items: ContentItem[];
}

export function HeroCarousel({ items }: HeroCarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [scrollY, setScrollY] = useState(0);
    const autoRotateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scrollFrameRef = useRef<number | null>(null);

    const clearAutoRotate = useCallback(() => {
        if (!autoRotateTimeoutRef.current) return;
        clearTimeout(autoRotateTimeoutRef.current);
        autoRotateTimeoutRef.current = null;
    }, []);

    const clearTransition = useCallback(() => {
        if (!transitionTimeoutRef.current) return;
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
    }, []);

    const queueTransition = useCallback((getNextIndex: (prev: number) => number, durationMs: number) => {
        clearAutoRotate();
        clearTransition();
        setIsTransitioning(true);

        transitionTimeoutRef.current = setTimeout(() => {
            setActiveIndex((prev) => getNextIndex(prev));
            setIsTransitioning(false);
            transitionTimeoutRef.current = null;
        }, durationMs);
    }, [clearAutoRotate, clearTransition]);

    // Parallax Scroll Effect
    useEffect(() => {
        const handleScroll = () => {
            if (scrollFrameRef.current !== null) return;

            scrollFrameRef.current = window.requestAnimationFrame(() => {
                setScrollY(window.scrollY);
                scrollFrameRef.current = null;
            });
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (scrollFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollFrameRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (items.length <= 1) return;

        clearAutoRotate();
        autoRotateTimeoutRef.current = setTimeout(() => {
            queueTransition((prev) => (prev + 1) % items.length, 800);
        }, 5000);

        return clearAutoRotate;
    }, [activeIndex, items.length, clearAutoRotate, queueTransition]);

    useEffect(() => {
        return () => {
            clearAutoRotate();
            clearTransition();
        };
    }, [clearAutoRotate, clearTransition]);

    if (items.length === 0) {
        return (
            <div className="relative flex min-h-[420px] h-[56svh] w-full items-center justify-center overflow-hidden bg-card md:h-[80vh] md:min-h-[500px] lg:h-[85vh]">
                <div className="absolute inset-0 bg-black/50" />
                <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
                    <h1 className="mb-6 text-4xl font-black text-white md:text-7xl">
                        {APP_NAME}
                    </h1>
                    <p className="mx-auto max-w-2xl rounded-xl bg-black/40 p-4 text-lg text-muted-foreground backdrop-blur-sm md:text-xl">
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
        <div className="relative min-h-[420px] h-[56svh] w-full overflow-hidden bg-background md:h-[80vh] md:min-h-[500px] lg:h-[85vh]">
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
                        <>
                            {/* The Image Container - Anchored Right */}
                            <div className="absolute top-0 right-0 bottom-0 w-full md:w-[85%] lg:w-[75%] xl:w-[65%]">
                                <ResilientImage
                                    src={(activeItem.hero_image_url || activeItem.cover_image_url)!}
                                    alt={activeItem.title}
                                    fill
                                    priority={activeIndex === 0}
                                    surface="hero-carousel"
                                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 85vw, 65vw"
                                    className="object-cover object-[50%_20%]"
                                    fallback={<div className="h-full w-full bg-card" />}
                                />
                            </div>

                            {/* Full-screen Gradient Overlay to Blend Image into Background */}
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/42 to-transparent via-[48%] to-[82%] md:bg-gradient-to-r md:from-background md:via-background md:to-transparent md:via-[15%] md:to-[60%] lg:via-[25%] lg:to-[70%] xl:via-[35%] xl:to-[80%]" />

                            {/* Top Vignette for Navbar Contrast */}
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-[26%] bg-gradient-to-b from-black/45 to-transparent md:h-[40%] md:from-black/60" />

                            {/* Supplementary horizontal text darkening for highly-lit images */}
                            <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent md:w-[60%] pointer-events-none" />
                            {/* Right-side vignette to soften the screen edge */}
                            <div className="pointer-events-none absolute inset-y-0 right-0 w-[10%] bg-gradient-to-l from-black/25 to-transparent md:w-[15%] md:from-black/40" />
                        </>
                    ) : (
                        <div className="w-full h-full bg-card" />
                    )}
                </div>
            </div>

            {/* Content Layer */}
            <div className="pointer-events-none absolute inset-0 z-30 flex items-end md:items-center">
                <div
                    className="pointer-events-auto w-full px-4 pb-10 md:px-6 md:pb-0 lg:px-16"
                    data-testid="hero-carousel-content"
                >
                    <div className="max-w-6xl space-y-3 md:space-y-8">
                        {/* Featured Badge */}
                        <div
                            className={cn(
                                "flex items-center gap-2.5 transition-opacity duration-700 delay-300 md:gap-3",
                                isTransitioning ? "opacity-0" : "opacity-100"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-base font-bold text-black font-brand md:h-8 md:w-8 md:text-lg">
                                    {APP_NAME.charAt(0)}
                                </div>
                                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground md:text-sm md:tracking-[0.2em]">
                                    FEATURED
                                </span>
                            </div>
                        </div>

                        {/* Title */}
                        <h1
                            className={cn(
                                "max-w-5xl origin-left font-display text-[2rem] font-bold leading-[1.02] tracking-[-0.025em] text-white drop-shadow-2xl transition-all duration-700 delay-100 md:text-5xl md:leading-[1.1] md:tracking-[-0.02em] lg:text-7xl",
                                isTransitioning ? "opacity-0 scale-95 translate-y-4" : "opacity-100 scale-100 translate-y-0"
                            )}
                        >
                            {activeItem.title}
                        </h1>

                        {/* Content Metadata */}
                        <div
                            className={cn(
                                "flex flex-wrap items-center gap-2 transition-opacity duration-700 delay-200 md:gap-3",
                                isTransitioning ? "opacity-0" : "opacity-100"
                            )}
                        >
                            <span className="flex-shrink-0 rounded bg-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm md:px-2 md:py-1 md:text-sm md:tracking-wide">
                                {activeItem.type}
                            </span>

                            {/* Group Author and Category for better wrapping */}
                            <span className="text-xs leading-snug text-white/80 md:text-base">
                                {activeItem.author && (
                                    <>
                                        by <span className="font-semibold text-white">{activeItem.author}</span>
                                    </>
                                )}
                                {activeItem.category && (
                                    <span className="ml-2 text-white/60">
                                        • {activeItem.category}
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* Description */}
                        <p
                            className={cn(
                                "max-w-lg text-sm font-medium leading-relaxed text-white/90 drop-shadow-md transition-all duration-700 delay-300 md:max-w-xl md:text-xl",
                                isTransitioning ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                            )}
                        >
                            {description}
                        </p>

                        {/* Action Buttons */}
                        <div
                            className={cn(
                                "flex items-center gap-3 pt-1 transition-all duration-700 delay-500 md:gap-4 md:pt-4",
                                isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
                            )}
                        >
                            <Link
                                href={`/read/${activeItem.id}`}
                                className="focus-ring flex items-center gap-2 rounded-md bg-white px-5 py-2 text-sm font-bold text-black transition hover:scale-105 hover:bg-white/90 active:scale-95 md:gap-3 md:px-8 md:py-3 md:text-xl"
                            >
                                <BookOpen className="h-4 w-4 fill-black md:h-7 md:w-7" />
                                Read
                            </Link>
                            <Link
                                href={`/preview/${activeItem.id}`}
                                className="focus-ring flex items-center gap-2 rounded-md bg-secondary px-5 py-2 text-sm font-semibold text-secondary-foreground backdrop-blur-sm transition hover:scale-105 hover:bg-secondary/80 active:scale-95 md:gap-3 md:px-8 md:py-3 md:text-xl"
                            >
                                <Info className="h-4 w-4 md:h-7 md:w-7" />
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
                        type="button"
                        onClick={() => {
                            if (index === activeIndex) return;
                            queueTransition(() => index, 300);
                        }}
                        className={cn(
                            "w-12 h-1 rounded-sm transition-all duration-300",
                            index === activeIndex
                                ? "bg-white opacity-100"
                                : "bg-muted-foreground/50 opacity-50 hover:bg-muted-foreground"
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
