"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Sparkles,
  X,
} from "lucide-react";
import { EmailSubscriptionForm } from "@/components/ui/EmailSubscriptionForm";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/brand";
export { getCuratedCategories } from "@/components/ui/landing/landingCategories";
import { cn } from "@/lib/utils";
import type { ContentItem } from "@/types/database";

const STORYBOARD_SLIDES = [
  {
    label: "Distill",
    title: "Distill before committing time",
    eyebrow: "Understand before you commit",
    heading: "Find the ideas worth your attention.",
    body: "See the central argument and key takeaways before deciding what deserves more of your time.",
    image: "/images/netflux-workflow-distill-square.png",
  },
  {
    label: "Library",
    title: "Build your personal library",
    eyebrow: "Keep what matters",
    heading: "Turn useful ideas into a lasting library.",
    body: "Save summaries, highlights, and notes in one place you can return to when they become useful.",
    image: "/images/netflux-workflow-library-square.png",
  },
  {
    label: "Ask",
    title: "Think with your notes",
    eyebrow: "Think across your knowledge",
    heading: "Ask better questions of what you have learned.",
    body: "Clarify an argument, challenge an idea, or search your saved knowledge for a useful answer.",
    image: "/images/netflux-workflow-ask-square.png",
  },
] as const;

const FEATURED_READS_DRAG_THRESHOLD_PX = 6;
const FEATURED_READS_TOUCH_DRAG_INTENT_RATIO = 1.15;
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
  compact = false,
}: {
  label: string;
  title: string;
  body?: string;
  centered?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", centered && "mx-auto text-center")}>
      <p className="landing-section-kicker mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-zinc-400">
        {label}
      </p>
      <h2
        className={cn(
          "landing-section-title font-serif font-bold leading-[1.02] tracking-[-0.035em] text-white",
          compact
            ? "text-4xl sm:text-[2.8rem] md:text-[3.15rem]"
            : "text-4xl sm:text-5xl md:text-[3.65rem]"
        )}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={cn(
            "landing-section-body text-base text-zinc-300",
            compact ? "mt-5 max-w-2xl leading-7 sm:text-[1.05rem] sm:leading-8" : "mt-6 leading-8 sm:text-[1.15rem]"
          )}
        >
          {body}
        </p>
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

function FeaturedReadCard({
  item,
  isFocusable = true,
}: {
  item: ContentItem;
  isFocusable?: boolean;
}) {
  const durationLabel = formatFeaturedReadDuration(item.duration_seconds);

  return (
    <Link
      href={`/preview/${item.id}`}
      aria-label={`Preview ${item.title}`}
      aria-hidden={isFocusable ? undefined : true}
      tabIndex={isFocusable ? undefined : -1}
      className="focus-ring landing-featured-read-card group relative block h-full w-full overflow-hidden rounded-md bg-card transition-[transform,box-shadow] duration-300 md:hover:z-10 md:hover:-translate-y-1 md:focus-visible:z-10 md:focus-visible:-translate-y-1"
    >
      {item.cover_image_url ? (
        <Image
          src={item.cover_image_url}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 180px, (max-width: 768px) 220px, 340px"
          className="object-cover transition-transform duration-300 md:group-hover:scale-[1.035] md:group-focus-visible:scale-[1.035]"
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

      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

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

      <div className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] border border-white/15 transition-colors" />
      <div className="pointer-events-none absolute inset-0 z-30 rounded-[inherit] border-2 border-transparent transition-colors group-hover:border-white/35 group-focus-visible:border-white/45" />
    </Link>
  );
}

export function FeaturedReadsSection({
  items,
  categories,
  totalContentCount,
}: {
  items: ContentItem[];
  categories: { category: string; count: number; rawValues: string[] }[];
  totalContentCount: number;
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [displayedItems, setDisplayedItems] = useState(items);
  const [isLoadingCategory, setIsLoadingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const categoryCacheRef = useRef(new Map<string, ContentItem[]>());
  const categoryRequestRef = useRef(0);
  const visibleCategories = categories.filter((category) => category.count >= 8).slice(0, 5);
  const activeCategoryStat = categories.find((category) => category.category === activeCategory);
  const rows = getFeaturedReadRows(displayedItems);
  const useStaticRow = activeCategory !== null && displayedItems.length < FEATURED_READS_MIN_LOOP_ITEMS;
  const roundedContentCount = Math.floor(totalContentCount / 100) * 100;
  const popularIdeasCopy =
    roundedContentCount >= 100
      ? `Over ${roundedContentCount}+ summaries across books, podcasts, articles, and videos.`
      : "Summaries across books, podcasts, articles, and videos.";
  const browseHref = activeCategory
    ? `/search?category=${encodeURIComponent(activeCategory)}`
    : "/browse";

  if (items.length === 0) return null;

  function showAllItems() {
    categoryRequestRef.current += 1;
    setActiveCategory(null);
    setDisplayedItems(items);
    setIsLoadingCategory(false);
    setCategoryError(null);
  }

  async function showCategory(category: string) {
    if (category === activeCategory) return;

    const requestId = categoryRequestRef.current + 1;
    categoryRequestRef.current = requestId;
    setActiveCategory(category);
    setCategoryError(null);

    const cachedItems = categoryCacheRef.current.get(category);
    if (cachedItems) {
      setDisplayedItems(cachedItems);
      setIsLoadingCategory(false);
      return;
    }

    setIsLoadingCategory(true);

    try {
      const params = new URLSearchParams({ category });
      const categoryStat = categories.find((item) => item.category === category);
      categoryStat?.rawValues.forEach((value) => params.append("value", value));
      const response = await fetch(`/api/landing/category-content?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Category request failed");
      }

      const payload = (await response.json()) as { items?: ContentItem[] };
      const categoryItems = Array.isArray(payload.items) ? payload.items : [];

      if (categoryRequestRef.current !== requestId) return;

      if (categoryItems.length === 0) {
        setCategoryError("No reads are currently available in this domain. Showing the full library instead.");
        setActiveCategory(null);
        setDisplayedItems(items);
        return;
      }

      categoryCacheRef.current.set(category, categoryItems);
      setDisplayedItems(categoryItems);
    } catch {
      if (categoryRequestRef.current !== requestId) return;

      setCategoryError("Could not load this domain. Showing the full library instead.");
      setActiveCategory(null);
      setDisplayedItems(items);
    } finally {
      if (categoryRequestRef.current === requestId) {
        setIsLoadingCategory(false);
      }
    }
  }

  return (
    <section
      id="featured-reads"
      className="landing-featured-band scroll-mt-20 overflow-hidden py-24 sm:py-32"
    >
      <FadeIn className="mx-auto mb-8 flex max-w-7xl flex-col gap-8 px-6 md:mb-10 md:flex-row md:items-end md:justify-between">
        <SectionIntro
          label="Explore the library"
          title="Ideas worth remembering."
          body={popularIdeasCopy}
        />
        <Link
          href={browseHref}
          className="focus-ring landing-soft-action group inline-flex w-fit items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.07] hover:text-white"
        >
          {activeCategory ? `Browse ${activeCategory}` : "Browse all"}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </FadeIn>

      {visibleCategories.length > 0 ? (
        <FadeIn delayMs={75} className="mx-auto mb-7 max-w-7xl px-6">
          <div
            role="tablist"
            aria-label="Explore library domains"
            className="landing-domain-nav scrollbar-hide flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === null}
              onClick={showAllItems}
              className={cn(
                "focus-ring landing-domain-chip shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                activeCategory === null
                  ? "landing-domain-chip-active"
                  : "border-white/10 bg-white/[0.025] text-zinc-400 hover:border-white/20 hover:text-white"
              )}
            >
              All
            </button>
            {visibleCategories.map((category) => (
              <button
                key={category.category}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.category}
                aria-label={`${category.category}, ${category.count} reads`}
                onClick={() => void showCategory(category.category)}
                className={cn(
                  "focus-ring landing-domain-chip shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors",
                  activeCategory === category.category
                    ? "landing-domain-chip-active"
                    : "border-white/10 bg-white/[0.025] text-zinc-400 hover:border-white/20 hover:text-white"
                )}
              >
                {category.category}
              </button>
            ))}
          </div>
        </FadeIn>
      ) : null}

      <FadeIn delayMs={100}>
        <div
          className="landing-featured-shelf relative mx-auto flex w-full max-w-7xl flex-col gap-5 overflow-hidden pb-8 pt-4 md:gap-6"
          aria-busy={isLoadingCategory}
        >
          <div className="landing-featured-edge landing-featured-edge-left pointer-events-none absolute inset-y-0 left-0 z-10 w-16" />
          <div className="landing-featured-edge landing-featured-edge-right pointer-events-none absolute inset-y-0 right-0 z-10 w-16" />
          <div
            key={activeCategory ?? "all"}
            className={cn(
              "flex flex-col gap-5 transition-opacity duration-200 md:gap-6",
              isLoadingCategory && "pointer-events-none opacity-35"
            )}
          >
            {useStaticRow ? (
              <FeaturedReadsStaticRow items={displayedItems} />
            ) : (
              rows.map((rowItems, index) => (
                <FeaturedReadsMarqueeRow
                  key={`featured-reads-row-${index}`}
                  items={rowItems}
                  direction={index % 2 === 0 ? "left" : "right"}
                  rowIndex={index}
                />
              ))
            )}
          </div>
          {isLoadingCategory ? (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <span className="rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-semibold text-zinc-300 backdrop-blur-md">
                Loading {activeCategory}
              </span>
            </div>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {isLoadingCategory
            ? `Loading ${activeCategory}`
            : activeCategory
              ? `${displayedItems.length} ${activeCategory} reads shown`
              : categoryError ?? "Showing popular reads"}
        </p>
        {activeCategoryStat && displayedItems.length < FEATURED_READS_MIN_LOOP_ITEMS ? (
          <div className="mx-auto mt-2 flex max-w-7xl items-center justify-between gap-4 px-6 text-xs text-zinc-500">
            <span>Showing the available {activeCategory} reads without repetition.</span>
            <Link href={browseHref} className="shrink-0 font-semibold text-zinc-300 hover:text-white">
              View domain
            </Link>
          </div>
        ) : null}
        {categoryError ? (
          <p className="mx-auto mt-2 max-w-7xl px-6 text-xs text-zinc-500">{categoryError}</p>
        ) : null}
      </FadeIn>
    </section>
  );
}

function FeaturedReadsStaticRow({ items }: { items: ContentItem[] }) {
  return (
    <div
      aria-label="Domain reads"
      className="landing-featured-row landing-featured-row-primary scrollbar-hide flex w-full overflow-x-auto overscroll-x-contain px-4 pb-4 pt-4 sm:px-6 [scrollbar-width:none]"
    >
      <div className="flex items-stretch gap-4 sm:gap-6">
        {items.map((item) => (
          <div key={item.id} className="landing-featured-read-shell relative flex-none shrink-0">
            <FeaturedReadCard item={item} />
          </div>
        ))}
      </div>
    </div>
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
    pointerType: string;
    startX: number;
    startY: number;
    startScrollLeft: number;
    intent: "pending" | "horizontal";
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

  function releasePointerCapture(element: HTMLDivElement, pointerId: number) {
    if (element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  }

  function clearDragState() {
    isDraggingRef.current = false;
    dragStateRef.current = null;
    startAutoplay();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const element = event.currentTarget;
    clearAutoplayResumeTimeout();
    clearAutoplayFrame();
    prepareForDrag(element);
    isDraggingRef.current = true;
    dragStateRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: element.scrollLeft,
      intent: "pending",
      moved: false,
    };
    suppressClickRef.current = false;

    if (event.pointerType === "mouse") {
      element.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const absoluteDeltaX = Math.abs(deltaX);
    const absoluteDeltaY = Math.abs(deltaY);

    if (dragState.intent === "pending") {
      if (
        absoluteDeltaX < FEATURED_READS_DRAG_THRESHOLD_PX
        && absoluteDeltaY < FEATURED_READS_DRAG_THRESHOLD_PX
      ) {
        return;
      }

      const hasHorizontalIntent = dragState.pointerType === "mouse"
        || absoluteDeltaX > absoluteDeltaY * FEATURED_READS_TOUCH_DRAG_INTENT_RATIO;

      if (!hasHorizontalIntent) {
        clearDragState();
        return;
      }

      dragState.intent = "horizontal";
      dragState.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
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

    releasePointerCapture(event.currentTarget, event.pointerId);
    clearDragState();
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    releasePointerCapture(event.currentTarget, event.pointerId);
    clearDragState();
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
          "landing-featured-row scrollbar-hide flex w-full overflow-x-auto overscroll-x-contain px-4 pb-3 pt-3 sm:px-6 md:pb-4 md:pt-4 [scrollbar-width:none] [touch-action:pan-y_pinch-zoom] cursor-grab",
          isPrimaryRow ? "landing-featured-row-primary" : "landing-featured-row-support opacity-90"
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
        <div className="flex w-max items-stretch gap-4 sm:gap-6">
          <div
            ref={firstLoopRef}
            data-testid={
              isPrimaryRow ? "featured-reads-group-a" : `featured-reads-group-a${rowSuffix}`
            }
            aria-hidden="true"
            className="flex items-stretch gap-4 sm:gap-6"
          >
            {loopItems.map((item, index) => (
              <div
                key={`${item.id}-a-${index}`}
                className="landing-featured-read-shell relative flex-none shrink-0"
              >
                <FeaturedReadCard item={item} isFocusable={false} />
              </div>
            ))}
          </div>
          <div
            ref={middleLoopRef}
            data-testid={
              isPrimaryRow ? "featured-reads-group-b" : `featured-reads-group-b${rowSuffix}`
            }
            className="flex items-stretch gap-4 sm:gap-6"
          >
            {loopItems.map((item, index) => (
              <div
                key={`${item.id}-b-${index}`}
                className="landing-featured-read-shell relative flex-none shrink-0"
              >
                <FeaturedReadCard item={item} isFocusable={index < items.length} />
              </div>
            ))}
          </div>
          <div
            ref={lastLoopRef}
            data-testid={
              isPrimaryRow ? "featured-reads-group-c" : `featured-reads-group-c${rowSuffix}`
            }
            aria-hidden="true"
            className="flex items-stretch gap-4 sm:gap-6"
          >
            {loopItems.map((item, index) => (
              <div
                key={`${item.id}-c-${index}`}
                className="landing-featured-read-shell relative flex-none shrink-0"
              >
                <FeaturedReadCard item={item} isFocusable={false} />
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
  const storyboardLauncherRef = useRef<HTMLButtonElement>(null);
  const storyboardLightboxRef = useRef<HTMLDivElement>(null);
  const storyboardCloseButtonRef = useRef<HTMLButtonElement>(null);

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
    const storyboardLauncher = storyboardLauncherRef.current;
    document.body.style.overflow = "hidden";
    storyboardCloseButtonRef.current?.focus();

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
        return;
      }

      if (event.key === "Tab") {
        const focusableElements = Array.from(
          storyboardLightboxRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ) ?? []
        ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);

        if (focusableElements.length === 0) {
          event.preventDefault();
          storyboardCloseButtonRef.current?.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      storyboardLauncher?.focus();
    };
  }, [
    closeStoryboardLightbox,
    goToNextStoryboardSlide,
    goToPreviousStoryboardSlide,
    isStoryboardLightboxOpen,
  ]);

  return (
    <section className="landing-feature-band relative py-14 sm:py-18">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <FadeIn className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative">
          <div className="relative z-10">
            <SectionIntro
              label="How Netflux works"
              title="Understand it. Keep it. Use it."
              body="Distill essential ideas, build your personal knowledge library, and find useful answers whenever you need them."
              compact
            />

            <FadeIn className="mx-auto mt-8 max-w-6xl sm:mt-10" delayMs={100}>
              <div className="grid min-h-[32rem] items-center gap-8 rounded-[1.5rem] bg-black/20 p-5 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-x-10 lg:gap-y-8 lg:p-10">
                <div className="mx-auto max-w-sm text-center lg:mx-0 lg:text-left">
                  <div className="mb-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                    {STORYBOARD_SLIDES.map((slide, index) => {
                      const isActive = index === activeStoryboardSlide;

                      return (
                        <button
                          key={slide.title}
                          type="button"
                          onClick={() => setActiveStoryboardSlide(index)}
                          className={cn(
                            "focus-ring landing-storyboard-tab inline-flex min-h-9 items-center justify-center rounded-full border px-4 text-[0.64rem] font-semibold uppercase tracking-[0.14em] transition-all duration-300",
                            isActive
                              ? "landing-storyboard-tab-active border-white/30 bg-white/[0.1] text-white"
                              : "landing-storyboard-tab-idle border-white/10 bg-white/[0.025] text-zinc-500 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                          )}
                          aria-label={`Show ${slide.label} storyboard`}
                          aria-pressed={isActive}
                        >
                          {slide.label}
                        </button>
                      );
                    })}
                  </div>

                  <div key={`copy-${STORYBOARD_SLIDES[activeStoryboardSlide].label}`}>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.17em] text-[#e7bd72]/90">
                      {STORYBOARD_SLIDES[activeStoryboardSlide].eyebrow}
                    </p>
                    <h3 className="mt-4 text-3xl font-medium leading-[1.15] tracking-[-0.02em] text-white sm:text-[2.15rem]">
                      {STORYBOARD_SLIDES[activeStoryboardSlide].heading}
                    </h3>
                    <p className="mt-4 text-base leading-7 text-zinc-300 sm:text-[1.05rem] sm:leading-8">
                      {STORYBOARD_SLIDES[activeStoryboardSlide].body}
                    </p>
                  </div>
                </div>

                <button
                  ref={storyboardLauncherRef}
                  type="button"
                  onClick={() => setIsStoryboardLightboxOpen(true)}
                  className="focus-ring landing-storyboard-viewer group/storyboard relative mx-auto block aspect-square w-full max-w-[34rem] overflow-hidden rounded-[1.25rem] border border-white/10 bg-white text-left"
                  aria-label={`Enlarge ${STORYBOARD_SLIDES[activeStoryboardSlide].label} storyboard`}
                >
                  {STORYBOARD_SLIDES.map((slide, index) => (
                    <div
                      key={slide.title}
                      className={cn(
                        "absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none",
                        index === activeStoryboardSlide ? "opacity-100" : "pointer-events-none opacity-0"
                      )}
                    >
                      <Image
                        src={slide.image}
                        alt={`Netflux storyboard: ${slide.title}`}
                        fill
                        sizes="(max-width: 1024px) calc(100vw - 4rem), 544px"
                        className="object-contain"
                      />
                    </div>
                  ))}
                  <div className="pointer-events-none absolute inset-0 rounded-[1.25rem] ring-1 ring-inset ring-black/10" />
                  <div className="landing-storyboard-zoom pointer-events-none absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full border border-white/10 bg-black/65 text-white/85 opacity-100 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)] backdrop-blur-md transition-all duration-300 group-hover/storyboard:border-white/25 group-hover/storyboard:bg-black/80 group-hover/storyboard:text-white sm:opacity-0 sm:group-hover/storyboard:opacity-100 sm:group-focus-visible/storyboard:opacity-100">
                    <Maximize2 className="size-4" />
                  </div>
                </button>
              </div>
            </FadeIn>
          </div>
        </div>
      </FadeIn>

      {isStoryboardLightboxOpen ? createPortal(
        <div
          ref={storyboardLightboxRef}
          role="dialog"
          aria-modal="true"
          aria-label="Netflux storyboard image viewer"
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/88 px-4 safe-area-pb-md safe-area-pt-md backdrop-blur-xl sm:p-6"
        >
          <button
            type="button"
            onClick={closeStoryboardLightbox}
            className="absolute inset-0 cursor-default"
            aria-label="Close Netflux storyboard viewer"
            tabIndex={-1}
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
                ref={storyboardCloseButtonRef}
                type="button"
                onClick={closeStoryboardLightbox}
                className="focus-ring landing-icon-control inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/75 transition-all duration-300 hover:border-white/25 hover:bg-white/[0.09] hover:text-white"
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
                  className="focus-ring landing-icon-control inline-flex size-12 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/75 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md transition-all duration-300 hover:border-white/25 hover:bg-black/70 hover:text-white"
                  aria-label="Show previous Netflux storyboard"
                >
                  <ChevronLeft className="size-5" />
                </button>
              </div>

              <div className="absolute inset-y-0 right-0 z-20 hidden items-center sm:flex">
                <button
                  type="button"
                  onClick={goToNextStoryboardSlide}
                  className="focus-ring landing-icon-control inline-flex size-12 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/75 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md transition-all duration-300 hover:border-white/25 hover:bg-black/70 hover:text-white"
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
              <div className="flex flex-wrap items-center justify-center gap-2">
                {STORYBOARD_SLIDES.map((slide, index) => {
                  const isActive = index === activeStoryboardSlide;

                  return (
                    <button
                      key={`lightbox-control-${slide.title}`}
                      type="button"
                      onClick={() => setActiveStoryboardSlide(index)}
                      className={cn(
                        "focus-ring landing-storyboard-tab inline-flex min-h-9 items-center justify-center rounded-full border px-4 text-[0.64rem] font-semibold uppercase tracking-[0.16em] transition-all duration-300",
                        isActive
                          ? "landing-storyboard-tab-active border-white/30 bg-white/[0.12] text-white"
                          : "landing-storyboard-tab-idle border-white/10 bg-white/[0.035] text-zinc-500 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
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
        </div>,
        document.body
      ) : null}
    </section>
  );
}

export function FinalCTASection() {
  return (
    <section className="landing-cta-band relative overflow-hidden pt-16 pb-24 sm:pt-24 sm:pb-32 lg:pt-28 lg:pb-36">
      <FadeIn>
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center lg:px-8">
          <div className="relative px-6 py-10 sm:px-10 sm:py-14">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-32 -translate-y-1/2 bg-gradient-to-r from-transparent via-white/[0.035] to-transparent blur-3xl" />

            <div className="relative">
              <h2 className="font-serif text-5xl font-bold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl md:text-[5.5rem]">
                Stop forgetting what you learn.
              </h2>

              <EmailSubscriptionForm
                source="landing_final_cta"
                align="center"
                className="mt-10"
                title="Get one high-signal idea every week."
                description="A concise note from books, podcasts, articles, and videos worth remembering."
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
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 text-center sm:flex-row sm:text-left lg:px-8">
        <div className="flex flex-col items-center gap-3 sm:items-start">
          <Link href="/" className="focus-ring inline-flex rounded-sm">
            <Logo
              width={96}
              height={26}
              className="brightness-110 drop-shadow-[0_1px_8px_rgba(255,255,255,0.06)]"
            />
          </Link>
          <div className="space-y-1 text-sm text-muted-foreground/60">
            <p>Summary-first knowledge system</p>
            <p>&copy; 2026 {APP_NAME}. All rights reserved.</p>
          </div>
        </div>

        <nav aria-label="Footer navigation" className="flex items-center gap-6 text-sm text-muted-foreground/60">
          <Link href="/about" className="focus-ring rounded-sm transition-colors duration-300 hover:text-foreground">
            About
          </Link>
          <Link href="/privacy" className="focus-ring rounded-sm transition-colors duration-300 hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="focus-ring rounded-sm transition-colors duration-300 hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
