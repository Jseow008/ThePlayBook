"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Clock, BookOpen, Sparkles, ChevronDown, Headphones } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { ContentItem } from "@/types/database";
import type { QuickMode, SeriesContext } from "@/types/domain";
import { ShareButton } from "@/components/ui/ShareButton";
import { SaveToLibraryButton } from "@/components/ui/SaveToLibraryButton";
import { APP_NAME } from "@/lib/brand";
import { buildReadPath } from "@/lib/content-paths";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import {
    READER_COVER_FRAME_CLASS,
    READER_COVER_IMAGE_SIZES,
    READER_COVER_WRAPPER_CLASS,
} from "@/components/ui/content-card-standards";

interface ContentPreviewProps {
    item: ContentItem;
    segmentCount?: number | null;
    seriesContext?: SeriesContext | null;
    onSpinAgain?: () => void;
    isSpinning?: boolean;
    ctaIcon?: React.ElementType;
    initialShowAllTakeaways?: boolean;
}

export function ContentPreview({
    item,
    segmentCount,
    seriesContext = null,
    onSpinAgain,
    isSpinning = false,
    ctaIcon: CtaIcon = Sparkles,
    initialShowAllTakeaways = false,
}: ContentPreviewProps) {
    const quickMode = item.quick_mode_json as QuickMode | null;
    const { getProgress } = useReadingProgress();
    const progress = getProgress(item.id);
    const readCtaLabel = progress?.isCompleted
        ? "Read Again"
        : progress
            ? "Continue Reading"
            : "Read Summary";
    const readCtaHref = buildReadPath(item);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const hookRef = useRef<HTMLDivElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const [showAllTakeaways, setShowAllTakeaways] = useState(initialShowAllTakeaways);
    const [showFullHook, setShowFullHook] = useState(false);

    useEffect(() => {
        setShowFullHook(false);
        setIsTruncated(false);
        setShowAllTakeaways(initialShowAllTakeaways);
    }, [initialShowAllTakeaways, item.id]);

    useEffect(() => {
        const element = hookRef.current;
        if (!element || showFullHook) return;
        let isActive = true;

        const checkTruncation = () => {
            if (!isActive) return;
            setIsTruncated(element.scrollHeight > element.clientHeight + 1);
        };

        checkTruncation();
        if (typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", checkTruncation);
            return () => {
                isActive = false;
                window.removeEventListener("resize", checkTruncation);
            };
        }

        const observer = new ResizeObserver(checkTruncation);
        observer.observe(element);
        document.fonts?.ready.then(checkTruncation).catch(() => {});

        return () => {
            isActive = false;
            observer.disconnect();
        };
    }, [quickMode?.hook, showFullHook]);

    // Filter out empty takeaways
    const activeTakeaways =
        quickMode?.key_takeaways.filter((t) => t && t.trim().length > 0) || [];

    const collapsedTakeawayCount = activeTakeaways.length === 4 ? 4 : 3;
    const visibleTakeaways = showAllTakeaways
        ? activeTakeaways
        : activeTakeaways.slice(0, collapsedTakeawayCount);
    const hasHidden = activeTakeaways.length > collapsedTakeawayCount;

    const handleBackToTop = () => {
        const title = titleRef.current;
        if (!title) return;

        const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        title.focus({ preventScroll: true });
        title.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: "start",
        });
    };

    return (
        // Mobile padding keeps the final content clear of the fixed CTA rail.
        <div className="min-h-screen bg-background text-foreground pb-[calc(5.75rem+var(--safe-area-bottom))] sm:pb-10 lg:pb-8">
            {/* Container */}
            <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-8 pb-3 sm:py-12">


                {/* ── Hero: Cover + Info ── */}
                <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-4 sm:mb-6">
                    {/* Cover Image */}
                    {item.cover_image_url && (
                        <div className={READER_COVER_WRAPPER_CLASS}>
                            <div className={`${READER_COVER_FRAME_CLASS} max-w-[220px] mx-auto sm:max-w-none rounded-2xl overflow-hidden shadow-2xl shadow-black/20 border border-border relative group`}>
                                <ResilientImage
                                    src={item.cover_image_url}
                                    alt={item.title}
                                    fill
                                    surface="content-preview"
                                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                                    sizes={READER_COVER_IMAGE_SIZES}
                                    priority
                                    fallback={
                                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-secondary via-card to-background">
                                            <BookOpen className="size-12 text-muted-foreground" />
                                        </div>
                                    }
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </div>
                    )}

                    {/* Title, Author & CTA */}
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                        <h1
                            ref={titleRef}
                            tabIndex={-1}
                            className="scroll-mt-24 text-2xl sm:text-3xl md:text-4xl font-bold font-display text-foreground tracking-tight md:tracking-[-0.02em] leading-[1.15] mb-2 text-center sm:text-left"
                        >
                            {item.title}
                        </h1>
                        {item.author && (
                            <p className="mb-4 line-clamp-2 text-balance text-center text-lg font-medium text-muted-foreground sm:block sm:truncate sm:text-left">
                                {item.author}
                            </p>
                        )}

                        {/* Mobile Metadata Pills */}
                        <div className="order-1 mb-4 flex flex-col items-center gap-2 sm:hidden">
                            <div className="flex flex-wrap items-center justify-center gap-2">
                                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50 uppercase tracking-wider">
                                    {item.type}
                                </span>
                                {item.category && (
                                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50">
                                        {item.category}
                                    </span>
                                )}
                            </div>

                            {(item.duration_seconds ||
                                (segmentCount !== undefined &&
                                    segmentCount !== null &&
                                    segmentCount > 0) ||
                                item.audio_url) && (
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    {item.duration_seconds && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50">
                                            <Clock className="size-3" />
                                            {Math.round(item.duration_seconds / 60)} min read
                                        </span>
                                    )}
                                    {segmentCount !== undefined &&
                                        segmentCount !== null &&
                                        segmentCount > 0 && (
                                            <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50">
                                                {segmentCount} sections
                                            </span>
                                        )}
                                    {item.audio_url && (
                                        <span
                                            aria-label="Audio available"
                                            className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/60 px-2.5 py-1 text-xs font-medium text-muted-foreground"
                                        >
                                            <Headphones aria-hidden="true" className="size-3" />
                                            Audio
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Desktop Metadata Pills */}
                        <div className="order-1 mb-6 hidden flex-col items-start gap-2 sm:flex">
                            <div className="flex flex-wrap items-center justify-start gap-2">
                                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50 uppercase tracking-wider">
                                    {item.type}
                                </span>
                                {item.category && (
                                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50">
                                        {item.category}
                                    </span>
                                )}
                                {item.duration_seconds && (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50">
                                        <Clock className="size-3" />
                                        {Math.round(item.duration_seconds / 60)} min read
                                    </span>
                                )}
                                {segmentCount !== undefined &&
                                    segmentCount !== null &&
                                    segmentCount > 0 && (
                                        <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50">
                                            {segmentCount} sections
                                        </span>
                                    )}
                            </div>

                            {seriesContext && (
                                <div className="hidden sm:flex w-full flex-wrap items-center gap-x-3 gap-y-2 pt-1 text-sm text-muted-foreground">
                                    <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-semibold text-foreground">
                                        Part {seriesContext.currentOrder} of {seriesContext.totalItems} in {seriesContext.series.title}
                                    </span>
                                    <Link
                                        href={`/series/${seriesContext.series.slug}`}
                                        className="font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
                                    >
                                        View All Series
                                    </Link>
                                </div>
                            )}
                        </div>

                        {seriesContext && (
                            <div className="order-2 mb-2 flex flex-col gap-2 sm:hidden">
                                <div className="flex flex-col gap-2 text-sm">
                                    <span className="inline-flex w-fit items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-semibold text-foreground">
                                        Part {seriesContext.currentOrder} of {seriesContext.totalItems} in {seriesContext.series.title}
                                    </span>
                                    {seriesContext.nextItem ? (
                                        <span className="text-muted-foreground">
                                            Next:{" "}
                                            <Link
                                                href={`/preview/${seriesContext.nextItem.id}`}
                                                className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                                            >
                                                {seriesContext.nextItem.title}
                                            </Link>
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">
                                            Final part in this sequence
                                        </span>
                                    )}
                                </div>

                                <Link
                                    href={`/series/${seriesContext.series.slug}`}
                                    className="inline-flex w-fit items-center text-sm font-semibold text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
                                >
                                    View all series
                                </Link>
                            </div>
                        )}

                        {/* CTA Buttons */}
                        <div className="order-3 hidden sm:flex flex-col gap-3 sm:order-2">
                            <div className="flex items-center gap-2.5">
                                <Link
                                    href={readCtaHref}
                                    className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-xl bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/15"
                                >
                                    <BookOpen className="size-5" />
                                    <span className="truncate">{readCtaLabel}</span>
                                </Link>
                                <SaveToLibraryButton
                                    contentId={item.id}
                                    contentTitle={item.title}
                                    className="focus-ring inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:cursor-wait"
                                    loadingClassName="border-border/35 bg-secondary/25 text-muted-foreground/60"
                                    savedClassName="border-primary/35 bg-primary/10 text-primary"
                                    unsavedClassName="border-border/40 bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                                    iconClassName="size-5"
                                />
                                <ShareButton
                                    path={`/preview/${item.id}`}
                                    title={item.title}
                                    text={`Check out "${item.title}" on ${APP_NAME}`}
                                    variant="icon"
                                    source="content_preview"
                                    contentId={item.id}
                                    contentType={item.type}
                                    className="focus-ring h-12 w-12 shrink-0 rounded-xl border border-border/40 bg-secondary/30 p-0 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                                />
                            </div>

                            {onSpinAgain && (
                                <button
                                    type="button"
                                    onClick={onSpinAgain}
                                    disabled={isSpinning}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-secondary/60 text-foreground hover:bg-secondary hover:text-white transition-all border border-border/50 font-medium text-sm"
                                >
                                    <CtaIcon
                                        className={`size-4 ${isSpinning ? "animate-spin" : ""}`}
                                    />
                                    <span>Discover Another</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Quick Mode Content ── */}
                {quickMode ? (
                    <div className="space-y-4">
                        {/* Hook */}
                        {quickMode.hook && (
                            <div className="relative pl-5 py-4 pr-6 rounded-r-xl border-l-[3px] border-primary/50 bg-secondary/30">
                                <div
                                    ref={hookRef}
                                    className={`reading-copy reading-copy-prose reading-copy-soft max-w-none text-base prose prose-sm prose-p:my-0 md:text-lg ${!showFullHook ? "line-clamp-3" : ""}`}
                                >
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeSanitize]}
                                        components={{
                                            p: ({ children }) => <p className="inline">{children}</p>
                                        }}
                                    >
                                        {quickMode.hook}
                                    </ReactMarkdown>
                                </div>
                                {(isTruncated || showFullHook) && (
                                    <button
                                        type="button"
                                        onClick={() => setShowFullHook((value) => !value)}
                                        className="font-medium text-primary hover:underline text-sm mt-2"
                                    >
                                        {showFullHook ? "Read less" : "Read more"}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Key Takeaways */}
                        {activeTakeaways.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em] px-1">
                                    Key Takeaways
                                </h3>
                                <div className="grid gap-3">
                                    {visibleTakeaways.map((takeaway, index) => (
                                        <div
                                            key={index}
                                            className="flex gap-4 p-4 rounded-xl bg-card/40 hover:bg-card/60 border border-border/40 hover:border-border/60 transition-all duration-200"
                                        >
                                            <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold mt-0.5">
                                                {index + 1}
                                            </span>
                                            <div className="reading-copy reading-copy-prose reading-copy-strong max-w-none text-base prose prose-sm">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    rehypePlugins={[rehypeSanitize]}
                                                    components={{
                                                        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>
                                                    }}
                                                >
                                                    {takeaway}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Reveal / Return Control */}
                                {hasHidden && (
                                    <div className="flex flex-col items-center">
                                        {showAllTakeaways ? (
                                            <button
                                                type="button"
                                                onClick={handleBackToTop}
                                                className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground sm:min-h-0"
                                            >
                                                <span>Back to top</span>
                                                <span aria-hidden="true">↑</span>
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllTakeaways(true)}
                                                className="flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground sm:min-h-0"
                                            >
                                                <span>{`Show all ${activeTakeaways.length} takeaways`}</span>
                                                <ChevronDown className="size-4" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center min-h-[200px] bg-card/30 rounded-2xl border border-border/40 p-10 text-center text-muted-foreground">
                        <BookOpen className="size-12 mb-3 opacity-30" />
                        <p className="text-base">
                            Preview content coming soon.
                        </p>
                    </div>
                )}
            </div>

            <div
                data-testid="mobile-preview-action-rail"
                className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex h-20 items-end px-3 safe-area-pb-sm sm:hidden"
            >
                <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background via-background/70 to-transparent" />
                <div className="pointer-events-auto relative mx-auto flex w-full max-w-3xl gap-2 rounded-2xl border border-border/45 bg-background/75 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                    <Link
                        href={readCtaHref}
                        className="focus-ring inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-95"
                    >
                        <BookOpen className="size-4 shrink-0" />
                        <span className="truncate">{readCtaLabel}</span>
                    </Link>

                    <SaveToLibraryButton
                        contentId={item.id}
                        contentTitle={item.title}
                        className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors active:scale-95 disabled:cursor-wait disabled:active:scale-100"
                        loadingClassName="bg-secondary/25 border-border/35 text-muted-foreground/60"
                        savedClassName="bg-secondary/55 border-primary/45 text-primary"
                        unsavedClassName="bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground"
                        iconClassName="size-5"
                    />

                    {/* Mobile Share */}
                    <ShareButton
                        path={`/preview/${item.id}`}
                        title={item.title}
                        text={`Check out "${item.title}" on ${APP_NAME}`}
                        variant="icon"
                        source="content_preview_mobile"
                        contentId={item.id}
                        contentType={item.type}
                        className="focus-ring h-11 w-11 shrink-0 rounded-xl border border-border/40 bg-secondary/30"
                    />

                    {onSpinAgain && (
                        <button
                            type="button"
                            onClick={onSpinAgain}
                            disabled={isSpinning}
                            className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-secondary/30 text-foreground transition-colors active:scale-95"
                        >
                            <CtaIcon
                                className={`size-5 ${isSpinning ? "animate-spin" : ""}`}
                            />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
