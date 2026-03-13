"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReaderHeroHeader } from "./ReaderHeroHeader";
import { SegmentAccordion } from "./SegmentAccordion";
import type { ContentItemWithSegments, QuickMode } from "@/types/domain";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useReadingTimer } from "@/hooks/useReadingTimer";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { ContentFeedback } from "@/components/ui/ContentFeedback";
import { CompletionCard } from "./CompletionCard";
import { TextSelectionToolbar } from "./TextSelectionToolbar";
import { NotesDrawer } from "./NotesDrawer";
import { useHighlights } from "@/hooks/useHighlights";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { HighlightPopover } from "./HighlightPopover";

/**
 * Reader View — Accordion Layout
 *
 * Single-column layout replacing the old 3-column sidebar + content + actions.
 * All segments are shown as an accordion list. Users expand one at a time.
 * Consistent across desktop and mobile.
 */

interface ReaderViewProps {
    content: ContentItemWithSegments;
}

export function ReaderView({ content }: ReaderViewProps) {
    const quickMode = content.quick_mode_json as QuickMode | null;
    const [maxSegmentIndex, setMaxSegmentIndex] = useState(-1);
    const [completedSegments, setCompletedSegments] = useState<Set<string>>(new Set());
    const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
    const [popoverHighlightId, setPopoverHighlightId] = useState<string | null>(null);
    const [activeHighlightPosition, setActiveHighlightPosition] = useState<{
        top: number;
        left: number;
        width: number;
        height: number;
    } | null>(null);
    const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
    const [isPopoverHovered, setIsPopoverHovered] = useState(false);
    const [popoverPortalEl, setPopoverPortalEl] = useState<HTMLDivElement | null>(null);
    const { saveReadingProgress, getProgress, isLoaded: readingProgressLoaded } = useReadingProgress();
    const { data: highlights = [], isLoading: highlightsLoading, error: highlightsError } = useHighlights(content.id);
    const { readerTheme, fontFamily, fontSize, lineHeight, syncFromCloud } = useReaderSettings();
    const isDesktop = useMediaQuery("(min-width: 640px)");
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const popoverHighlight = popoverHighlightId
        ? highlights.find((highlight) => highlight.id === popoverHighlightId) ?? null
        : null;
    const spotlightTimeoutRef = useRef<number | null>(null);
    const handledUrlHighlightRef = useRef<string | null>(null);
    const sectionMeta = useMemo(
        () =>
            content.segments.map((segment, index) => ({
                id: segment.id,
                title: segment.title || `Segment ${index + 1}`,
            })),
        [content.segments]
    );

    // Start tracking reading time
    useReadingTimer(content.id);

    // Sync reader settings from cloud on mount
    useEffect(() => {
        syncFromCloud();
    }, [syncFromCloud]);

    const savedProgress = getProgress(content.id);

    // Load progress from scoped storage on mount and account changes
    useEffect(() => {
        if (!savedProgress) {
            setCompletedSegments(new Set());
            setMaxSegmentIndex(-1);
            return;
        }

        setCompletedSegments(new Set(savedProgress.completed || []));
        setMaxSegmentIndex(
            typeof savedProgress.maxSegmentIndex === "number"
                ? savedProgress.maxSegmentIndex
                : savedProgress.lastSegmentIndex ?? -1,
        );
    }, [savedProgress]);

    useEffect(() => {
        if (popoverHighlightId && !popoverHighlight) {
            setPopoverHighlightId(null);
            setActiveHighlightPosition(null);
        }

        if (activeHighlightId && !highlights.some((highlight) => highlight.id === activeHighlightId)) {
            setActiveHighlightId(null);
        }
    }, [activeHighlightId, highlights, popoverHighlight, popoverHighlightId]);

    // Handle segment open — only track max index for progress visibility
    const handleSegmentOpen = (segmentId: string, index: number) => {
        // Update max opened index
        setMaxSegmentIndex((prev) => Math.max(prev, index));
    };

    // Handle explicit segment completion
    const handleSegmentComplete = (segmentId: string, index: number) => {
        // Mark explicitly completed
        setCompletedSegments((prev) => {
            const next = new Set(prev);
            next.add(segmentId);
            return next;
        });

        // Update max opened index just in case
        setMaxSegmentIndex((prev) => Math.max(prev, index));
    };

    // Derive book completion state
    const isBookCompleted = completedSegments.size >= content.segments.length && content.segments.length > 0;

    // Save progress on changes (debounced)
    useEffect(() => {
        if (!readingProgressLoaded) return;

        const timeoutId = setTimeout(() => {
            const isCompleted = completedSegments.size >= content.segments.length;

            const progressData = {
                completed: Array.from(completedSegments),
                lastSegmentIndex: maxSegmentIndex,
                maxSegmentIndex,
                lastReadAt: new Date().toISOString(),
                isCompleted,
                itemId: content.id,
                totalSegments: content.segments.length,
            };

            saveReadingProgress(content.id, progressData);
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [completedSegments, content.id, content.segments.length, maxSegmentIndex, readingProgressLoaded, saveReadingProgress]);

    // ── Keyboard Shortcuts (Fullscreen) ──────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger if user is typing in an input/textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.key.toLowerCase() === "f") {
                e.preventDefault();
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch((err) => console.error(err));
                } else if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            if (!isDesktop || !popoverHighlightId || isPopoverHovered) return;
            setPopoverHighlightId(null);
            setActiveHighlightPosition(null);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [popoverHighlightId, isDesktop, isPopoverHovered]);

    useEffect(() => {
        return () => {
            if (spotlightTimeoutRef.current !== null) {
                window.clearTimeout(spotlightTimeoutRef.current);
            }
            document
                .querySelectorAll<HTMLElement>('mark[data-highlight-spotlight="true"]')
                .forEach((mark) => mark.removeAttribute("data-highlight-spotlight"));
        };
    }, []);

    useEffect(() => {
        if (!searchParams.get("highlightId")) {
            handledUrlHighlightRef.current = null;
        }
    }, [searchParams]);

    const closeActiveHighlight = () => {
        setPopoverHighlightId(null);
        setActiveHighlightPosition(null);
        setIsPopoverHovered(false);
    };

    const applyHighlightSpotlight = (highlightId: string, marks: HTMLElement[]) => {
        if (spotlightTimeoutRef.current !== null) {
            window.clearTimeout(spotlightTimeoutRef.current);
        }

        document
            .querySelectorAll<HTMLElement>('mark[data-highlight-spotlight="true"]')
            .forEach((mark) => mark.removeAttribute("data-highlight-spotlight"));

        marks.forEach((mark) => mark.setAttribute("data-highlight-spotlight", "true"));

        spotlightTimeoutRef.current = window.setTimeout(() => {
            document
                .querySelectorAll<HTMLElement>(`mark[data-id="${highlightId}"][data-highlight-spotlight="true"]`)
                .forEach((mark) => mark.removeAttribute("data-highlight-spotlight"));
        }, 1800);
    };

    const waitForHighlightMarks = async (highlightId: string): Promise<HTMLElement[]> => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
            const marks = Array.from(
                document.querySelectorAll<HTMLElement>(`mark[data-id="${highlightId}"]`)
            );

            if (marks.length > 0) {
                return marks;
            }

            await new Promise((resolve) => window.setTimeout(resolve, 80));
        }

        return [];
    };

    const handleHighlightJump = useCallback(async (highlightId: string) => {
        const highlight = highlights.find((item) => item.id === highlightId);
        if (!highlight) return;

        setActiveHighlightId(highlightId);
        setPopoverHighlightId(null);
        setActiveHighlightPosition(null);
        setIsPopoverHovered(false);

        if (highlight.segment_id) {
            const targetIndex = content.segments.findIndex((segment) => segment.id === highlight.segment_id);
            setExpandedSegmentId(highlight.segment_id);

            if (targetIndex !== -1) {
                handleSegmentOpen(highlight.segment_id, targetIndex);
            }
        }

        const marks = await waitForHighlightMarks(highlightId);
        if (marks.length === 0) return;

        const [firstMark] = marks;
        const top = firstMark.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        applyHighlightSpotlight(highlightId, marks);
    }, [content.segments, highlights]);

    useEffect(() => {
        const urlHighlightId = searchParams.get("highlightId");
        if (!urlHighlightId || highlightsLoading) {
            return;
        }

        if (handledUrlHighlightRef.current === urlHighlightId) {
            return;
        }

        handledUrlHighlightRef.current = urlHighlightId;

        const clearUrlParam = () => {
            router.replace(pathname, { scroll: false });
        };

        if (!highlights.some((highlight) => highlight.id === urlHighlightId)) {
            clearUrlParam();
            return;
        }

        void handleHighlightJump(urlHighlightId).finally(clearUrlParam);
    }, [handleHighlightJump, highlights, highlightsLoading, pathname, router, searchParams]);

    return (
        <div className={`min-h-screen bg-background font-sans text-foreground transition-colors duration-300 reader-${readerTheme} reader-font-${fontFamily} reader-spacing-${lineHeight}`}>
            <div ref={setPopoverPortalEl} aria-hidden="true" />
            <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-8 pb-8 sm:pt-12 lg:pb-24">
                {/* Hero Header */}
                <ReaderHeroHeader
                    title={content.title}
                    author={content.author}
                    type={content.type}
                    coverImageUrl={content.cover_image_url}
                    audioUrl={content.audio_url}
                    durationSeconds={content.duration_seconds}
                    segmentsTotal={content.segments.length}
                    segmentsRead={completedSegments.size}
                />

                {/* Big Idea - Context before segments */}
                {quickMode?.big_idea && (
                    <div className="bg-card/40 rounded-xl p-6 sm:p-8 border border-border/40 mb-8">
                        <h3 className="text-sm font-bold text-primary uppercase tracking-[0.2em] mb-3">
                            The Big Idea
                        </h3>
                        <div className={`reader-size-${fontSize} text-foreground/90 leading-relaxed font-medium`}>
                            {quickMode.big_idea}
                        </div>
                    </div>
                )}

                {/* Accordion Sections */}
                <SegmentAccordion
                    segments={content.segments}
                    completedSegments={completedSegments}
                    onSegmentOpen={handleSegmentOpen}
                    onSegmentComplete={handleSegmentComplete}
                    highlights={highlights}
                    expandedSegmentId={expandedSegmentId}
                    onExpandedSegmentChange={setExpandedSegmentId}
                    onHighlightActivate={(highlightId, position) => {
                        setActiveHighlightId(highlightId);
                        setPopoverHighlightId(highlightId);
                        setActiveHighlightPosition(position);
                    }}
                />

                {/* Completion Card or Content Feedback */}
                {isBookCompleted ? (
                    <CompletionCard
                        contentId={content.id}
                        title={content.title}
                        author={content.author}
                        segmentCount={content.segments.length}
                    />
                ) : (
                    <ContentFeedback contentId={content.id} />
                )}
            </div>

            {/* Floating elements — rendered OUTSIDE the content wrapper so position:fixed works correctly */}
            {/* Deferred mobile alternative: introduce a separate post-selection CTA instead of replacing the native iOS menu. */}
            {isDesktop && <TextSelectionToolbar contentItemId={content.id} />}
            <NotesDrawer
                highlights={highlights}
                isLoading={highlightsLoading}
                hasError={Boolean(highlightsError)}
                sections={sectionMeta}
                activeHighlightId={activeHighlightId}
                onHighlightJump={handleHighlightJump}
            />
            {isDesktop && popoverHighlight && activeHighlightPosition && popoverPortalEl && (
                <HighlightPopover
                    highlightId={popoverHighlight.id}
                    noteBody={popoverHighlight.note_body}
                    highlightedText={popoverHighlight.highlighted_text}
                    currentColor={popoverHighlight.color || "yellow"}
                    position={activeHighlightPosition}
                    portalContainer={popoverPortalEl}
                    createdAt={popoverHighlight.created_at || undefined}
                    onClose={closeActiveHighlight}
                    onMouseEnter={() => setIsPopoverHovered(true)}
                    onMouseLeave={() => {
                        setIsPopoverHovered(false);
                        closeActiveHighlight();
                    }}
                />
            )}
        </div>
    );
}
