"use client";

import { useEffect } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";
import type { SegmentFull } from "@/types/domain";

/**
 * Segment Content
 * 
 * Renders markdown content with sanitization.
 * Integrates with IntersectionObserver for progress tracking.
 */



interface SegmentViewProps {
    segment: SegmentFull;
    prevSegment?: SegmentFull;
    nextSegment?: SegmentFull;
    isDeepMode: boolean;
    onPrev?: () => void;
    onNext?: () => void;
}

export function SegmentContent({
    segment,
    prevSegment,
    nextSegment,
    isDeepMode,
    onPrev,
    onNext,
}: SegmentViewProps) {
    // Scroll to top when segment changes
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, [segment.id]);

    return (
        <article className="min-h-[60vh] flex flex-col animate-fade-in">
            {/* Segment Title */}
            {segment.title && (
                <h2 className="text-3xl md:text-4xl font-bold font-display text-foreground mb-8 tracking-tight md:tracking-[-0.02em] leading-tight">
                    {segment.title}
                </h2>
            )}

            {/* Markdown Content */}
            <div
                className={cn(
                    "prose prose-lg sm:prose-xl md:prose-2xl max-w-none flex-1",
                    isDeepMode && "prose-deep",
                    "prose-headings:text-foreground prose-headings:font-semibold",
                    "prose-p:text-foreground prose-p:leading-relaxed prose-p:text-[1.175rem] prose-p:md:text-[1.35rem]",
                    "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                    "prose-strong:text-foreground",
                    "prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground",
                    "prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
                    "prose-pre:bg-muted prose-pre:border prose-pre:border-border",
                    "prose-ul:text-foreground prose-ol:text-foreground",
                    "prose-li:marker:text-muted-foreground"
                )}
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    rehypePlugins={[rehypeSanitize]}
                >
                    {segment.markdown_body}
                </ReactMarkdown>
            </div>

            {/* Navigation Cards */}
            <div className="mt-16 space-y-4">
                {/* Next Section Button */}
                {nextSegment ? (
                    <button
                        onClick={onNext}
                        className="group w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/50 hover:bg-accent/30 transition-all text-left shadow-sm hover:shadow-md"
                    >
                        <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors block mb-1">
                                Next Part
                            </span>
                            <div className="text-base md:text-lg font-semibold font-display text-foreground line-clamp-1">
                                {nextSegment.title || "Continue Reading"}
                            </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <ArrowRight className="size-4" />
                        </div>
                    </button>
                ) : (
                    <div className="p-6 rounded-xl bg-secondary/20 border border-dashed border-border text-center">
                        <p className="text-sm text-muted-foreground font-medium">You have reached the end of this book.</p>
                    </div>
                )}

                {/* Previous Section Button - Card Style (Mirrored) */}
                {prevSegment && (
                    <button
                        onClick={onPrev}
                        className="group w-full flex items-center justify-between p-4 rounded-xl bg-card border hover:border-primary/50 hover:bg-accent/30 transition-all text-right shadow-sm hover:shadow-md"
                    >
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors order-first">
                            <ArrowLeft className="size-4" />
                        </div>
                        <div className="flex-1 ml-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors block mb-1">
                                Previous Part
                            </span>
                            <div className="text-base md:text-lg font-semibold font-display text-foreground line-clamp-1">
                                {prevSegment.title}
                            </div>
                        </div>
                    </button>
                )}
            </div>
        </article>
    );
}
