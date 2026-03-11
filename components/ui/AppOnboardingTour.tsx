"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    LayoutGrid,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OnboardingStatus } from "@/lib/onboarding";

interface AppOnboardingTourProps {
    isOpen: boolean;
    isSaving: boolean;
    onFinish: (status: OnboardingStatus) => void | Promise<void>;
}

interface TourSlide {
    body: string;
    desktopImageSrc?: string;
    eyebrow: string;
    imageAlt?: string;
    imageSrc?: string;
    title: string;
}

const TOUR_SLIDES: TourSlide[] = [
    {
        eyebrow: "Browse",
        title: "Find your next read.",
        body: "Scan the home feed, open something promising, and start with ideas that already feel worth your time.",
        imageSrc: "/images/hero-section.png",
        imageAlt: "Flux browse home feed",
    },
    {
        eyebrow: "Preview",
        title: "Preview the thesis first.",
        body: "See the main idea before you commit so you know what the piece is really trying to teach.",
        imageSrc: "/images/reading-experience-info-view.png",
        imageAlt: "Preview screen showing the main idea and thesis",
    },
    {
        eyebrow: "Read",
        title: "Read in clean sections.",
        body: "Move through a focused reader built to make long ideas easier to follow and easier to retain.",
        imageSrc: "/images/reading-experience-reader-view.png",
        imageAlt: "Reader view with structured sections",
    },
    {
        eyebrow: "Highlight",
        title: "Save what matters.",
        body: "Highlight the lines and add notes to keep the most useful parts easy to revisit later.",
        imageSrc: "/images/highlighting-and-annotation.png",
        imageAlt: "Highlighted passages and notes inside the reader",
    },
    {
        eyebrow: "Notes",
        title: "Use notes as memory.",
        body: "Revisit your highlights and commentary when you want the strongest ideas back in one place.",
        imageSrc: "/images/notes.png",
        imageAlt: "View with saved highlights and notes",
    },
    {
        eyebrow: "Ask",
        title: "Ask anything.",
        body: "Discuss in-depth, compare ideas, and get answers after each read or in your notes.",
        imageSrc: "/images/ai-chat.png",
        imageAlt: "Ask My Library chat interface",
    },
];

function getFocusableElements(container: HTMLElement | null) {
    if (!container) return [];

    return Array.from(
        container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
    ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
}

export function AppOnboardingTour({ isOpen, isSaving, onFinish }: AppOnboardingTourProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [mounted, setMounted] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const touchStartXRef = useRef<number | null>(null);

    const isLastSlide = activeIndex === TOUR_SLIDES.length - 1;
    const progressLabel = useMemo(
        () => `Slide ${activeIndex + 1} of ${TOUR_SLIDES.length}`,
        [activeIndex]
    );

    const goToNextSlide = () => {
        setActiveIndex((current) => Math.min(current + 1, TOUR_SLIDES.length - 1));
    };

    const goToPreviousSlide = () => {
        setActiveIndex((current) => Math.max(current - 1, 0));
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        setActiveIndex(0);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const container = containerRef.current;
        const focusable = getFocusableElements(container);
        focusable[0]?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                void onFinish("dismissed");
                return;
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                goToNextSlide();
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                goToPreviousSlide();
                return;
            }

            if (event.key !== "Tab") return;

            const elements = getFocusableElements(containerRef.current);
            if (elements.length === 0) return;

            const first = elements[0];
            const last = elements[elements.length - 1];
            const activeElement = document.activeElement as HTMLElement | null;

            if (event.shiftKey && activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onFinish]);

    if (!isOpen || !mounted) {
        return null;
    }

    return createPortal(
        <div className="fixed inset-0 z-[120] overflow-x-hidden bg-[rgba(10,14,21,0.88)] backdrop-blur-xl">
            <div
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="app-onboarding-title"
                className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden"
                data-testid="app-onboarding-tour"
            >
                <div className="flex flex-none items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-6">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
                        <LayoutGrid className="size-3.5" />
                        {progressLabel}
                    </div>

                    <Button
                        type="button"
                        variant="ghost"
                        className="rounded-full text-white/80 hover:bg-white/10 hover:text-white"
                        onClick={() => void onFinish("dismissed")}
                        disabled={isSaving}
                        aria-label="Skip tour"
                    >
                        Skip
                        <X className="ml-2 size-4" />
                    </Button>
                </div>

                <div
                    className="min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-8 sm:pb-6"
                    data-testid="app-onboarding-body"
                >
                    <div
                        className="flex h-full min-w-0 w-full touch-pan-y transition-transform duration-300 ease-out"
                        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
                        data-testid="app-onboarding-track"
                        onTouchStart={(event) => {
                            touchStartXRef.current = event.changedTouches[0]?.clientX ?? null;
                        }}
                        onTouchEnd={(event) => {
                            const start = touchStartXRef.current;
                            const end = event.changedTouches[0]?.clientX ?? null;
                            touchStartXRef.current = null;

                            if (start === null || end === null) return;

                            const delta = end - start;
                            if (Math.abs(delta) < 48) return;

                            if (delta < 0) {
                                goToNextSlide();
                            } else {
                                goToPreviousSlide();
                            }
                        }}
                    >
                        {TOUR_SLIDES.map((slide, index) => {
                            return (
                                <section
                                    key={slide.title}
                                    className="min-w-full"
                                    aria-hidden={index !== activeIndex}
                                    data-testid={`app-onboarding-slide-${index + 1}`}
                                >
                                    <div className="h-full overflow-hidden pr-1 sm:pr-0">
                                        <div className="mx-auto flex h-full w-full max-w-6xl flex-col justify-center py-1 lg:py-3">
                                            <div className="grid w-full gap-4 rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:gap-5 sm:rounded-[2rem] sm:p-6 lg:grid-cols-[0.96fr_1.04fr] lg:items-center lg:gap-7 lg:p-7">
                                                <div className="flex min-w-0 flex-col justify-center gap-4 lg:gap-6">
                                                    <div>
                                                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white/55">
                                                            {slide.eyebrow}
                                                        </p>
                                                        <h2
                                                            id={index === activeIndex ? "app-onboarding-title" : undefined}
                                                            className="mt-3 max-w-[18rem] font-serif text-[2.35rem] font-bold leading-[0.92] tracking-[-0.045em] text-white sm:max-w-[20rem] sm:text-[2.65rem] lg:mt-3 lg:max-w-[26rem] lg:text-[2.7rem]"
                                                        >
                                                            {slide.title}
                                                        </h2>
                                                        <p className="mt-3 max-w-[33rem] text-[0.98rem] leading-7 text-white/72 sm:text-[1.02rem] sm:leading-7 lg:mt-3 lg:max-w-[29rem] lg:text-[1rem] lg:leading-7">
                                                            {slide.body}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="relative min-w-0 overflow-hidden rounded-[1.4rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),rgba(255,255,255,0.02))] p-3 sm:rounded-[1.6rem] sm:p-4 lg:self-center lg:rounded-[1.5rem] lg:p-3">
                                                    {slide.imageSrc ? (
                                                        <>
                                                            <div className="relative aspect-[16/9] overflow-hidden rounded-[1.15rem] border border-white/10 bg-black/30 lg:hidden">
                                                                <Image
                                                                    src={slide.imageSrc}
                                                                    alt={slide.imageAlt || slide.title}
                                                                    fill
                                                                    sizes="100vw"
                                                                    className={cn(
                                                                        "object-cover object-top",
                                                                        slide.imageSrc.includes("ai-chat") && "object-contain bg-[#0b1220] p-3"
                                                                    )}
                                                                    priority={index === 0}
                                                                />
                                                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
                                                            </div>

                                                            <div
                                                                className="relative hidden h-[300px] overflow-hidden rounded-[1.16rem] border border-white/10 bg-black/30 lg:block"
                                                                data-testid="app-onboarding-desktop-image-frame"
                                                            >
                                                                <Image
                                                                    src={slide.desktopImageSrc || slide.imageSrc}
                                                                    alt={slide.imageAlt || slide.title}
                                                                    fill
                                                                    sizes="50vw"
                                                                    className={cn(
                                                                        "object-cover object-top",
                                                                        (slide.desktopImageSrc || slide.imageSrc).includes("ai-chat") && "object-contain bg-[#0b1220] p-4"
                                                                    )}
                                                                    priority={index === 0}
                                                                />
                                                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
                                                            </div>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                </div>

                <div
                    className="flex-none border-t border-white/10 bg-black/25 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-8 sm:py-4 sm:pb-4"
                    data-testid="app-onboarding-footer"
                >
                    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2" role="tablist" aria-label="Tour slides">
                            {TOUR_SLIDES.map((slide, index) => (
                                <button
                                    key={slide.title}
                                    type="button"
                                    role="tab"
                                    aria-selected={index === activeIndex}
                                    aria-label={`Go to slide ${index + 1}`}
                                    className={cn(
                                        "h-2.5 rounded-full transition-all",
                                        index === activeIndex ? "w-8 bg-white" : "w-2.5 bg-white/30 hover:bg-white/55"
                                    )}
                                    onClick={() => setActiveIndex(index)}
                                />
                            ))}
                        </div>

                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <Button
                                type="button"
                                variant="outline"
                                className="border-white/15 bg-transparent text-white hover:bg-white/8 hover:text-white"
                                onClick={goToPreviousSlide}
                                disabled={activeIndex === 0 || isSaving}
                            >
                                Back
                            </Button>

                            <Button
                                type="button"
                                className="min-w-32 rounded-full bg-white text-black hover:bg-white/90"
                                onClick={() => {
                                    if (isLastSlide) {
                                        void onFinish("completed");
                                        return;
                                    }

                                    goToNextSlide();
                                }}
                                disabled={isSaving}
                            >
                                {isSaving ? "Saving..." : isLastSlide ? "Start exploring" : "Next"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
