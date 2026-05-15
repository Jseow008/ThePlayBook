"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Brain,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Dumbbell,
  GraduationCap,
  Globe,
  Heart,
  Laptop,
  Lightbulb,
  Landmark,
  Leaf,
  Maximize2,
  Megaphone,
  Microscope,
  Smile,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { EmailSubscriptionForm } from "@/components/ui/EmailSubscriptionForm";
import { APP_NAME } from "@/lib/brand";
export { getCuratedCategories } from "@/components/ui/landing/landingCategories";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/types/database";

const CATEGORY_ICONS = {
  "Career & Success": Briefcase,
  "Communication Skills": Megaphone,
  "Corporate Culture": Users,
  Economics: TrendingUp,
  Education: GraduationCap,
  Entrepreneurship: Lightbulb,
  Fitness: Dumbbell,
  "Health & Nutrition": Activity,
  History: Landmark,
  Lifestyle: Smile,
  "Management & Leadership": Users,
  "Marketing & Sales": Megaphone,
  "Money & Investments": CircleDollarSign,
  "Motivation & Inspiration": Sparkles,
  "Nature & the Environment": Leaf,
  Parenting: Heart,
  "Personal Development": Brain,
  Philosophy: Lightbulb,
  Politics: Landmark,
  Productivity: Briefcase,
  Psychology: Brain,
  Relationships: Heart,
  "Religion & Spirituality": Sparkles,
  Science: Microscope,
  "Society & Culture": Globe,
  "Technology & the Future": Laptop,
  Business: Briefcase,
} as const;

const STORYBOARD_SLIDES = [
  {
    label: "Distill",
    title: "Distill before committing time",
    image: "/images/netflux-storyboard-distill.webp",
  },
  {
    label: "Library",
    title: "Build your personal library",
    image: "/images/netflux-storyboard-library.webp",
  },
  {
    label: "Ask",
    title: "Think with your notes",
    image: "/images/netflux-storyboard-ai.webp",
  },
] as const;

const FEATURED_READS_DRAG_THRESHOLD_PX = 6;
const FEATURED_READS_MIN_LOOP_ITEMS = 8;
const FEATURED_READS_AUTOPLAY_SPEED_PX_PER_SECOND = 40;
const FEATURED_READS_AUTOPLAY_MAX_FRAME_DELTA_MS = 100;
const FEATURED_READS_AUTOPLAY_RESUME_DELAY_MS = 2000;
const FEATURED_READS_ROW_COUNT = 2;

type FeaturedReadsMarqueeDirection = "left" | "right";

function getNormalizedScrollLeft(scrollLeft: number, loopWidth: number) {
  const middleStart = loopWidth;
  const offsetWithinLoop = ((scrollLeft - middleStart) % loopWidth + loopWidth) % loopWidth;
  return middleStart + offsetWithinLoop;
}

function formatFeaturedReadDuration(durationSeconds: number | null) {
  if (!durationSeconds) {
    return null;
  }

  const minutes = Math.max(1, Math.round(durationSeconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function FadeIn({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const revealRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = revealRef.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsVisible(true);
        observer.unobserve(entry.target);
      },
      {
        rootMargin: "0px 0px -10% 0px",
        threshold: 0.16,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={revealRef}
      className={cn("landing-reveal", isVisible && "is-visible", className)}
      style={{ "--reveal-delay": `${delayMs}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

function SectionIntro({
  label,
  title,
  body,
  centered = false,
}: {
  label: string;
  title: string;
  body?: string;
  centered?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", centered && "mx-auto text-center")}>
      <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-400">
        {label}
      </p>
      <h2 className="font-serif text-4xl font-bold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl md:text-[3.65rem]">
        {title}
      </h2>
      {body ? (
        <p className="mt-6 text-base leading-8 text-zinc-300 sm:text-[1.15rem]">{body}</p>
      ) : null}
    </div>
  );
}

function getFeaturedReadRows(items: ContentItem[]) {
  if (items.length < FEATURED_READS_ROW_COUNT * 2) {
    return Array.from({ length: FEATURED_READS_ROW_COUNT }, () => items);
  }

  const rows = Array.from({ length: FEATURED_READS_ROW_COUNT }, (_, rowIndex) =>
    items.filter((_, itemIndex) => itemIndex % FEATURED_READS_ROW_COUNT === rowIndex)
  );

  return rows.map((rowItems) => (rowItems.length > 0 ? rowItems : items));
}

function FeaturedReadCard({ item }: { item: ContentItem }) {
  const durationLabel = formatFeaturedReadDuration(item.duration_seconds);

  return (
    <Link
      href={`/preview/${item.id}`}
      aria-label={`Preview ${item.title}`}
      className="focus-ring group relative block aspect-[2/3] w-full overflow-hidden rounded-md bg-card transition-transform duration-300 hover:z-10 hover:scale-105"
    >
      {item.cover_image_url ? (
        <Image
          src={item.cover_image_url}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 160px, (max-width: 768px) 200px, 240px"
          className="object-cover transition-transform duration-300 group-hover:scale-110"
        />
      ) : (
        <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-card to-background">
          <Sparkles className="size-12 text-muted-foreground" />
        </div>
      )}

      {item.author ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center bg-gradient-to-b from-black/80 via-black/35 to-transparent px-5 pb-5 pt-5 md:px-8 md:pb-8 md:pt-10">
          <p className="break-words text-center text-[9px] font-medium uppercase leading-relaxed tracking-[0.12em] text-white/90 drop-shadow-md md:text-[11px] md:tracking-[0.15em]">
            {item.author}
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 rounded-md bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/72 to-transparent px-3.5 pb-3.5 pt-14 md:p-4 md:pb-5 md:pt-20">
        <div className="flex h-full flex-col justify-end gap-1">
          <h3 className="line-clamp-3 font-serif text-[0.95rem] font-medium leading-[1.18] text-white/95 transition-colors group-hover:text-white md:text-base md:leading-snug">
            {item.title}
          </h3>

          <div className="space-y-0.5">
            {item.category ? (
              <p className="line-clamp-1 text-[9px] font-medium uppercase leading-relaxed tracking-[0.1em] text-white/70 drop-shadow-md md:text-[10px] md:tracking-widest">
                {item.category}
              </p>
            ) : null}
            <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[9px] font-medium uppercase leading-relaxed tracking-[0.1em] text-white/62 drop-shadow-md md:gap-x-1.5 md:text-[10px] md:tracking-widest">
              <span>{item.type}</span>
              {durationLabel ? (
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="opacity-40">&middot;</span>
                  <span>{durationLabel}</span>
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 z-30 rounded-md border border-white/15 transition-colors" />
      <div className="pointer-events-none absolute inset-0 z-30 rounded-md border-2 border-transparent transition-colors group-hover:border-primary/75" />
    </Link>
  );
}

export function FeaturedReadsSection({ items }: { items: ContentItem[] }) {
  const rows = getFeaturedReadRows(items);

  if (items.length === 0) return null;

  return (
    <section
      id="featured-reads"
      className="landing-featured-band scroll-mt-20 overflow-hidden py-24 sm:py-32"
    >
      <FadeIn className="mx-auto mb-8 flex max-w-7xl flex-col gap-8 px-6 md:mb-10 md:flex-row md:items-end md:justify-between">
        <SectionIntro
          label="Explore the library"
          title="Ideas worth remembering."
          body="Popular ideas from books, podcasts, articles, and videos."
        />
        <Link
          href="/browse"
          className="focus-ring group inline-flex w-fit items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
        >
          Browse all
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </FadeIn>

      <FadeIn delayMs={100}>
        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-5 overflow-hidden pb-8 pt-4 md:gap-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#090807] via-[#090807]/72 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#090807] via-[#090807]/72 to-transparent" />
          {rows.map((rowItems, index) => (
            <FeaturedReadsMarqueeRow
              key={`featured-reads-row-${index}`}
              items={rowItems}
              direction={index % 2 === 0 ? "left" : "right"}
              rowIndex={index}
            />
          ))}
        </div>
      </FadeIn>
    </section>
  );
}

function FeaturedReadsMarqueeRow({
  items,
  direction,
  rowIndex,
}: {
  items: ContentItem[];
  direction: FeaturedReadsMarqueeDirection;
  rowIndex: number;
}) {
  const baseMultiplier = Math.max(
    1,
    Math.ceil(FEATURED_READS_MIN_LOOP_ITEMS / Math.max(1, items.length))
  );
  const loopItems = Array.from({ length: baseMultiplier }).flatMap(() => items);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstLoopRef = useRef<HTMLDivElement>(null);
  const middleLoopRef = useRef<HTMLDivElement>(null);
  const lastLoopRef = useRef<HTMLDivElement>(null);
  const loopWidthRef = useRef(0);
  const hasInitializedLoopRef = useRef(false);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const autoplayFrameRef = useRef<number | null>(null);
  const autoplayResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoplayPausedRef = useRef(false);
  const isAutoplayInViewRef = useRef(false);
  const isReducedMotionRef = useRef(false);
  const lastAutoplayFrameTimeRef = useRef<number | null>(null);
  const autoplayOffsetRemainderRef = useRef(0);
  const runAutoplayFrameRef = useRef<FrameRequestCallback>(() => {});
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const firstLoopElement = firstLoopRef.current;
    const middleLoopElement = middleLoopRef.current;
    const lastLoopElement = lastLoopRef.current;

    if (!scrollElement || !firstLoopElement || !middleLoopElement || !lastLoopElement) return;

    const measure = () => {
      const loopWidth = middleLoopElement.offsetLeft - firstLoopElement.offsetLeft;
      if (loopWidth <= 0) return;

      loopWidthRef.current = loopWidth;
      const normalizedScrollLeft = getNormalizedScrollLeft(scrollElement.scrollLeft, loopWidth);

      if (!hasInitializedLoopRef.current || scrollElement.scrollLeft !== normalizedScrollLeft) {
        scrollElement.scrollLeft = hasInitializedLoopRef.current
          ? normalizedScrollLeft
          : loopWidth + (rowIndex % 2 === 0 ? 0 : Math.min(loopWidth * 0.18, 240));
        hasInitializedLoopRef.current = true;
      }
    };

    measure();

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(measure)
      : null;

    resizeObserver?.observe(scrollElement);
    resizeObserver?.observe(firstLoopElement);
    resizeObserver?.observe(middleLoopElement);
    resizeObserver?.observe(lastLoopElement);
    window.addEventListener("resize", measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [items.length, rowIndex]);

  const normalizeScrollPosition = useCallback((element: HTMLDivElement) => {
    const loopWidth = loopWidthRef.current;
    if (
      loopWidth <= 0
      || !hasInitializedLoopRef.current
      || element.scrollWidth <= element.clientWidth + 1
    ) {
      return;
    }

    const normalizedScrollLeft = getNormalizedScrollLeft(element.scrollLeft, loopWidth);
    if (normalizedScrollLeft !== element.scrollLeft) {
      element.scrollLeft = normalizedScrollLeft;
    }
  }, []);

  const shiftScrollPosition = useCallback((element: HTMLDivElement, offsetPx: number) => {
    const loopWidth = loopWidthRef.current;
    if (
      loopWidth <= 0
      || !hasInitializedLoopRef.current
      || element.scrollWidth <= element.clientWidth + 1
    ) {
      return;
    }

    const normalizedScrollLeft = getNormalizedScrollLeft(element.scrollLeft + offsetPx, loopWidth);
    if (normalizedScrollLeft !== element.scrollLeft) {
      element.scrollLeft = normalizedScrollLeft;
    }
  }, []);

  const clearAutoplayFrame = useCallback(() => {
    if (autoplayFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(autoplayFrameRef.current);
      autoplayFrameRef.current = null;
    }

    lastAutoplayFrameTimeRef.current = null;
    autoplayOffsetRemainderRef.current = 0;
  }, []);

  const clearAutoplayResumeTimeout = useCallback(() => {
    if (autoplayResumeTimeoutRef.current === null) return;
    clearTimeout(autoplayResumeTimeoutRef.current);
    autoplayResumeTimeoutRef.current = null;
  }, []);

  const canRunAutoplay = useCallback(() => (
    items.length > 1
    && isAutoplayInViewRef.current
    && !isReducedMotionRef.current
    && !isDraggingRef.current
    && !isAutoplayPausedRef.current
  ), [items.length]);

  const runAutoplayFrame = useCallback((timestamp: number) => {
    autoplayFrameRef.current = null;

    if (!canRunAutoplay()) {
      lastAutoplayFrameTimeRef.current = null;
      autoplayOffsetRemainderRef.current = 0;
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      lastAutoplayFrameTimeRef.current = null;
      autoplayOffsetRemainderRef.current = 0;
      return;
    }

    const lastFrameTime = lastAutoplayFrameTimeRef.current;
    const elapsedMs = lastFrameTime === null
      ? 0
      : Math.min(timestamp - lastFrameTime, FEATURED_READS_AUTOPLAY_MAX_FRAME_DELTA_MS);

    lastAutoplayFrameTimeRef.current = timestamp;

    if (elapsedMs > 0) {
      const directionMultiplier = direction === "left" ? 1 : -1;
      autoplayOffsetRemainderRef.current +=
        directionMultiplier * (elapsedMs / 1000) * FEATURED_READS_AUTOPLAY_SPEED_PX_PER_SECOND;

      const wholePixelOffset = autoplayOffsetRemainderRef.current > 0
        ? Math.floor(autoplayOffsetRemainderRef.current)
        : Math.ceil(autoplayOffsetRemainderRef.current);

      if (wholePixelOffset !== 0) {
        autoplayOffsetRemainderRef.current -= wholePixelOffset;
        shiftScrollPosition(element, wholePixelOffset);
      }
    }

    autoplayFrameRef.current = window.requestAnimationFrame(runAutoplayFrameRef.current);
  }, [canRunAutoplay, direction, shiftScrollPosition]);

  const startAutoplay = useCallback(() => {
    if (typeof window === "undefined" || autoplayFrameRef.current !== null || !canRunAutoplay()) {
      return;
    }

    lastAutoplayFrameTimeRef.current = null;
    autoplayOffsetRemainderRef.current = 0;
    autoplayFrameRef.current = window.requestAnimationFrame(runAutoplayFrameRef.current);
  }, [canRunAutoplay]);

  useEffect(() => {
    runAutoplayFrameRef.current = runAutoplayFrame;
  }, [runAutoplayFrame]);

  const pauseAutoplay = useCallback(() => {
    isAutoplayPausedRef.current = true;
    clearAutoplayResumeTimeout();
    clearAutoplayFrame();
  }, [clearAutoplayFrame, clearAutoplayResumeTimeout]);

  const resumeAutoplayLater = useCallback(() => {
    clearAutoplayResumeTimeout();
    autoplayResumeTimeoutRef.current = setTimeout(() => {
      isAutoplayPausedRef.current = false;
      startAutoplay();
    }, FEATURED_READS_AUTOPLAY_RESUME_DELAY_MS);
  }, [clearAutoplayResumeTimeout, startAutoplay]);

  useEffect(() => {
    if (items.length <= 1) {
      pauseAutoplay();
      return;
    }

    isAutoplayPausedRef.current = false;
    startAutoplay();

    return () => {
      clearAutoplayFrame();
      clearAutoplayResumeTimeout();
    };
  }, [clearAutoplayFrame, clearAutoplayResumeTimeout, items.length, pauseAutoplay, startAutoplay]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || items.length <= 1) {
      isAutoplayInViewRef.current = false;
      clearAutoplayFrame();
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      isAutoplayInViewRef.current = true;
      startAutoplay();

      return () => {
        isAutoplayInViewRef.current = false;
        clearAutoplayFrame();
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        isAutoplayInViewRef.current = Boolean(entry?.isIntersecting);

        if (isAutoplayInViewRef.current) {
          startAutoplay();
          return;
        }

        clearAutoplayFrame();
      },
      {
        rootMargin: "160px 0px",
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
      isAutoplayInViewRef.current = false;
      clearAutoplayFrame();
    };
  }, [clearAutoplayFrame, items.length, startAutoplay]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncMotionPreference = () => {
      isReducedMotionRef.current = motionQuery.matches;

      if (motionQuery.matches) {
        clearAutoplayFrame();
        return;
      }

      startAutoplay();
    };

    syncMotionPreference();
    motionQuery.addEventListener("change", syncMotionPreference);

    return () => {
      motionQuery.removeEventListener("change", syncMotionPreference);
    };
  }, [clearAutoplayFrame, startAutoplay]);

  function prepareForDrag(element: HTMLDivElement) {
    normalizeScrollPosition(element);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.pointerType && event.pointerType !== "mouse") || event.button !== 0) {
      return;
    }

    const element = event.currentTarget;
    clearAutoplayResumeTimeout();
    clearAutoplayFrame();
    prepareForDrag(element);
    isDraggingRef.current = true;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: element.scrollLeft,
      moved: false,
    };
    suppressClickRef.current = false;
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    if (!dragState.moved && Math.abs(deltaX) > FEATURED_READS_DRAG_THRESHOLD_PX) {
      dragState.moved = true;
    }

    if (!dragState.moved) {
      return;
    }

    const element = event.currentTarget;
    element.scrollLeft = dragState.startScrollLeft - deltaX;
    normalizeScrollPosition(element);
    suppressClickRef.current = true;
    event.preventDefault();
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    isDraggingRef.current = false;
    dragStateRef.current = null;
    startAutoplay();
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    isDraggingRef.current = false;
    dragStateRef.current = null;
    startAutoplay();
  }

  function handleScroll() {
    if (isDraggingRef.current) {
      return;
    }

    const element = scrollRef.current;
    if (!element) return;

    normalizeScrollPosition(element);
  }

  const isPrimaryRow = rowIndex === 0;
  const rowSuffix = isPrimaryRow ? "" : `-${rowIndex + 1}`;

  return (
    <div
      className="relative flex w-full overflow-hidden"
      onClickCapture={(event) => {
        if (!suppressClickRef.current) {
          return;
        }

        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        ref={scrollRef}
        aria-label={isPrimaryRow ? "Popular reads" : "More popular reads"}
        data-testid={
          isPrimaryRow ? "featured-reads-carousel" : `featured-reads-carousel${rowSuffix}`
        }
        className={cn(
          "scrollbar-hide flex w-full overflow-x-auto overscroll-x-contain px-4 pb-3 pt-3 sm:px-6 md:pb-4 md:pt-4 [scrollbar-width:none] [touch-action:pan-x] cursor-grab",
          !isPrimaryRow && "opacity-90"
        )}
        onMouseEnter={pauseAutoplay}
        onMouseLeave={resumeAutoplayLater}
        onFocus={pauseAutoplay}
        onBlur={resumeAutoplayLater}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onScroll={handleScroll}
      >
        <div className="flex w-max items-center gap-4 sm:gap-6">
          <div
            ref={firstLoopRef}
            data-testid={
              isPrimaryRow ? "featured-reads-group-a" : `featured-reads-group-a${rowSuffix}`
            }
            className="flex items-center gap-4 sm:gap-6"
          >
            {loopItems.map((item, index) => (
              <div
                key={`${item.id}-a-${index}`}
                className="relative w-[160px] flex-none shrink-0 sm:w-[200px] md:w-[240px]"
              >
                <FeaturedReadCard item={item} />
              </div>
            ))}
          </div>
          <div
            ref={middleLoopRef}
            data-testid={
              isPrimaryRow ? "featured-reads-group-b" : `featured-reads-group-b${rowSuffix}`
            }
            className="flex items-center gap-4 sm:gap-6"
          >
            {loopItems.map((item, index) => (
              <div
                key={`${item.id}-b-${index}`}
                className="relative w-[160px] flex-none shrink-0 sm:w-[200px] md:w-[240px]"
              >
                <FeaturedReadCard item={item} />
              </div>
            ))}
          </div>
          <div
            ref={lastLoopRef}
            data-testid={
              isPrimaryRow ? "featured-reads-group-c" : `featured-reads-group-c${rowSuffix}`
            }
            aria-hidden="true"
            className="flex items-center gap-4 sm:gap-6"
          >
            {loopItems.map((item, index) => (
              <div
                key={`${item.id}-c-${index}`}
                className="relative w-[160px] flex-none shrink-0 sm:w-[200px] md:w-[240px]"
              >
                <FeaturedReadCard item={item} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CorePlatformFeaturesSection() {
  const [activeStoryboardSlide, setActiveStoryboardSlide] = useState(0);
  const [isStoryboardLightboxOpen, setIsStoryboardLightboxOpen] = useState(false);

  const goToPreviousStoryboardSlide = useCallback(() => {
    setActiveStoryboardSlide((current) =>
      current === 0 ? STORYBOARD_SLIDES.length - 1 : current - 1
    );
  }, []);

  const goToNextStoryboardSlide = useCallback(() => {
    setActiveStoryboardSlide((current) =>
      current === STORYBOARD_SLIDES.length - 1 ? 0 : current + 1
    );
  }, []);

  const closeStoryboardLightbox = useCallback(() => {
    setIsStoryboardLightboxOpen(false);
  }, []);

  useEffect(() => {
    if (!isStoryboardLightboxOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeStoryboardLightbox();
        return;
      }

      if (event.key === "ArrowLeft") {
        goToPreviousStoryboardSlide();
        return;
      }

      if (event.key === "ArrowRight") {
        goToNextStoryboardSlide();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    closeStoryboardLightbox,
    goToNextStoryboardSlide,
    goToPreviousStoryboardSlide,
    isStoryboardLightboxOpen,
  ]);

  return (
    <section className="landing-feature-band relative py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <FadeIn className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="landing-feature-shell relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-white/5 via-white/[0.03] to-white/[0.01] p-8 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.85)] sm:p-10 lg:p-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.035] to-transparent blur-2xl" />
          <div className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="relative z-10 grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div className="max-w-md">
              <SectionIntro
                label="How Netflux works"
                title="From insight to lasting reference."
                body="Skim the thesis, read the structured breakdown, highlight passages worth keeping, and ask follow-up questions — all in one place."
              />
            </div>

            <FadeIn delayMs={100}>
              <div className="landing-feature-card relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/80 p-2 shadow-[0_24px_70px_-34px_rgba(0,0,0,0.95)] sm:p-3">
                <button
                  type="button"
                  onClick={() => setIsStoryboardLightboxOpen(true)}
                  className="focus-ring group/storyboard relative block w-full overflow-hidden rounded-[1.45rem] border border-white/10 bg-zinc-950 text-left"
                  aria-label={`Enlarge ${STORYBOARD_SLIDES[activeStoryboardSlide].label} storyboard`}
                >
                  <div
                    className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                    style={{ transform: `translateX(-${activeStoryboardSlide * 100}%)` }}
                  >
                    {STORYBOARD_SLIDES.map((slide) => (
                      <div key={slide.title} className="relative aspect-[1672/941] w-full shrink-0">
                        <Image
                          src={slide.image}
                          alt={`Netflux storyboard: ${slide.title}`}
                          fill
                          sizes="(max-width: 1024px) 100vw, 760px"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="pointer-events-none absolute inset-0 rounded-[1.45rem] ring-1 ring-inset ring-white/10" />
                  <div className="pointer-events-none absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/55 text-white/80 opacity-100 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-300 group-hover/storyboard:border-white/25 group-hover/storyboard:bg-black/70 group-hover/storyboard:text-white sm:opacity-0 sm:group-hover/storyboard:opacity-100 sm:group-focus-visible/storyboard:opacity-100">
                    <Maximize2 className="size-4" />
                  </div>
                </button>

                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                  <div className="hidden sm:block" />

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {STORYBOARD_SLIDES.map((slide, index) => {
                      const isActive = index === activeStoryboardSlide;

                      return (
                        <button
                          key={slide.title}
                          type="button"
                          onClick={() => setActiveStoryboardSlide(index)}
                          className={cn(
                            "focus-ring inline-flex min-h-9 items-center justify-center rounded-full border px-4 text-[0.64rem] font-semibold uppercase tracking-[0.16em] transition-all duration-300",
                            isActive
                              ? "border-white/30 bg-white/[0.1] text-white"
                              : "border-white/10 bg-white/[0.025] text-zinc-500 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                          )}
                          aria-label={`Show ${slide.label} storyboard`}
                          aria-pressed={isActive}
                        >
                          {slide.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex shrink-0 items-center justify-center gap-2 sm:justify-self-end">
                    <button
                      type="button"
                      onClick={goToPreviousStoryboardSlide}
                      className="focus-ring inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                      aria-label="Show previous Netflux workflow slide"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={goToNextStoryboardSlide}
                      className="focus-ring inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08] hover:text-white"
                      aria-label="Show next Netflux workflow slide"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </FadeIn>

      {isStoryboardLightboxOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Netflux storyboard image viewer"
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/88 p-4 backdrop-blur-xl sm:p-6"
        >
          <button
            type="button"
            onClick={closeStoryboardLightbox}
            className="absolute inset-0 cursor-default"
            aria-label="Close Netflux storyboard viewer"
          />

          <div
            className="relative z-10 flex h-full w-full max-w-7xl flex-col justify-center gap-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  {STORYBOARD_SLIDES[activeStoryboardSlide].label}
                </p>
                <p className="mt-1 text-sm font-semibold text-white sm:text-base">
                  {STORYBOARD_SLIDES[activeStoryboardSlide].title}
                </p>
              </div>

              <button
                type="button"
                onClick={closeStoryboardLightbox}
                className="focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.09] hover:text-white"
                aria-label="Close Netflux storyboard viewer"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-y-0 left-0 z-20 hidden items-center sm:flex">
                <button
                  type="button"
                  onClick={goToPreviousStoryboardSlide}
                  className="focus-ring inline-flex size-12 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/75 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md transition-all duration-300 hover:border-white/25 hover:bg-black/70 hover:text-white"
                  aria-label="Show previous Netflux storyboard"
                >
                  <ChevronLeft className="size-5" />
                </button>
              </div>

              <div className="absolute inset-y-0 right-0 z-20 hidden items-center sm:flex">
                <button
                  type="button"
                  onClick={goToNextStoryboardSlide}
                  className="focus-ring inline-flex size-12 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/75 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md transition-all duration-300 hover:border-white/25 hover:bg-black/70 hover:text-white"
                  aria-label="Show next Netflux storyboard"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>

              <div className="relative mx-auto h-full max-h-[82vh] max-w-[min(94vw,1280px)] overflow-hidden rounded-[1.5rem] border border-white/10 bg-black shadow-[0_34px_110px_-45px_rgba(0,0,0,0.95)]">
                <div
                  className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                  style={{ transform: `translateX(-${activeStoryboardSlide * 100}%)` }}
                >
                  {STORYBOARD_SLIDES.map((slide) => (
                    <div key={`lightbox-${slide.title}`} className="relative h-full w-full shrink-0">
                      <Image
                        src={slide.image}
                        alt={`Expanded Netflux storyboard: ${slide.title}`}
                        fill
                        sizes="94vw"
                        className="object-contain"
                        priority
                      />
                    </div>
                  ))}
                </div>
                <div className="pointer-events-none absolute inset-0 rounded-[1.5rem] ring-1 ring-inset ring-white/10" />
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <div className="flex items-center justify-center gap-2 sm:hidden">
                <button
                  type="button"
                  onClick={goToPreviousStoryboardSlide}
                  className="focus-ring inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.09] hover:text-white"
                  aria-label="Show previous Netflux storyboard"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={goToNextStoryboardSlide}
                  className="focus-ring inline-flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.09] hover:text-white"
                  aria-label="Show next Netflux storyboard"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                {STORYBOARD_SLIDES.map((slide, index) => {
                  const isActive = index === activeStoryboardSlide;

                  return (
                    <button
                      key={`lightbox-control-${slide.title}`}
                      type="button"
                      onClick={() => setActiveStoryboardSlide(index)}
                      className={cn(
                        "focus-ring inline-flex min-h-9 items-center justify-center rounded-full border px-4 text-[0.64rem] font-semibold uppercase tracking-[0.16em] transition-all duration-300",
                        isActive
                          ? "border-white/30 bg-white/[0.12] text-white"
                          : "border-white/10 bg-white/[0.035] text-zinc-500 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                      )}
                      aria-label={`Show ${slide.label} storyboard`}
                      aria-pressed={isActive}
                    >
                      {slide.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function TopicMapSection({ categories }: { categories: { category: string; count: number }[] }) {
  return (
    <section className="landing-topic-band relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeIn>
          <SectionIntro
            label="Explore by domain"
            title="Deep in every domain."
            body="Non-fiction knowledge organized by topic. Go deep on what matters to you."
            centered
          />
        </FadeIn>

        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((item, index) => {
            const Icon = CATEGORY_ICONS[item.category as keyof typeof CATEGORY_ICONS] || Sparkles;

            return (
              <FadeIn key={item.category} delayMs={index * 50}>
                <Link
                  href={`/search?category=${encodeURIComponent(item.category)}`}
                  className="landing-topic-card group relative flex h-full min-h-44 flex-col items-center justify-center gap-4 overflow-hidden rounded-[2rem] border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.08] hover:shadow-[0_24px_50px_-28px_rgba(255,255,255,0.24)] sm:p-8"
                >
                  <div className="pointer-events-none absolute inset-x-8 top-0 h-20 bg-gradient-to-b from-white/[0.08] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 shadow-inner transition-colors group-hover:bg-black/60">
                    <Icon className="size-6 text-zinc-400 transition-colors group-hover:text-white" />
                  </div>
                  <div>
                    <span className="text-[0.95rem] font-semibold tracking-[0.01em] text-zinc-300 transition-colors group-hover:text-white">
                      {item.category}
                    </span>
                    <span className="mt-2 block text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-zinc-500 transition-colors group-hover:text-zinc-300">
                      {item.count} {item.count === 1 ? "read" : "reads"}
                    </span>
                  </div>
                </Link>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FinalCTASection() {
  return (
    <section className="landing-cta-band relative overflow-hidden py-32 sm:py-40">
      <FadeIn>
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center lg:px-8">
          <div className="relative px-6 py-14 sm:px-10">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-32 -translate-y-1/2 bg-gradient-to-r from-transparent via-white/[0.035] to-transparent blur-3xl" />

            <div className="relative">
              <h2 className="font-serif text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl md:text-[5.5rem]">
                Stop forgetting what you learn.
              </h2>

              <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-[1.18rem]">
                Join learners who use Netflux to retain and revisit the best ideas from non-fiction.
              </p>

              <EmailSubscriptionForm
                source="landing_final_cta"
                align="center"
                className="mt-10"
                title="Subscribe to the weekly note."
                description="High-signal ideas, curated for remembering and revisiting."
              />

              <p className="mt-12 text-sm font-semibold uppercase tracking-[0.24em] text-zinc-400">
                Save the idea. Revisit what matters.
              </p>
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.04] py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row lg:px-8">
        <div className="flex items-center gap-3 text-sm text-muted-foreground/60">
          <span>{APP_NAME} - Knowledge without limits</span>
        </div>

        <div className="flex items-center gap-6 text-sm text-muted-foreground/60">
          <Link href="/about" className="focus-ring rounded-sm transition-colors duration-300 hover:text-foreground">
            About
          </Link>
          <Link href="/privacy" className="focus-ring rounded-sm transition-colors duration-300 hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="focus-ring rounded-sm transition-colors duration-300 hover:text-foreground">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
