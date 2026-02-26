"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, BookOpen, Sparkles, ChevronDown, Bookmark, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { ContentItem } from "@/types/database";
import type { QuickMode } from "@/types/domain";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ShareButton } from "@/components/ui/ShareButton";
import { toast } from "sonner";
import { APP_NAME } from "@/lib/brand";

interface ContentPreviewProps {
    item: ContentItem;
    segmentCount?: number | null;
    onSpinAgain?: () => void;
    isSpinning?: boolean;
    ctaIcon?: React.ElementType;
}

export function ContentPreview({
    item,
    segmentCount,
    onSpinAgain,
    isSpinning = false,
    ctaIcon: CtaIcon = Sparkles,
}: ContentPreviewProps) {
    const quickMode = item.quick_mode_json as QuickMode | null;
    const hookRef = useRef<HTMLDivElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);
    const [showAllTakeaways, setShowAllTakeaways] = useState(false);
    const [showFullHook, setShowFullHook] = useState(false);

    // logic for "Save to My List"
    const { isInMyList, toggleMyList } = useReadingProgress();
    const isSaved = isInMyList(item.id);

    useEffect(() => {
        const checkTruncation = () => {
            if (hookRef.current) {
                const { scrollHeight, clientHeight } = hookRef.current;
                setIsTruncated(scrollHeight > clientHeight);
            }
        };

        checkTruncation();
        window.addEventListener("resize", checkTruncation);
        return () => window.removeEventListener("resize", checkTruncation);
    }, [quickMode?.hook]);

    // Filter out empty takeaways
    const activeTakeaways =
        quickMode?.key_takeaways.filter((t) => t && t.trim().length > 0) || [];

    const VISIBLE_COUNT = 3;
    const visibleTakeaways = showAllTakeaways
        ? activeTakeaways
        : activeTakeaways.slice(0, VISIBLE_COUNT);
    const hasHidden = activeTakeaways.length > VISIBLE_COUNT;

    return (
        <div className="min-h-screen bg-background text-foreground pb-10 lg:pb-8">
            {/* Container */}
            <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
                {/* ── Back to Library ── */}
                <div className="mb-8">
                    <Link
                        href="/browse"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground transition-all group"
                    >
                        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span>Back to Library</span>
                    </Link>
                </div>

                {/* ── Hero: Cover + Info ── */}
                <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 mb-6">
                    {/* Cover Image */}
                    {item.cover_image_url && (
                        <div className="flex-shrink-0 w-full sm:w-48 md:w-56">
                            <div className="aspect-[2/3] w-[140px] sm:w-full max-w-[220px] mx-auto sm:max-w-none rounded-2xl overflow-hidden shadow-2xl shadow-black/20 border border-border relative group">
                                <Image
                                    src={item.cover_image_url}
                                    alt={item.title}
                                    fill
                                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                                    sizes="(max-width: 640px) 220px, 224px"
                                    priority
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </div>
                    )}

                    {/* Title, Author & CTA */}
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold font-display text-foreground tracking-tight md:tracking-[-0.02em] leading-[1.15] mb-2">
                            {item.title}
                        </h1>
                        {item.author && (
                            <p className="text-lg text-muted-foreground font-medium mb-4 truncate">
                                {item.author}
                            </p>
                        )}

                        {/* Metadata Pills */}
                        <div className="flex flex-wrap items-center gap-2 mb-6">
                            {item.duration_seconds && (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50">
                                    <Clock className="size-3" />
                                    {Math.round(item.duration_seconds / 60)} min
                                </span>
                            )}
                            <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50 uppercase tracking-wider">
                                {item.type}
                            </span>
                            {segmentCount !== undefined &&
                                segmentCount !== null &&
                                segmentCount > 0 && (
                                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-secondary/60 text-muted-foreground border border-border/50">
                                        {segmentCount} sections
                                    </span>
                                )}
                            <ShareButton
                                url={typeof window !== "undefined" ? `${window.location.origin}/preview/${item.id}` : ""}
                                title={item.title}
                                text={`Check out "${item.title}" on ${APP_NAME}`}
                                variant="icon"
                                className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
                            />
                        </div>

                        {/* CTA Buttons */}
                        <div className="hidden sm:flex flex-col gap-3">
                            <Link
                                href={`/read/${item.id}`}
                                className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-primary text-primary-foreground text-base font-bold hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/15"
                            >
                                <BookOpen className="size-5" />
                                Read
                            </Link>

                            {/* Save to My List Button */}
                            <button
                                onClick={() => {
                                    toggleMyList(item.id);
                                    toast.success(isSaved ? "Removed from My List" : "Added to My List");
                                }}
                                className={`inline-flex h-12 items-center justify-center gap-2.5 rounded-xl border font-bold text-base transition-all hover:scale-[1.02] active:scale-95 ${isSaved
                                    ? "bg-secondary/50 border-primary/50 text-foreground hover:bg-secondary/70"
                                    : "bg-background border-border hover:bg-secondary/30 text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                {isSaved ? (
                                    <>
                                        <Check className="size-5 text-primary" />
                                        <span>Saved to My List</span>
                                    </>
                                ) : (
                                    <>
                                        <Bookmark className="size-5" />
                                        <span>Save to My List</span>
                                    </>
                                )}
                            </button>

                            {onSpinAgain && (
                                <button
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
                    <div className="space-y-5">
                        {/* Hook */}
                        {quickMode.hook && (
                            <div className="relative pl-5 py-4 pr-6 rounded-r-xl border-l-[3px] border-primary/50 bg-secondary/30">
                                <div
                                    ref={hookRef}
                                    className={`text-base md:text-lg text-muted-foreground leading-relaxed prose prose-sm max-w-none prose-p:my-0 prose-p:leading-relaxed ${!showFullHook ? "line-clamp-3" : ""}`}
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
                                {(isTruncated || showFullHook) && !showFullHook && (
                                    <button
                                        onClick={() => setShowFullHook(true)}
                                        className="font-medium text-primary hover:underline text-sm mt-2"
                                    >
                                        Read more
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
                                            <div className="text-base text-foreground leading-relaxed prose prose-sm max-w-none prose-p:my-0">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    rehypePlugins={[rehypeSanitize]}
                                                    components={{
                                                        p: ({ children }) => <p className="m-0">{children}</p>
                                                    }}
                                                >
                                                    {takeaway}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Show All / Show Less Toggle */}
                                {hasHidden && (
                                    <button
                                        onClick={() =>
                                            setShowAllTakeaways(!showAllTakeaways)
                                        }
                                        className="flex items-center gap-1.5 mx-auto text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-full hover:bg-secondary/50"
                                    >
                                        <span>
                                            {showAllTakeaways
                                                ? "Show less"
                                                : `Show all ${activeTakeaways.length} takeaways`}
                                        </span>
                                        <ChevronDown
                                            className={`size-4 transition-transform ${showAllTakeaways ? "rotate-180" : ""}`}
                                        />
                                    </button>
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

            {/* ── Sticky Mobile CTA ── */}
            <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/40 p-3 flex gap-3 safe-area-bottom">
                <Link
                    href={`/read/${item.id}`}
                    className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-secondary text-secondary-foreground font-semibold text-base border border-border/50 hover:bg-secondary/80 transition-all active:scale-95 shadow-sm"
                >
                    <BookOpen className="size-4" />
                    Read
                </Link>

                <button
                    onClick={() => {
                        toggleMyList(item.id);
                        toast.success(isSaved ? "Removed from My List" : "Added to My List");
                    }}
                    className={`h-11 w-11 flex items-center justify-center rounded-xl border transition-all active:scale-95 ${isSaved
                        ? "bg-secondary/60 border-primary/50 text-primary"
                        : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground"
                        }`}
                >
                    {isSaved ? <Check className="size-5" /> : <Bookmark className="size-5" />}
                </button>

                {/* Mobile Share */}
                <ShareButton
                    url={typeof window !== "undefined" ? `${window.location.origin}/preview/${item.id}` : ""}
                    title={item.title}
                    text={`Check out "${item.title}" on ${APP_NAME}`}
                    variant="icon"
                    className="h-11 w-11 rounded-xl border border-border/50 bg-secondary/40"
                />

                {onSpinAgain && (
                    <button
                        onClick={onSpinAgain}
                        disabled={isSpinning}
                        className="h-11 w-11 flex items-center justify-center rounded-xl bg-secondary/40 border border-border/50 text-foreground transition-all active:scale-95"
                    >
                        <CtaIcon
                            className={`size-5 ${isSpinning ? "animate-spin" : ""}`}
                        />
                    </button>
                )}
            </div>
        </div>
    );
}
