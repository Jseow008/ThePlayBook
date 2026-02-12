"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";
import type { SegmentFull } from "@/types/domain";

/**
 * Segment Accordion
 *
 * Renders all segments as an interactive accordion list.
 * One segment can be expanded at a time — opening one collapses the previous.
 * Expanded content is truncated by default with a "Read More" option.
 */

const TRUNCATION_LENGTH = 200;

interface SegmentAccordionProps {
    segments: SegmentFull[];
    completedSegments: Set<string>;
    onSegmentOpen: (segmentId: string, index: number) => void;
}

export function SegmentAccordion({
    segments,
    completedSegments,
    onSegmentOpen,
}: SegmentAccordionProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [fullyExpanded, setFullyExpanded] = useState<Set<string>>(new Set());
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    const handleToggle = useCallback(
        (segment: SegmentFull, index: number) => {
            const isOpening = expandedId !== segment.id;
            setExpandedId(isOpening ? segment.id : null);

            if (isOpening) {
                onSegmentOpen(segment.id, index);
                // Scroll into view after the expand animation starts
                requestAnimationFrame(() => {
                    const el = itemRefs.current.get(segment.id);
                    if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                });
            }
        },
        [expandedId, onSegmentOpen]
    );

    const handleReadMore = useCallback((segmentId: string) => {
        setFullyExpanded((prev) => {
            const next = new Set(prev);
            next.add(segmentId);
            return next;
        });
    }, []);

    return (
        <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4 px-1">
                Sections
            </h3>
            {segments.map((segment, index) => {
                const isExpanded = expandedId === segment.id;
                const isFullyExpanded = fullyExpanded.has(segment.id);
                const isCompleted = completedSegments.has(segment.id);
                const needsTruncation =
                    segment.markdown_body.length > TRUNCATION_LENGTH;

                return (
                    <div
                        key={segment.id}
                        ref={(el) => {
                            if (el) itemRefs.current.set(segment.id, el);
                        }}
                        className="scroll-mt-24"
                    >
                        {/* Accordion Header */}
                        <button
                            onClick={() => handleToggle(segment, index)}
                            className={cn(
                                "w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left",
                                "hover:bg-accent/40",
                                isExpanded
                                    ? "bg-accent/50 border border-border"
                                    : "bg-card/60 border border-transparent hover:border-border"
                            )}
                            aria-expanded={isExpanded}
                        >
                            {/* Number Badge */}
                            <span
                                className={cn(
                                    "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold transition-colors",
                                    isCompleted
                                        ? "bg-green-500/15 text-green-400"
                                        : isExpanded
                                            ? "bg-primary/20 text-primary"
                                            : "bg-muted text-muted-foreground"
                                )}
                            >
                                {isCompleted ? (
                                    <CheckCircle2 className="size-4.5" />
                                ) : (
                                    index + 1
                                )}
                            </span>

                            {/* Title */}
                            <span
                                className={cn(
                                    "flex-1 font-medium text-[0.95rem] leading-snug transition-colors",
                                    isExpanded
                                        ? "text-foreground"
                                        : "text-foreground/80"
                                )}
                            >
                                {segment.title || `Section ${index + 1}`}
                            </span>

                            {/* Chevron */}
                            <ChevronRight
                                className={cn(
                                    "size-4 text-muted-foreground transition-transform duration-300 flex-shrink-0",
                                    isExpanded && "rotate-90"
                                )}
                            />
                        </button>

                        {/* Accordion Content */}
                        <div
                            className={cn(
                                "grid transition-all duration-300 ease-in-out",
                                isExpanded
                                    ? "grid-rows-[1fr] opacity-100"
                                    : "grid-rows-[0fr] opacity-0"
                            )}
                        >
                            <div className="overflow-hidden">
                                <div className="px-4 pt-3 pb-5 ml-[3.25rem]">
                                    {/* Markdown Content */}
                                    <div
                                        className={cn(
                                            "prose prose-sm dark:prose-invert max-w-none relative",
                                            "prose-headings:text-foreground prose-headings:font-semibold prose-headings:text-base",
                                            "prose-p:text-foreground/85 prose-p:leading-relaxed prose-p:text-[0.925rem]",
                                            "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                                            "prose-strong:text-foreground",
                                            "prose-blockquote:border-l-primary/40 prose-blockquote:text-muted-foreground prose-blockquote:text-sm",
                                            "prose-ul:text-foreground/85 prose-ol:text-foreground/85",
                                            "prose-li:text-[0.925rem] prose-li:marker:text-muted-foreground",
                                            !isFullyExpanded &&
                                            needsTruncation &&
                                            "max-h-[6.5rem] overflow-hidden"
                                        )}
                                    >
                                        {/* Fade-out gradient for truncated content */}
                                        {!isFullyExpanded && needsTruncation && (
                                            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
                                        )}
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeSanitize]}
                                        >
                                            {segment.markdown_body}
                                        </ReactMarkdown>
                                    </div>

                                    {/* Read More Button */}
                                    {needsTruncation && !isFullyExpanded && (
                                        <button
                                            onClick={() =>
                                                handleReadMore(segment.id)
                                            }
                                            className="mt-3 text-sm font-medium text-primary hover:text-primary/80 transition-colors inline-flex items-center gap-1"
                                        >
                                            Read more
                                            <ChevronRight className="size-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
