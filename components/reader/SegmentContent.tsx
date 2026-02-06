"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    nextSegment?: SegmentFull;
    isDeepMode: boolean;
    onNext?: () => void;
}

export function SegmentContent({
    segment,
    nextSegment,
    isDeepMode,
    onNext,
}: SegmentViewProps) {
    // Scroll to top when segment changes
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, [segment.id]);

    return (
        <article className="min-h-[60vh] flex flex-col animate-in fade-in duration-500">
            {/* Segment Title */}
            {segment.title && (
                <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
                    {segment.title}
                </h2>
            )}

            {/* Markdown Content */}
            <div
                className={cn(
                    "prose prose-lg dark:prose-invert max-w-none flex-1",
                    isDeepMode && "prose-deep",
                    // Custom prose styles
                    "prose-headings:text-foreground prose-headings:font-semibold",
                    "prose-p:text-foreground prose-p:leading-relaxed",
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
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                >
                    {segment.markdown_body}
                </ReactMarkdown>
            </div>

            {/* Next Section Button */}
            {nextSegment ? (
                <div className="mt-16 pt-8 border-t border-dashed">
                    <button
                        onClick={onNext}
                        className="group w-full flex items-center justify-between p-6 rounded-xl bg-card border hover:border-primary/50 hover:bg-accent/50 transition-all text-left shadow-sm hover:shadow-md"
                    >
                        <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
                                Next Part
                            </span>
                            <div className="text-lg font-semibold text-foreground mt-1">
                                {nextSegment.title || "Continue Reading"}
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <ArrowRight className="size-5" />
                        </div>
                    </button>
                </div>
            ) : (
                <div className="mt-16 pt-8 border-t border-dashed text-center">
                    <p className="text-muted-foreground italic">You have reached the end.</p>
                </div>
            )}
        </article>
    );
}
