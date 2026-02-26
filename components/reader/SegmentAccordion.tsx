"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { HighlightPopover } from "./HighlightPopover";
import { HighlightBottomSheet } from "./HighlightBottomSheet";
import type { SegmentFull } from "@/types/domain";
import type { HighlightWithContent } from "@/hooks/useHighlights";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useMediaQuery } from "@/hooks/useMediaQuery";

// ─── Safe Recursive AST Highlighting ───────────────────────────────────────
function applyHighlightsToTextNode(text: string, highlights: HighlightWithContent[]): any[] {
    if (!text) return [];

    // Sort highlights: longest first. Single characters are allowed but 
    // AST mapping protects them from breaking HTML tags.
    const sorted = [...highlights]
        .filter(h => h.highlighted_text.trim().length > 0)
        .sort((a, b) => b.highlighted_text.length - a.highlighted_text.length);

    for (const h of sorted) {
        const matchText = h.highlighted_text;
        const idx = text.indexOf(matchText);

        if (idx !== -1) {
            const before = text.slice(0, idx);
            const match = text.slice(idx, idx + matchText.length);
            const after = text.slice(idx + matchText.length);

            const noteAttr = h.note_body ? ` data-note="${h.note_body.replace(/"/g, "&quot;")}"` : "";
            const idAttr = ` data-id="${h.id}"`;
            const colorAttr = h.color ? ` data-color="${h.color}"` : "";

            // Use interactive cursor if it has a note
            const color = h.color || (h.note_body ? "blue" : "yellow");

            const HIGHLIGHT_COLORS: Record<string, string> = {
                yellow: "bg-highlight-yellow hover:bg-highlight-yellow-hover",
                blue: "bg-highlight-blue hover:bg-highlight-blue-hover",
                green: "bg-highlight-green hover:bg-highlight-green-hover",
                red: "bg-highlight-red hover:bg-highlight-red-hover",
                purple: "bg-highlight-purple hover:bg-highlight-purple-hover",
            };

            const bgClass = HIGHLIGHT_COLORS[color] || HIGHLIGHT_COLORS.yellow;
            const cursorClass = h.note_body ? "cursor-pointer" : "cursor-text";
            const markHtml = `<mark class="${bgClass} text-inherit rounded-sm -mx-0.5 px-0.5 ${cursorClass} transition-colors"${idAttr}${colorAttr}${noteAttr}>${match}</mark>`;

            const newNodes: any[] = [];
            // Recursively process the text before the match
            if (before) newNodes.push(...applyHighlightsToTextNode(before, highlights));
            // Add the matched highlight HTML
            newNodes.push({ type: "html", value: markHtml });
            // Recursively process the text after the match
            if (after) newNodes.push(...applyHighlightsToTextNode(after, highlights));

            return newNodes;
        }
    }

    // If no match found, output the text node safely
    return [{ type: "text", value: text }];
}

function wrapTextNodesWithHighlights(node: any, highlights: HighlightWithContent[]) {
    if (node.children) {
        const newChildren: any[] = [];
        for (const child of node.children) {
            if (child.type === "text") {
                newChildren.push(...applyHighlightsToTextNode(child.value, highlights));
            } else {
                wrapTextNodesWithHighlights(child, highlights);
                newChildren.push(child);
            }
        }
        node.children = newChildren;
    }
}

// ─── Custom Remark Plugin to apply highlights safely ───────────────
function createRemarkHighlightPlugin(highlights: HighlightWithContent[]) {
    return () => (tree: any) => {
        if (!highlights || highlights.length === 0) return;
        wrapTextNodesWithHighlights(tree, highlights);
    };
}

/**
 * Segment Accordion
 *
 * Renders all segments as an interactive accordion list.
 * One segment can be expanded at a time — opening one collapses the previous.
 * Expanded content is truncated by default with a "Read More" option.
 */

interface SegmentAccordionProps {
    segments: SegmentFull[];
    completedSegments: Set<string>;
    onSegmentOpen: (segmentId: string, index: number) => void;
    onSegmentComplete?: (segmentId: string, index: number) => void;
    highlights?: HighlightWithContent[];
}


export function SegmentAccordion({
    segments,
    completedSegments,
    onSegmentOpen,
    onSegmentComplete,
    highlights = [],
}: SegmentAccordionProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const { fontSize, fontFamily, lineHeight } = useReaderSettings();
    const isMobile = useMediaQuery("(max-width: 639px)");

    // --- Popover / Bottom Sheet State ---
    const [activeHighlight, setActiveHighlight] = useState<{
        id: string;
        text: string;
        note: string | null;
        color: string;
        createdAt?: string;
        rect: { top: number; left: number; width: number; height: number };
    } | null>(null);

    // Track mouse entering/leaving the popover itself to prevent it from closing
    const popoverHoverRef = useRef(false);

    // Track touch interactions to differentiate between a tap and a scroll
    const touchStartPos = useRef<{ x: number, y: number } | null>(null);

    const handleToggle = useCallback(
        (segment: SegmentFull, index: number) => {
            const isOpening = expandedId !== segment.id;

            if (isOpening) {
                // First open the section so the DOM starts transitioning
                setExpandedId(segment.id);
                onSegmentOpen(segment.id, index);

                // Wait for the PREVIOUS section to finish collapsing (300ms transition)
                // before calculating the final scroll position.
                const initialScrollY = window.scrollY;
                setTimeout(() => {
                    // Abort scroll if the user manually started scrolling during the animation
                    if (Math.abs(window.scrollY - initialScrollY) > 50) return;

                    const el = itemRefs.current.get(segment.id);
                    if (el) {
                        // Get position relative to viewport, subtract a comfy offset
                        // for the fixed nav (usually ~80-100px)
                        const y = el.getBoundingClientRect().top + window.scrollY - 100;
                        window.scrollTo({ top: y, behavior: "smooth" });
                    }
                }, 310); // Slightly longer than the 300ms CSS duration
            } else {
                // Just close it if clicking the active one
                setExpandedId(null);
            }
        },
        [expandedId, onSegmentOpen]
    );

    // ── Keyboard Navigation (Left/Right Arrows) ──────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input/textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.key === "ArrowRight") {
                e.preventDefault();
                if (!expandedId) {
                    // Open first segment
                    handleToggle(segments[0], 0);
                } else {
                    const currentIndex = segments.findIndex((s) => s.id === expandedId);
                    if (currentIndex !== -1 && currentIndex < segments.length - 1) {
                        handleToggle(segments[currentIndex + 1], currentIndex + 1);
                    }
                }
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                const currentIndex = segments.findIndex((s) => s.id === expandedId);
                if (currentIndex > 0) {
                    handleToggle(segments[currentIndex - 1], currentIndex - 1);
                } else if (currentIndex === 0) {
                    // Close the first segment if pressed left while on it
                    handleToggle(segments[0], 0);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [expandedId, segments, handleToggle]);

    // ── Handle Hover / Tap for Premium UI ────────────────────────────────
    const handleNoteInteraction = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // If it's a touch event, distinguish between a tap and a scroll
        if (e.type === 'touchend') {
            const touch = (e as React.TouchEvent).changedTouches[0];
            const start = touchStartPos.current;
            if (start) {
                const distanceX = Math.abs(touch.clientX - start.x);
                const distanceY = Math.abs(touch.clientY - start.y);
                // If the user's finger moved more than ~10px, treat it as a scroll/swipe, not a tap
                if (distanceX > 10 || distanceY > 10) {
                    touchStartPos.current = null;
                    return;
                }
            }
            touchStartPos.current = null;
        }

        const target = (e.target as HTMLElement).closest("mark[data-id]");

        if (target) {
            const id = target.getAttribute("data-id");
            const note = target.getAttribute("data-note");
            const color = target.getAttribute("data-color") || "yellow";
            const text = target.textContent?.trim() || "";

            if (id) { // Show popover for ALL highlights, even without notes
                const rect = target.getBoundingClientRect();

                setActiveHighlight((prev) => {
                    if (prev?.id !== id) {
                        return {
                            id,
                            text,
                            note,
                            color,
                            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                        };
                    }
                    return prev;
                });
            }
        }
    }, [setActiveHighlight]);

    // Also close on scroll to prevent drifting UI
    useEffect(() => {
        const handleScroll = () => {
            if (activeHighlight && !popoverHoverRef.current) {
                setActiveHighlight(null);
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [activeHighlight]);

    return (
        <>
            <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4 px-1">
                    Sections
                </h3>
                {segments.map((segment, index) => {
                    const isExpanded = expandedId === segment.id;
                    const isCompleted = completedSegments.has(segment.id);

                    // Inject highlight markup using safe Remark plugin instead of regex string replacement
                    const segmentHighlights = highlights.filter(h => h.segment_id === segment.id);
                    const remarkPlugins: any[] = [remarkGfm, remarkBreaks];
                    if (segmentHighlights.length > 0) {
                        remarkPlugins.push(createRemarkHighlightPlugin(segmentHighlights));
                    }

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
                                    "focus-ring w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left",
                                    "md:hover:bg-accent/40 active:scale-[0.99] active:bg-accent/60",
                                    isExpanded
                                        ? "bg-accent/50 border border-border"
                                        : "bg-card/60 border border-transparent md:hover:border-border"
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
                                        "flex-1 font-semibold text-sm md:text-base leading-snug transition-colors",
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
                                            data-segment-id={segment.id}
                                            onMouseMove={(e) => handleNoteInteraction(e)}
                                            onClick={(e) => handleNoteInteraction(e)}
                                            onTouchStart={(e) => {
                                                const touch = e.touches[0];
                                                touchStartPos.current = { x: touch.clientX, y: touch.clientY };
                                            }}
                                            onTouchEnd={(e) => handleNoteInteraction(e)}
                                            className={cn(
                                                "prose dark:prose-invert max-w-none relative transition-all duration-300",
                                                `reader-size-${fontSize}`,
                                                `reader-font-${fontFamily}`,
                                                `reader-spacing-${lineHeight}`,
                                                "prose-headings:text-foreground prose-headings:font-semibold prose-headings:text-base",
                                                "prose-p:text-foreground/95", // higher opacity, letting prose-deep handle sizes
                                                "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
                                                "prose-strong:text-foreground",
                                                "prose-blockquote:border-l-primary/40 prose-blockquote:text-muted-foreground prose-blockquote:text-sm md:prose-blockquote:text-base",
                                                "prose-ul:text-foreground/95 prose-ol:text-foreground/95",
                                                "prose-li:marker:text-muted-foreground"
                                            )}
                                        >
                                            <ReactMarkdown
                                                remarkPlugins={remarkPlugins as any}
                                                rehypePlugins={[rehypeRaw]}
                                            >
                                                {segment.markdown_body}
                                            </ReactMarkdown>
                                        </div>

                                        {/* Explicit Complete Action */}
                                        <div className="mt-8 flex justify-center">
                                            <button
                                                onClick={() => {
                                                    // Trigger completion callback
                                                    if (onSegmentComplete) {
                                                        onSegmentComplete(segment.id, index);
                                                    }

                                                    // Auto-advance to next segment if not the last one
                                                    if (index < segments.length - 1) {
                                                        const nextSegment = segments[index + 1];
                                                        handleToggle(nextSegment, index + 1);
                                                    } else {
                                                        // Last segment — just collapse
                                                        setExpandedId(null);
                                                    }
                                                }}
                                                className={cn(
                                                    "px-6 py-2.5 rounded-full font-semibold text-sm transition-all duration-300 flex items-center gap-2",
                                                    isCompleted
                                                        ? "bg-green-500/15 text-green-500 hover:bg-green-500/25"
                                                        : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95 shadow-md shadow-primary/20"
                                                )}
                                            >
                                                {isCompleted ? (
                                                    <>
                                                        <CheckCircle2 className="size-4" />
                                                        Completed
                                                    </>
                                                ) : index < segments.length - 1 ? (
                                                    <>
                                                        <CheckCircle2 className="size-4" />
                                                        Mark as Completed & Continue
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

            {/* Premium UX Components — only mount the appropriate one for the viewport */}
            {activeHighlight && (
                isMobile ? (
                    <HighlightBottomSheet
                        highlightId={activeHighlight.id}
                        noteBody={activeHighlight.note}
                        highlightedText={activeHighlight.text}
                        currentColor={activeHighlight.color}
                        createdAt={activeHighlight.createdAt}
                        onClose={() => setActiveHighlight(null)}
                    />
                ) : (
                    <HighlightPopover
                        highlightId={activeHighlight.id}
                        noteBody={activeHighlight.note}
                        highlightedText={activeHighlight.text}
                        currentColor={activeHighlight.color}
                        position={activeHighlight.rect}
                        createdAt={activeHighlight.createdAt}
                        onClose={() => setActiveHighlight(null)}
                        onMouseEnter={() => { popoverHoverRef.current = true; }}
                        onMouseLeave={() => {
                            popoverHoverRef.current = false;
                            setActiveHighlight(null);
                        }}
                    />
                )
            )}
        </>
    );
}
