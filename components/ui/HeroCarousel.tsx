"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { FocusEvent } from "react";
import Link from "next/link";
import { Info, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildReadPath } from "@/lib/content-paths";
import type { ContentItem } from "@/types/database";
import { APP_NAME } from "@/lib/brand";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const IMAGE_TRANSITION_DURATION_MS = 1600;
const CONTENT_SWAP_DELAY_MS = 900;

interface HeroCarouselProps {
    items: ContentItem[];
}

export function HeroCarousel({ items }: HeroCarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [contentIndex, setContentIndex] = useState(0);
    const [previousIndex, setPreviousIndex] = useState<number | null>(null);
    const [incomingVisible, setIncomingVisible] = useState(true);
    const [outgoingVisible, setOutgoingVisible] = useState(false);
    const [contentVisible, setContentVisible] = useState(true);
    const [isFocusPaused, setIsFocusPaused] = useState(false);
    const autoRotateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const contentRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const incomingFrameRef = useRef<number | null>(null);
    const contentRevealFrameRef = useRef<number | null>(null);
    const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const isPaused = isFocusPaused || prefersReducedMotion;

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

    const clearContentReveal = useCallback(() => {
        if (!contentRevealTimeoutRef.current) return;
        clearTimeout(contentRevealTimeoutRef.current);
        contentRevealTimeoutRef.current = null;
    }, []);

    const clearContentRevealFrame = useCallback(() => {
        if (contentRevealFrameRef.current === null) return;
        cancelAnimationFrame(contentRevealFrameRef.current);
        contentRevealFrameRef.current = null;
    }, []);

    const clearIncomingFrame = useCallback(() => {
        if (incomingFrameRef.current === null) return;
        cancelAnimationFrame(incomingFrameRef.current);
        incomingFrameRef.current = null;
    }, []);

    const queueTransition = useCallback((getNextIndex: (prev: number) => number) => {
        clearAutoRotate();
        clearTransition();
        clearContentReveal();
        clearContentRevealFrame();
        clearIncomingFrame();

        setActiveIndex((currentIndex) => {
            const nextIndex = getNextIndex(currentIndex);

            if (nextIndex === currentIndex || prefersReducedMotion) {
                setPreviousIndex(null);
                setContentIndex(nextIndex);
                setIncomingVisible(true);
                setOutgoingVisible(false);
                setContentVisible(true);
                return nextIndex;
            }

            setPreviousIndex(currentIndex);
            setIncomingVisible(false);
            setOutgoingVisible(true);
            setContentVisible(false);

            incomingFrameRef.current = requestAnimationFrame(() => {
                incomingFrameRef.current = null;
                setIncomingVisible(true);
                setOutgoingVisible(false);
            });

            contentRevealTimeoutRef.current = setTimeout(() => {
                setContentIndex(nextIndex);
                contentRevealFrameRef.current = requestAnimationFrame(() => {
                    contentRevealFrameRef.current = null;
                    setContentVisible(true);
                });
                contentRevealTimeoutRef.current = null;
            }, CONTENT_SWAP_DELAY_MS);

            transitionTimeoutRef.current = setTimeout(() => {
                setPreviousIndex(null);
                setIncomingVisible(true);
                setOutgoingVisible(false);
                transitionTimeoutRef.current = null;
            }, IMAGE_TRANSITION_DURATION_MS);

            return nextIndex;
        });
    }, [clearAutoRotate, clearContentReveal, clearContentRevealFrame, clearIncomingFrame, clearTransition, prefersReducedMotion]);

    const handleFocus = useCallback(() => {
        setIsFocusPaused(true);
        clearAutoRotate();
    }, [clearAutoRotate]);

    const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
        const nextFocusedElement = event.relatedTarget instanceof Node ? event.relatedTarget : null;
        if (event.currentTarget.contains(nextFocusedElement)) return;
        setIsFocusPaused(false);
    }, []);

    const renderImageLayer = useCallback((item: ContentItem, state: "active" | "previous") => {
        const isPrevious = state === "previous";

        return (
            <div
                key={item.id}
                className={cn(
                    "absolute inset-0 w-full h-full transition-opacity duration-[1600ms] ease-in-out",
                    isPrevious
                        ? outgoingVisible
                            ? "opacity-100"
                            : "opacity-0"
                        : incomingVisible
                            ? "opacity-100"
                            : "opacity-0"
                )}
            >
                {(item.hero_image_url || item.cover_image_url) ? (
                    <>
                        {/* The Image Container - Anchored Right */}
                        <div className="absolute top-0 right-0 bottom-0 w-full md:w-[85%] lg:w-[75%] xl:w-[65%]">
                            <ResilientImage
                                src={(item.hero_image_url || item.cover_image_url)!}
                                alt={item.title}
                                fill
                                priority={activeIndex === 0 && !isPrevious}
                                surface="hero-carousel"
                                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 85vw, 65vw"
                                className="object-cover object-[50%_20%]"
                                fallback={<div className="h-full w-full bg-card" />}
                            />
                            {!isPrevious && (
                                <Link
                                    href={`/preview/${item.id}`}
                                    aria-label={`Preview ${item.title}`}
                                    tabIndex={-1}
                                    className="absolute inset-x-0 top-0 bottom-12 z-10 cursor-pointer md:inset-0"
                                />
                            )}
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
        );
    }, [activeIndex, incomingVisible, outgoingVisible]);

    useEffect(() => {
        if (activeIndex < items.length) return;

        setActiveIndex(0);
        setContentIndex(0);
        setPreviousIndex(null);
        setIncomingVisible(true);
        setOutgoingVisible(false);
        setContentVisible(true);
    }, [activeIndex, items.length]);

    useEffect(() => {
        if (contentIndex < items.length) return;
        setContentIndex(0);
    }, [contentIndex, items.length]);

    useEffect(() => {
        if (items.length <= 1 || isPaused) return;

        clearAutoRotate();
        autoRotateTimeoutRef.current = setTimeout(() => {
            queueTransition((prev) => (prev + 1) % items.length);
        }, 5000);

        return clearAutoRotate;
    }, [activeIndex, items.length, isPaused, clearAutoRotate, queueTransition]);

    useEffect(() => {
        return () => {
            clearAutoRotate();
            clearTransition();
            clearContentReveal();
            clearContentRevealFrame();
            clearIncomingFrame();
        };
    }, [clearAutoRotate, clearContentReveal, clearContentRevealFrame, clearIncomingFrame, clearTransition]);

    if (items.length === 0) {
        return (
            <div className="relative browse-hero-shell flex w-full items-center justify-center overflow-hidden bg-card">
                <div className="absolute inset-0 bg-black/50" />
                <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
                    <h1 className="mb-6 text-4xl font-black text-white md:text-7xl">
                        {APP_NAME}
                    </h1>
                    <p className="mx-auto max-w-2xl rounded-xl bg-black/40 p-4 text-lg text-muted-foreground backdrop-blur-sm md:text-xl">
                        A curated stream of insights from books, podcasts, articles, and videos. Check back soon for featured content.
                    </p>
                </div>
                {/* Bottom Gradient to blend with content lanes */}
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-10" />
            </div>
        );
    }

    const safeActiveIndex = Math.min(activeIndex, items.length - 1);
    const safeContentIndex = Math.min(contentIndex, items.length - 1);
    const activeItem = items[safeActiveIndex];
    const contentItem = items[safeContentIndex];
    const previousItem = previousIndex === null ? null : items[previousIndex] ?? null;

    // Safely extract description from quick_mode_json
    const quickMode = contentItem.quick_mode_json as { hook?: string; big_idea?: string } | null;
    const description = quickMode?.hook || quickMode?.big_idea || `Experience this ${APP_NAME} content today.`;

    return (
        <div
            className="relative browse-hero-shell w-full overflow-hidden bg-background"
            onFocusCapture={handleFocus}
            onBlurCapture={handleBlur}
        >
            {/* Background Image Layer */}
            <div className="absolute inset-0 w-full h-full">
                {previousItem && renderImageLayer(previousItem, "previous")}
                {renderImageLayer(activeItem, "active")}
            </div>

            {/* Content Layer */}
            <div className="pointer-events-none absolute inset-0 z-30 flex items-end md:items-center browse-hero-content-frame">
                <div
                    className="pointer-events-none browse-hero-content w-full px-4 pb-12 md:px-6 md:pb-0 lg:px-16"
                    data-testid="hero-carousel-content"
                >
                    <div className="max-w-6xl space-y-3 md:space-y-6 lg:space-y-7">
                        {/* Featured Badge */}
                        <div
                            className={cn(
                                "flex items-center gap-2.5 transition-opacity duration-[1100ms] delay-150 md:gap-3",
                                contentVisible ? "opacity-100" : "opacity-0"
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
                                "browse-hero-title max-w-5xl origin-left font-display font-bold bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/60 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] transition-all duration-[1100ms]",
                                contentVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
                            )}
                        >
                            {contentItem.title}
                        </h1>

                        {/* Content Metadata */}
                        <div
                            className={cn(
                                "flex flex-wrap items-center gap-2 transition-opacity duration-[1100ms] delay-100 md:gap-3",
                                contentVisible ? "opacity-100" : "opacity-0"
                            )}
                        >
                            <span className="flex-shrink-0 rounded bg-white/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-sm md:px-2 md:py-1 md:text-sm md:tracking-wide">
                                {contentItem.type}
                            </span>

                            {/* Group Author and Category for better wrapping */}
                            <span className="text-xs leading-snug text-white/80 md:text-base">
                                {contentItem.author && (
                                    <>
                                        by <span className="font-semibold text-white">{contentItem.author}</span>
                                    </>
                                )}
                                {contentItem.category && (
                                    <span className="ml-2 text-white/60">
                                        • {contentItem.category}
                                    </span>
                                )}
                            </span>
                        </div>

                        {/* Description */}
                        <p
                            className={cn(
                                "max-w-lg text-sm font-medium leading-relaxed text-white/90 drop-shadow-md transition-all duration-[1100ms] delay-200 md:max-w-xl md:text-lg lg:text-xl",
                                contentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                            )}
                        >
                            {description}
                        </p>

                        {/* Action Buttons */}
                        <div
                            className={cn(
                                "flex flex-wrap items-center gap-3 pt-1 transition-all duration-[1100ms] delay-300 md:gap-4 md:pt-3 lg:pt-4",
                                contentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                            )}
                        >
                            <Link
                                href={buildReadPath(contentItem)}
                                className="focus-ring pointer-events-auto flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-all hover:scale-105 hover:bg-white/95 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] active:scale-95 md:gap-3 md:px-7 md:py-2.5 md:text-base lg:px-8 lg:py-3 lg:text-lg"
                            >
                                <BookOpen className="h-4 w-4 fill-black md:h-6 md:w-6 lg:h-7 lg:w-7" />
                                Read
                            </Link>
                            <Link
                                href={`/preview/${contentItem.id}`}
                                className="focus-ring pointer-events-auto flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_20px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all hover:scale-105 hover:border-white/40 hover:bg-black/40 active:scale-95 md:gap-3 md:px-7 md:py-2.5 md:text-base lg:px-8 lg:py-3 lg:text-lg"
                            >
                                <Info className="h-4 w-4 md:h-6 md:w-6 lg:h-7 lg:w-7" />
                                Preview
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side Carousel Indicators (Optional, purely aesthetic or functional) */}
            <div className="absolute right-0 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-1 pr-6 lg:flex">
                {items.map((_, index) => (
                    <button
                        key={index}
                        type="button"
                        onClick={() => {
                            if (index === activeIndex) return;
                            queueTransition(() => index);
                        }}
                        className={cn(
                            "group flex h-8 w-20 cursor-pointer items-center justify-end rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-background"
                        )}
                        aria-label={`Go to item ${index + 1}`}
                        aria-current={index === activeIndex ? "true" : undefined}
                    >
                        <span
                            className={cn(
                                "h-1.5 rounded-full transition-all duration-500 ease-in-out",
                                index === activeIndex
                                    ? "w-16 bg-white opacity-100 shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                                    : "w-8 bg-white/40 opacity-50 group-hover:w-10 group-hover:bg-white/70 group-hover:opacity-100"
                            )}
                        />
                    </button>
                ))}
            </div>

            {/* Bottom Gradient for seamless merge with content below */}
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-10" />
        </div>
    );
}
