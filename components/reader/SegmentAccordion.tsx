"use client";

import { memo, useMemo, useState, useRef, useCallback, useEffect, type MouseEvent as ReactMouseEvent } from "react";
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
import { VIEWPORT_QUERIES } from "@/lib/breakpoints";
import { HIGHLIGHT_COLOR_CLASSES, normalizeHighlightColor } from "@/lib/highlight-utils";
import { resolveHighlightAnchor } from "@/lib/highlight-anchoring";

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

function collectHighlightableText(node: any): string {
    if (!node.children) return "";

    return node.children.reduce((text: string, child: any) => {
        if (child.type === "text") {
            return text + (child.value ?? "");
        }

        return text + collectHighlightableText(child);
    }, "");
}

function createMarkNode(id: string, text: string, color: string, interactive: boolean) {
    const bgClass = HIGHLIGHT_COLOR_CLASSES[normalizeHighlightColor(color)].bg;
    const cursorClass = interactive ? "cursor-pointer" : "cursor-text";

    return {
        type: "element",
        tagName: "mark",
        properties: {
            className: `${bgClass} text-inherit rounded-sm -mx-0.5 px-0.5 ${cursorClass} transition-colors`.split(" "),
            "data-id": id,
            ...(interactive ? { tabIndex: -1 } : {}),
        },
        children: [{ type: "text", value: text }],
    };
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

        newNodes.push(createMarkNode(activeRange.id, sliceText, activeRange.color, interactive));
    }

    return newNodes;
}

function wrapTextNodesWithHighlights(
    node: any,
    anchorRanges: HighlightRenderRange[],
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

            newChildren.push(...anchorNodes);

            continue;
        }

        wrapTextNodesWithHighlights(child, anchorRanges, offsetRef, interactive);
        newChildren.push(child);
    }

    node.children = newChildren;
}

function createRehypeHighlightPlugin(highlights: HighlightWithContent[], interactive: boolean = true) {
    return () => (tree: any) => {
        if (highlights.length === 0) return;

        // Resolve against sanitized rendered text, including Markdown block separators,
        // so positions use the same text coordinates as getTrimmedSelection's DOM Range.
        // This tree contains only the saved section; never rewrite the saved record.
        const canonicalText = collectHighlightableText(tree);
        const anchorRanges: HighlightRenderRange[] = highlights.flatMap((highlight) => {
            const anchor = resolveHighlightAnchor(canonicalText, highlight);
            return anchor ? [{ ...anchor, id: highlight.id, color: normalizeHighlightColor(highlight.color) }] : [];
        }).sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            return (b.end - b.start) - (a.end - a.start);
        });

        wrapTextNodesWithHighlights(tree, anchorRanges, { value: 0 }, interactive);
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

const REHYPE_PLUGINS: NonNullable<React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]> = [
    rehypeRaw, [rehypeSanitize, HIGHLIGHT_SANITIZE_SCHEMA],
];

const SegmentMarkdown = memo(function SegmentMarkdown({ body, segmentId, highlights }: {
    body: string;
    segmentId: string;
    highlights: HighlightWithContent[];
}) {
    const rehypePlugins = useMemo(() => {
        const matching = highlights.filter((highlight) => highlight.segment_id === segmentId);
        return matching.length > 0
            ? [...REHYPE_PLUGINS, createRehypeHighlightPlugin(matching, true)]
            : REHYPE_PLUGINS;
    }, [highlights, segmentId]);
    return <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={rehypePlugins}>{body}</ReactMarkdown>;
});

function LazySegmentMarkdown(props: React.ComponentProps<typeof SegmentMarkdown> & { expanded: boolean }) {
    const [hasExpanded, setHasExpanded] = useState(props.expanded);
    if (props.expanded && !hasExpanded) setHasExpanded(true);
    // Keep visited text mounted so collapse animation and highlight anchors survive.
    if (!hasExpanded && !props.expanded) return null;
    return <SegmentMarkdown body={props.body} segmentId={props.segmentId} highlights={props.highlights} />;
}

interface SegmentAccordionProps {
    segments: SegmentFull[];
    completedSegments: Set<string>;
    onSegmentOpen: (segmentId: string, index: number) => void;
    onSegmentComplete?: (segmentId: string, index: number) => void;
    onSegmentIncomplete?: (segmentId: string, index: number) => void;
    onFinishReading?: () => void;
    highlights?: HighlightWithContent[];
    onHighlightActivate?: (highlightId: string, position: HighlightPosition, trigger: HTMLElement) => void;
    onHighlightPreview?: (highlightId: string, position: HighlightPosition) => void;
    onHighlightPreviewEnd?: () => void;
    expandedSegmentId?: string | null;
    onExpandedSegmentChange?: (segmentId: string | null) => void;
    scrollRequest?: {
        segmentId: string;
        initialScrollY: number;
        requestId: number;
        focusAfterScroll?: boolean;
    } | null;
    activeNarratedSegmentId?: string | null;
}

export function SegmentAccordion({
    segments,
    completedSegments,
    onSegmentOpen,
    onSegmentComplete,
    onSegmentIncomplete,
    onFinishReading,
    highlights = [],
    onHighlightActivate,
    onHighlightPreview,
    onHighlightPreviewEnd,
    expandedSegmentId,
    onExpandedSegmentChange,
    scrollRequest = null,
    activeNarratedSegmentId = null,
}: SegmentAccordionProps) {
    const [uncontrolledExpandedId, setUncontrolledExpandedId] = useState<string | null>(null);
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const contentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const hoveredHighlightIdRef = useRef<string | null>(null);
    const pendingScrollCleanupRef = useRef<(() => void) | null>(null);
    const lastProcessedScrollRequestRef = useRef<string | null>(null);
    const hadScrollRequestRef = useRef(false);
    const { fontSize, fontFamily, lineHeight } = useReaderSettings();
    const isReaderInteractionDesktop = useMediaQuery(VIEWPORT_QUERIES.readerInteractionDesktop);
    const currentExpandedId = expandedSegmentId !== undefined ? expandedSegmentId : uncontrolledExpandedId;
    const currentExpandedIdRef = useRef(currentExpandedId);
    const isContentCompleted = segments.length > 0 && segments.every((segment) => completedSegments.has(segment.id));
    const scrollRequestSegmentId = scrollRequest?.segmentId;
    const scrollRequestInitialY = scrollRequest?.initialScrollY;
    const scrollRequestId = scrollRequest?.requestId;
    const scrollRequestFocusAfterScroll = scrollRequest?.focusAfterScroll;

    useEffect(() => {
        currentExpandedIdRef.current = currentExpandedId;
    }, [currentExpandedId]);

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
        if (currentExpandedIdRef.current !== segmentId) return false;
        if (Math.abs(window.scrollY - initialScrollY) > 50) return false;

        const el = itemRefs.current.get(segmentId);
        if (!el) return false;

        const y = el.getBoundingClientRect().top + window.scrollY - 100;
        window.scrollTo({ top: y, behavior: "smooth" });
        return true;
    }, []);

    const scheduleScrollAfterExpansion = useCallback((segmentId: string, initialScrollY: number, options?: { focusAfterScroll?: boolean }) => {
        cancelPendingScroll();

        const contentEl = contentRefs.current.get(segmentId);
        if (!contentEl) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const didScroll = scrollSegmentIntoView(segmentId, initialScrollY);
                    if (didScroll && options?.focusAfterScroll) {
                        itemRefs.current.get(segmentId)?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
                    }
                });
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
            const didScrollIntoView = scrollSegmentIntoView(segmentId, initialScrollY);
            if (didScrollIntoView && options?.focusAfterScroll) {
                itemRefs.current.get(segmentId)?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
            }
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
        if (!scrollRequestSegmentId) {
            if (hadScrollRequestRef.current) {
                cancelPendingScroll();
            }
            hadScrollRequestRef.current = false;
            lastProcessedScrollRequestRef.current = null;
            return;
        }

        hadScrollRequestRef.current = true;

        if (currentExpandedId !== scrollRequestSegmentId) {
            return;
        }

        const requestKey = `${scrollRequestSegmentId}:${scrollRequestId}`;
        if (requestKey === lastProcessedScrollRequestRef.current) {
            return;
        }

        lastProcessedScrollRequestRef.current = requestKey;
        scheduleScrollAfterExpansion(scrollRequestSegmentId, scrollRequestInitialY ?? 0, {
            focusAfterScroll: scrollRequestFocusAfterScroll,
        });
    }, [
        cancelPendingScroll,
        currentExpandedId,
        scheduleScrollAfterExpansion,
        scrollRequestFocusAfterScroll,
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
            const target = (event.target as HTMLElement).closest<HTMLElement>("mark[data-id]");
            const highlightId = target?.getAttribute("data-id");

            if (!target || !highlightId || !onHighlightActivate) {
                return;
            }

            if (event.type === "click") {
                event.preventDefault();
                // A hover preview may already have an outside-click listener.
                // Do not let this activation click immediately close its editor.
                event.stopPropagation();
            }

            const rect = target.getBoundingClientRect();
            onHighlightActivate(highlightId, {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            }, target);
        },
        [onHighlightActivate]
    );

    const previewHighlight = useCallback(
        (event: ReactMouseEvent<HTMLElement>) => {
            const target = (event.target as HTMLElement).closest("mark[data-id]");
            const highlightId = target?.getAttribute("data-id");

            if (!target || !highlightId || !onHighlightPreview) {
                if (hoveredHighlightIdRef.current) {
                    hoveredHighlightIdRef.current = null;
                    onHighlightPreviewEnd?.();
                }
                return;
            }

            if (hoveredHighlightIdRef.current === highlightId) return;

            hoveredHighlightIdRef.current = highlightId;
            const rect = target.getBoundingClientRect();
            onHighlightPreview(highlightId, {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
            });
        },
        [onHighlightPreview, onHighlightPreviewEnd]
    );

    const endHighlightPreview = useCallback(() => {
        if (!hoveredHighlightIdRef.current) return;
        hoveredHighlightIdRef.current = null;
        onHighlightPreviewEnd?.();
    }, [onHighlightPreviewEnd]);

    return (
        <div className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4 px-1">
                Sections
            </h2>
            {segments.map((segment, index) => {
                const isExpanded = currentExpandedId === segment.id;
                const isCompleted = completedSegments.has(segment.id);
                const isLastSegment = index === segments.length - 1;
                const isAudioActive = activeNarratedSegmentId === segment.id;
                const incompleteAction = isCompleted && onSegmentIncomplete ? (
                    <button
                        type="button"
                        onClick={() => onSegmentIncomplete(segment.id, index)}
                        className="focus-ring inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:text-foreground active:bg-accent/60 active:text-foreground sm:min-h-0"
                    >
                        Mark incomplete
                    </button>
                ) : null;
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
                            data-reader-segment-panel="true"
                            aria-hidden={!isExpanded}
                            inert={!isExpanded}
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
                                            onMouseMove={isReaderInteractionDesktop ? previewHighlight : undefined}
                                            onMouseLeave={isReaderInteractionDesktop ? endHighlightPreview : undefined}
                                            onClick={activateHighlight}
                                            className={cn(
                                            "reading-copy reading-copy-prose reading-copy-strong prose max-w-none relative -ml-[3.25rem] w-[calc(100%_+_3.25rem)] transition-all duration-300 sm:ml-0 sm:w-auto",
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
                                        <LazySegmentMarkdown
                                            expanded={isExpanded}
                                            body={segment.markdown_body}
                                            segmentId={segment.id}
                                            highlights={highlights}
                                        />
                                    </div>

                                    <div className={cn(
                                        "mt-8 flex flex-wrap items-center justify-center gap-3 max-sm:-ml-[3.25rem] max-sm:w-[calc(100%_+_3.25rem)]",
                                        incompleteAction && "flex-col gap-1"
                                    )}>
                                        <button
                                            onClick={() => {
                                                if (isLastSegment) {
                                                    if (!isContentCompleted) {
                                                        onFinishReading?.();
                                                    }

                                                    setExpandedId(null);
                                                    return;
                                                }

                                                if (!isCompleted && onSegmentComplete) {
                                                    onSegmentComplete(segment.id, index);
                                                }

                                                const nextSegment = segments[index + 1];
                                                handleToggle(nextSegment, index + 1);
                                            }}
                                            className={cn(
                                                "focus-ring inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors max-sm:max-w-full max-sm:whitespace-normal max-sm:text-center sm:min-h-0 sm:px-5",
                                                !isLastSegment
                                                    ? "border-primary/35 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/15"
                                                    : isContentCompleted
                                                    ? "border-border/65 bg-background/55 text-muted-foreground hover:border-border hover:bg-accent/25 hover:text-foreground"
                                                    : "border-border/70 bg-background/60 text-foreground/90 hover:border-primary/30 hover:bg-accent/35 hover:text-foreground"
                                            )}
                                        >
                                                {!isLastSegment ? (
                                                    <>
                                                        {isCompleted
                                                            ? <ChevronRight className="size-4 max-sm:shrink-0" aria-hidden="true" />
                                                            : <CheckCircle2 className="size-4 max-sm:shrink-0" aria-hidden="true" />}
                                                        <span className="max-sm:min-w-0">{isCompleted ? "Continue" : "Mark complete and continue"}</span>
                                                    </>
                                            ) : isContentCompleted ? (
                                                <>
                                                    <span>Close section</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 className="size-4 max-sm:shrink-0" />
                                                    Finish Reading
                                                </>
                                            )}
                                        </button>
                                        {incompleteAction}
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
