"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { HighlightPopover } from "./HighlightPopover";
import { HighlightBottomSheet } from "./HighlightBottomSheet";
import type { SegmentFull } from "@/types/domain";
import type { HighlightWithContent } from "@/hooks/useHighlights";

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
                yellow: "bg-yellow-500/30 hover:bg-yellow-500/40",
                blue: "bg-blue-500/30 hover:bg-blue-500/40",
                green: "bg-green-500/30 hover:bg-green-500/40",
                red: "bg-red-500/30 hover:bg-red-500/40",
                purple: "bg-purple-500/30 hover:bg-purple-500/40",
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

const TRUNCATION_LENGTH = 200;

interface SegmentAccordionProps {
    segments: SegmentFull[];
    completedSegments: Set<string>;
    onSegmentOpen: (segmentId: string, index: number) => void;
    highlights?: HighlightWithContent[];
}

// ─── Hover Tooltip for Notes ─────────────────────────────────────────────────
interface NoteTooltip {
    text: string;
    x: number;
    y: number;
}

export function SegmentAccordion({
    segments,
    completedSegments,
    onSegmentOpen,
    highlights = [],
}: SegmentAccordionProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [fullyExpanded, setFullyExpanded] = useState<Set<string>>(new Set());
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
    const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // ── Handle Hover / Tap for Premium UI ────────────────────────────────
    const handleNoteInteraction = useCallback((e: React.MouseEvent | React.TouchEvent, isHover: boolean) => {
        const target = (e.target as HTMLElement).closest("mark[data-id]");

        if (target) {
            // Cancel pending closes
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);

            const id = target.getAttribute("data-id");
            const note = target.getAttribute("data-note");
            const color = target.getAttribute("data-color") || "yellow";
            const text = target.textContent?.trim() || "";

            if (id) { // Show popover for ALL highlights, even without notes
                const rect = target.getBoundingClientRect();

                if (activeHighlight?.id !== id || !isHover) {
                    setActiveHighlight({
                        id,
                        text,
                        note,
                        color,
                        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                    });
                }
            }
        } else if (isHover) {
            // Not over a mark. If we have an active highlight, start the close timer
            if (activeHighlight && !popoverHoverRef.current && !closeTimeoutRef.current) {
                closeTimeoutRef.current = setTimeout(() => {
                    if (!popoverHoverRef.current) {
                        setActiveHighlight(null);
                    }
                    closeTimeoutRef.current = null;
                }, 150); // Grace period
            }
        }
    }, [activeHighlight]);

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
                <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4 px-1">
                    Sections
                </h3>
                {segments.map((segment, index) => {
                    const isExpanded = expandedId === segment.id;
                    const isFullyExpanded = fullyExpanded.has(segment.id);
                    const isCompleted = completedSegments.has(segment.id);
                    const needsTruncation =
                        segment.markdown_body.length > TRUNCATION_LENGTH;

                    // Inject highlight markup using safe Remark plugin instead of regex string replacement
                    const segmentHighlights = highlights.filter(h => h.segment_id === segment.id);
                    const remarkPlugins: any[] = [remarkGfm];
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
                                            data-segment-id={segment.id}
                                            onMouseMove={(e) => handleNoteInteraction(e, true)}
                                            onClick={(e) => handleNoteInteraction(e, false)}
                                            onTouchEnd={(e) => handleNoteInteraction(e, false)}
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
                                                remarkPlugins={remarkPlugins as any}
                                                rehypePlugins={[rehypeRaw]}
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

            {/* Premium UX Components */}
            {activeHighlight && (
                <>
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
                    <HighlightBottomSheet
                        highlightId={activeHighlight.id}
                        noteBody={activeHighlight.note}
                        highlightedText={activeHighlight.text}
                        currentColor={activeHighlight.color}
                        createdAt={activeHighlight.createdAt}
                        onClose={() => setActiveHighlight(null)}
                    />
                </>
            )}
        </>
    );
}
