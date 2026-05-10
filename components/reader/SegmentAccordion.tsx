"use client";

import { useState, useRef, useCallback, useEffect, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "@/lib/utils";
import type { SegmentFull } from "@/types/domain";
import type { HighlightWithContent } from "@/hooks/useHighlights";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { HIGHLIGHT_COLOR_CLASSES, normalizeHighlightColor } from "@/lib/highlight-utils";

interface HighlightPosition {
    top: number;
    left: number;
    width: number;
    height: number;
}

interface HighlightRenderRange {
    id: string;
    start: number;
    end: number;
    color: ReturnType<typeof normalizeHighlightColor>;
}

function createMarkHtml(id: string, text: string, color: string, interactive: boolean) {
    const bgClass = HIGHLIGHT_COLOR_CLASSES[normalizeHighlightColor(color)].bg;
    const cursorClass = interactive ? "cursor-pointer" : "cursor-text";

    return `<mark class="${bgClass} text-inherit rounded-sm -mx-0.5 px-0.5 ${cursorClass} transition-colors" data-id="${id}">${text}</mark>`;
}

function applyLegacyHighlightsToTextNode(
    text: string,
    highlights: HighlightWithContent[],
    interactive: boolean
): any[] {
    if (!text) return [];

    const sorted = [...highlights]
        .filter((highlight) => highlight.highlighted_text.trim().length > 0)
        .sort((a, b) => b.highlighted_text.length - a.highlighted_text.length);

    for (const highlight of sorted) {
        const matchText = highlight.highlighted_text;
        const idx = text.indexOf(matchText);

        if (idx === -1) continue;

        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + matchText.length);
        const after = text.slice(idx + matchText.length);
        const newNodes: any[] = [];

        if (before) {
            newNodes.push(...applyLegacyHighlightsToTextNode(before, highlights, interactive));
        }

        newNodes.push({
            type: "html",
            value: createMarkHtml(highlight.id, match, highlight.color || "yellow", interactive),
        });

        if (after) {
            newNodes.push(...applyLegacyHighlightsToTextNode(after, highlights, interactive));
        }

        return newNodes;
    }

    return [{ type: "text", value: text }];
}

function applyAnchorHighlightsToTextNode(
    text: string,
    nodeStart: number,
    ranges: HighlightRenderRange[],
    interactive: boolean
): any[] {
    if (!text) return [];

    const nodeEnd = nodeStart + text.length;
    const overlapping = ranges.filter((range) => range.end > nodeStart && range.start < nodeEnd);

    if (overlapping.length === 0) {
        return [{ type: "text", value: text }];
    }

    const boundaries = new Set<number>([0, text.length]);

    overlapping.forEach((range) => {
        boundaries.add(Math.max(0, range.start - nodeStart));
        boundaries.add(Math.min(text.length, range.end - nodeStart));
    });

    const sortedBoundaries = [...boundaries].sort((a, b) => a - b);
    const newNodes: any[] = [];

    for (let i = 0; i < sortedBoundaries.length - 1; i += 1) {
        const sliceStart = sortedBoundaries[i];
        const sliceEnd = sortedBoundaries[i + 1];

        if (sliceEnd <= sliceStart) continue;

        const sliceText = text.slice(sliceStart, sliceEnd);
        const absoluteStart = nodeStart + sliceStart;
        const absoluteEnd = nodeStart + sliceEnd;
        const activeRange = overlapping.find(
            (range) => range.start <= absoluteStart && range.end >= absoluteEnd
        );

        if (!activeRange) {
            newNodes.push({ type: "text", value: sliceText });
            continue;
        }

        newNodes.push({
            type: "html",
            value: createMarkHtml(activeRange.id, sliceText, activeRange.color, interactive),
        });
    }

    return newNodes;
}

function wrapTextNodesWithHighlights(
    node: any,
    anchorRanges: HighlightRenderRange[],
    legacyHighlights: HighlightWithContent[],
    offsetRef: { value: number },
    interactive: boolean
) {
    if (!node.children) return;

    const newChildren: any[] = [];

    for (const child of node.children) {
        if (child.type === "text") {
            const nodeStart = offsetRef.value;
            const textValue = child.value ?? "";
            offsetRef.value += textValue.length;

            const anchorNodes = applyAnchorHighlightsToTextNode(
                textValue,
                nodeStart,
                anchorRanges,
                interactive
            );

            anchorNodes.forEach((anchorNode) => {
                if (anchorNode.type === "text" && legacyHighlights.length > 0) {
                    newChildren.push(
                        ...applyLegacyHighlightsToTextNode(anchorNode.value, legacyHighlights, interactive)
                    );
                } else {
                    newChildren.push(anchorNode);
                }
            });

            continue;
        }

        wrapTextNodesWithHighlights(child, anchorRanges, legacyHighlights, offsetRef, interactive);
        newChildren.push(child);
    }

    node.children = newChildren;
}

function createRemarkHighlightPlugin(highlights: HighlightWithContent[], interactive: boolean = true) {
    const anchorRanges = highlights
        .filter(
            (highlight) =>
                typeof highlight.anchor_start === "number"
                && typeof highlight.anchor_end === "number"
                && highlight.anchor_end > highlight.anchor_start
        )
        .map((highlight) => ({
            id: highlight.id,
            start: highlight.anchor_start as number,
            end: highlight.anchor_end as number,
            color: normalizeHighlightColor(highlight.color),
        }))
        .sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            return (b.end - b.start) - (a.end - a.start);
        });

    const legacyHighlights = highlights.filter(
        (highlight) =>
            typeof highlight.anchor_start !== "number"
            || typeof highlight.anchor_end !== "number"
            || highlight.anchor_end <= highlight.anchor_start
    );

    return () => (tree: any) => {
        if (anchorRanges.length === 0 && legacyHighlights.length === 0) return;

        wrapTextNodesWithHighlights(
            tree,
            anchorRanges,
            legacyHighlights,
            { value: 0 },
            interactive
        );
    };
}

const HIGHLIGHT_SANITIZE_SCHEMA = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "mark"],
    attributes: {
        ...defaultSchema.attributes,
        mark: [
            ...((defaultSchema.attributes && "mark" in defaultSchema.attributes
                ? defaultSchema.attributes.mark
                : []) || []),
            "className",
            "dataId",
            "data-id",
        ],
    },
};

interface SegmentAccordionProps {
    segments: SegmentFull[];
    completedSegments: Set<string>;
    onSegmentOpen: (segmentId: string, index: number) => void;
    onSegmentComplete?: (segmentId: string, index: number) => void;
    onFinishReading?: () => void;
    highlights?: HighlightWithContent[];
    onHighlightActivate?: (highlightId: string, position: HighlightPosition) => void;
    expandedSegmentId?: string | null;
    onExpandedSegmentChange?: (segmentId: string | null) => void;
    scrollRequest?: {
        segmentId: string;
        initialScrollY: number;
        requestId: number;
    } | null;
    activeNarratedSegmentId?: string | null;
}

export function SegmentAccordion({
    segments,
    completedSegments,
    onSegmentOpen,
    onSegmentComplete,
    onFinishReading,
    highlights = [],
    onHighlightActivate,
    expandedSegmentId,
    onExpandedSegmentChange,
    scrollRequest = null,
    activeNarratedSegmentId = null,
}: SegmentAccordionProps) {
    const [uncontrolledExpandedId, setUncontrolledExpandedId] = useState<string | null>(null);
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const contentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pendingScrollCleanupRef = useRef<(() => void) | null>(null);
    const lastProcessedScrollRequestRef = useRef<string | null>(null);
    const { fontSize, fontFamily, lineHeight } = useReaderSettings();
    const isDesktop = useMediaQuery("(min-width: 640px)");
    const currentExpandedId = expandedSegmentId !== undefined ? expandedSegmentId : uncontrolledExpandedId;
    const isContentCompleted = segments.length > 0 && segments.every((segment) => completedSegments.has(segment.id));
    const scrollRequestSegmentId = scrollRequest?.segmentId;
    const scrollRequestInitialY = scrollRequest?.initialScrollY;
    const scrollRequestId = scrollRequest?.requestId;

    const setExpandedId = useCallback((nextSegmentId: string | null) => {
        onExpandedSegmentChange?.(nextSegmentId);

        if (expandedSegmentId === undefined) {
            setUncontrolledExpandedId(nextSegmentId);
        }
    }, [expandedSegmentId, onExpandedSegmentChange]);

    const cancelPendingScroll = useCallback(() => {
        pendingScrollCleanupRef.current?.();
        pendingScrollCleanupRef.current = null;
    }, []);

    const scrollSegmentIntoView = useCallback((segmentId: string, initialScrollY: number) => {
        if (Math.abs(window.scrollY - initialScrollY) > 50) return;

        const el = itemRefs.current.get(segmentId);
        if (!el) return;

        const y = el.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: y, behavior: "smooth" });
    }, []);

    const scheduleScrollAfterExpansion = useCallback((segmentId: string, initialScrollY: number) => {
        cancelPendingScroll();

        const contentEl = contentRefs.current.get(segmentId);
        if (!contentEl) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => scrollSegmentIntoView(segmentId, initialScrollY));
            });
            return;
        }

        let didScroll = false;
        let fallbackTimeoutId: number | null = null;

        function handleTransitionEnd(event: TransitionEvent) {
            if (event.target !== event.currentTarget) return;
            runScroll();
        }

        const runScroll = () => {
            if (didScroll) return;
            didScroll = true;
            if (fallbackTimeoutId !== null) {
                window.clearTimeout(fallbackTimeoutId);
                fallbackTimeoutId = null;
            }
            contentEl.removeEventListener("transitionend", handleTransitionEnd);
            pendingScrollCleanupRef.current = null;
            scrollSegmentIntoView(segmentId, initialScrollY);
        };

        contentEl.addEventListener("transitionend", handleTransitionEnd);
        fallbackTimeoutId = window.setTimeout(runScroll, 400);

        pendingScrollCleanupRef.current = () => {
            didScroll = true;
            if (fallbackTimeoutId !== null) {
                window.clearTimeout(fallbackTimeoutId);
            }
            contentEl.removeEventListener("transitionend", handleTransitionEnd);
        };
    }, [cancelPendingScroll, scrollSegmentIntoView]);

    const handleToggle = useCallback(
        (segment: SegmentFull, index: number) => {
            const isOpening = currentExpandedId !== segment.id;

            if (isOpening) {
                setExpandedId(segment.id);
                onSegmentOpen(segment.id, index);

                const initialScrollY = window.scrollY;
                scheduleScrollAfterExpansion(segment.id, initialScrollY);
                return;
            }

            cancelPendingScroll();
            setExpandedId(null);
        },
        [cancelPendingScroll, currentExpandedId, onSegmentOpen, scheduleScrollAfterExpansion, setExpandedId]
    );

    useEffect(() => {
        if (!scrollRequestSegmentId || currentExpandedId !== scrollRequestSegmentId) {
            return;
        }

        const requestKey = `${scrollRequestSegmentId}:${scrollRequestId}`;
        if (requestKey === lastProcessedScrollRequestRef.current) {
            return;
        }

        lastProcessedScrollRequestRef.current = requestKey;
        scheduleScrollAfterExpansion(scrollRequestSegmentId, scrollRequestInitialY ?? 0);
    }, [
        currentExpandedId,
        scheduleScrollAfterExpansion,
        scrollRequestId,
        scrollRequestInitialY,
        scrollRequestSegmentId,
    ]);

    useEffect(() => {
        return () => {
            cancelPendingScroll();
        };
    }, [cancelPendingScroll]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (segments.length === 0) {
                return;
            }

            if (e.key === "ArrowRight") {
                e.preventDefault();
                if (!currentExpandedId) {
                    handleToggle(segments[0], 0);
                    return;
                }

                const currentIndex = segments.findIndex((segment) => segment.id === currentExpandedId);
                if (currentIndex !== -1 && currentIndex < segments.length - 1) {
                    handleToggle(segments[currentIndex + 1], currentIndex + 1);
                }
                return;
            }

            if (e.key === "ArrowLeft") {
                e.preventDefault();
                const currentIndex = segments.findIndex((segment) => segment.id === currentExpandedId);
                if (currentIndex > 0) {
                    handleToggle(segments[currentIndex - 1], currentIndex - 1);
                } else if (currentIndex === 0) {
                    handleToggle(segments[0], 0);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentExpandedId, segments, handleToggle]);

    const activateHighlight = useCallback(
        (event: ReactMouseEvent<HTMLElement>) => {
            const target = (event.target as HTMLElement).closest("mark[data-id]");
            const highlightId = target?.getAttribute("data-id");

            if (!target || !highlightId || !onHighlightActivate) {
                return;
            }

            if (!isDesktop && event.type === "click") {
                event.preventDefault();
                event.stopPropagation();
            }

            const rect = target.getBoundingClientRect();
            onHighlightActivate(highlightId, {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            });
        },
        [isDesktop, onHighlightActivate]
    );

    return (
        <div className="space-y-2">
            <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4 px-1">
                Sections
            </h3>
            {segments.map((segment, index) => {
                const isExpanded = currentExpandedId === segment.id;
                const isCompleted = completedSegments.has(segment.id);
                const isLastSegment = index === segments.length - 1;
                const isAudioActive = activeNarratedSegmentId === segment.id;
                const segmentHighlights = highlights.filter((highlight) => highlight.segment_id === segment.id);
                const remarkPlugins: any[] = [remarkGfm, remarkBreaks];

                if (segmentHighlights.length > 0) {
                    remarkPlugins.push(createRemarkHighlightPlugin(segmentHighlights, true));
                }

                return (
                    <div
                        key={segment.id}
                        data-reader-segment-id={segment.id}
                        ref={(el) => {
                            if (el) itemRefs.current.set(segment.id, el);
                        }}
                        className="scroll-mt-24"
                    >
                        <button
                            onClick={() => handleToggle(segment, index)}
                            className={cn(
                                "focus-ring w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left",
                                "md:hover:bg-accent/40 active:scale-[0.99] active:bg-accent/60",
                                isExpanded
                                    ? "bg-accent/50 border border-border"
                                    : "bg-card/60 border border-transparent md:hover:border-border",
                                isAudioActive && !isExpanded && "border-primary/40 bg-primary/[0.07] ring-1 ring-primary/15 shadow-[0_10px_30px_-24px_rgba(99,102,241,0.55)] md:hover:bg-primary/[0.09]",
                                isAudioActive && isExpanded && "border-primary/40 bg-primary/[0.1] ring-1 ring-primary/20 shadow-[0_12px_32px_-22px_rgba(99,102,241,0.55)]"
                            )}
                            aria-expanded={isExpanded}
                            aria-current={isAudioActive ? "step" : undefined}
                        >
                            <span
                                className={cn(
                                    "flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold transition-all",
                                    isCompleted
                                        ? "bg-green-500/15 text-green-400"
                                        : isExpanded
                                            ? "bg-primary/20 text-primary"
                                            : "bg-muted text-muted-foreground",
                                    isAudioActive && !isCompleted && "bg-primary/18 text-primary ring-2 ring-primary/30 shadow-[0_0_0_1px_rgba(99,102,241,0.08)]"
                                )}
                            >
                                {isCompleted ? (
                                    <CheckCircle2 className="size-4.5" />
                                ) : (
                                    (index + 1).toString().padStart(2, "0")
                                )}
                            </span>

                            <div
                                className={cn(
                                    "flex items-center gap-3 md:gap-4 flex-1 text-left",
                                    isExpanded ? "text-primary" : "text-muted-foreground"
                                )}
                            >
                                <div className="flex flex-col gap-0.5">
                                    <h3 className="font-semibold text-base sm:text-lg leading-snug">
                                        {segment.title || `Segment ${index + 1}`}
                                    </h3>

                                    <div className="text-xs text-muted-foreground opacity-80 flex items-center gap-2">
                                        {isAudioActive && (
                                            <>
                                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                                                    <span className="relative flex size-1.5">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 opacity-75"></span>
                                                        <span className="relative inline-flex size-1.5 rounded-full bg-primary"></span>
                                                    </span>
                                                    Playing now
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <ChevronRight
                                className={cn(
                                    "size-4 text-muted-foreground transition-transform duration-300 flex-shrink-0",
                                    isExpanded && "rotate-90"
                                )}
                            />
                        </button>

                        <div
                            ref={(el) => {
                                if (el) {
                                    contentRefs.current.set(segment.id, el);
                                } else {
                                    contentRefs.current.delete(segment.id);
                                }
                            }}
                            className={cn(
                                "grid transition-all duration-300 ease-in-out",
                                isExpanded
                                    ? "grid-rows-[1fr] opacity-100"
                                    : "grid-rows-[0fr] opacity-0"
                            )}
                        >
                            <div className="overflow-hidden">
                                <div className="px-4 pt-3 pb-5 ml-[3.25rem]">
                                        <div
                                            data-segment-id={segment.id}
                                            onMouseMove={isDesktop ? activateHighlight : undefined}
                                            onClick={activateHighlight}
                                            className={cn(
                                            "reading-copy reading-copy-prose reading-copy-strong prose max-w-none relative transition-all duration-300",
                                            `reader-size-${fontSize}`,
                                            `reader-font-${fontFamily}`,
                                            `reader-spacing-${lineHeight}`,
                                            "prose-headings:text-foreground prose-headings:font-semibold prose-headings:text-base",
                                            "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                                            "prose-strong:text-foreground",
                                            "prose-blockquote:border-l-primary/40 prose-blockquote:text-muted-foreground prose-blockquote:text-sm md:prose-blockquote:text-base",
                                            "prose-li:marker:text-muted-foreground"
                                        )}
                                    >
                                        <ReactMarkdown
                                            remarkPlugins={remarkPlugins as any}
                                            rehypePlugins={[rehypeRaw, [rehypeSanitize, HIGHLIGHT_SANITIZE_SCHEMA]]}
                                        >
                                            {segment.markdown_body}
                                        </ReactMarkdown>
                                    </div>

                                    <div className="mt-8 flex justify-center">
                                        <button
                                            onClick={() => {
                                                if (isLastSegment) {
                                                    if (!isContentCompleted) {
                                                        onFinishReading?.();
                                                    }

                                                    setExpandedId(null);
                                                    return;
                                                }

                                                if (onSegmentComplete) {
                                                    onSegmentComplete(segment.id, index);
                                                }

                                                const nextSegment = segments[index + 1];
                                                handleToggle(nextSegment, index + 1);
                                            }}
                                            className={cn(
                                                "focus-ring inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                                                !isLastSegment
                                                    ? "border-border/70 bg-background/60 text-foreground/90 hover:border-primary/30 hover:bg-accent/35 hover:text-foreground"
                                                    : isContentCompleted
                                                    ? "border-border/65 bg-background/55 text-muted-foreground hover:border-border hover:bg-accent/25 hover:text-foreground"
                                                    : "border-border/70 bg-background/60 text-foreground/90 hover:border-primary/30 hover:bg-accent/35 hover:text-foreground"
                                            )}
                                        >
                                            {!isLastSegment ? (
                                                <>
                                                    <span>Mark complete and continue</span>
                                                </>
                                            ) : isContentCompleted ? (
                                                <>
                                                    <span>Close section</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 className="size-4" />
                                                    Finish Reading
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
