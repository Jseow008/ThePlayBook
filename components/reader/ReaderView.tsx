"use client";

import { useState, useEffect, useMemo } from "react";
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
import { HighlightBottomSheet } from "./HighlightBottomSheet";
import type { ReadingProgressData } from "@/lib/reading-progress";
import { normalizeReadingProgress } from "@/lib/reading-progress";

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
    const [hydratedProgressKey, setHydratedProgressKey] = useState<string | null>(null);
    const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
    const [activeHighlightPosition, setActiveHighlightPosition] = useState<{
        top: number;
        left: number;
        width: number;
        height: number;
    } | null>(null);
    const [isPopoverHovered, setIsPopoverHovered] = useState(false);
    const { saveReadingProgress } = useReadingProgress();
    const { data: highlights = [] } = useHighlights(content.id);
    const { readerTheme, fontFamily, fontSize, lineHeight, syncFromCloud } = useReaderSettings();
    const isDesktop = useMediaQuery("(min-width: 640px)");
    const validSegmentIds = useMemo(
        () => new Set(content.segments.map((segment) => segment.id)),
        [content.segments]
    );
    const activeHighlight = activeHighlightId
        ? highlights.find((highlight) => highlight.id === activeHighlightId) ?? null
        : null;

    // Start tracking reading time
    useReadingTimer(content.id);

    // Sync reader settings from cloud on mount
    useEffect(() => {
        syncFromCloud();
    }, [syncFromCloud]);

    // Load progress from localStorage on mount and when content changes.
    useEffect(() => {
        const resetProgressState = () => {
            setCompletedSegments(new Set());
            setMaxSegmentIndex(-1);
            setHydratedProgressKey(content.id);
        };

        const savedProgress = localStorage.getItem(`flux_progress_${content.id}`);
        if (!savedProgress) {
            resetProgressState();
            return;
        }

        try {
            const parsed = JSON.parse(savedProgress) as Partial<ReadingProgressData>;
            const { progress, didChange } = normalizeReadingProgress({
                progress: parsed,
                itemId: content.id,
                totalSegments: content.segments.length,
                validSegmentIds,
            });

            setCompletedSegments(new Set(progress.completed));
            setMaxSegmentIndex(progress.maxSegmentIndex ?? progress.lastSegmentIndex);
            setHydratedProgressKey(content.id);

            if (didChange) {
                saveReadingProgress(content.id, progress);
            }
        } catch (e) {
            console.error("Failed to parse progress", e);
            resetProgressState();
        }
    }, [content.id, content.segments.length, saveReadingProgress, validSegmentIds]);

    // Listen for cross-tab sync
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === `flux_progress_${content.id}`) {
                const savedProgress = localStorage.getItem(`flux_progress_${content.id}`);
                if (!savedProgress) {
                    setCompletedSegments(new Set());
                    setMaxSegmentIndex(-1);
                    return;
                }

                try {
                    const parsed = JSON.parse(savedProgress) as Partial<ReadingProgressData>;
                    const { progress, didChange } = normalizeReadingProgress({
                        progress: parsed,
                        itemId: content.id,
                        totalSegments: content.segments.length,
                        validSegmentIds,
                    });

                    setCompletedSegments(new Set(progress.completed));
                    setMaxSegmentIndex(progress.maxSegmentIndex ?? progress.lastSegmentIndex);

                    if (didChange) {
                        saveReadingProgress(content.id, progress);
                    }
                } catch (e) {
                    console.error("Failed to parse progress", e);
                }
            }
        };

        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [content.id, content.segments.length, saveReadingProgress, validSegmentIds]);

    useEffect(() => {
        if (!activeHighlightId || activeHighlight) return;
        setActiveHighlightId(null);
        setActiveHighlightPosition(null);
    }, [activeHighlightId, activeHighlight]);

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
        if (hydratedProgressKey !== content.id) {
            return;
        }

        const timeoutId = setTimeout(() => {
            const { progress } = normalizeReadingProgress({
                progress: {
                    completed: Array.from(completedSegments),
                    lastSegmentIndex: maxSegmentIndex,
                    maxSegmentIndex,
                    lastReadAt: new Date().toISOString(),
                    isCompleted: false,
                    itemId: content.id,
                    totalSegments: content.segments.length,
                },
                itemId: content.id,
                totalSegments: content.segments.length,
                validSegmentIds,
            });

            saveReadingProgress(content.id, progress);
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [
        completedSegments,
        content.id,
        content.segments.length,
        hydratedProgressKey,
        maxSegmentIndex,
        saveReadingProgress,
        validSegmentIds,
    ]);

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
            if (!isDesktop || !activeHighlightId || isPopoverHovered) return;
            setActiveHighlightId(null);
            setActiveHighlightPosition(null);
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [activeHighlightId, isDesktop, isPopoverHovered]);

    const closeActiveHighlight = () => {
        setActiveHighlightId(null);
        setActiveHighlightPosition(null);
        setIsPopoverHovered(false);
    };

    return (
        <div className={`min-h-screen bg-background font-sans text-foreground transition-colors duration-300 reader-${readerTheme} reader-font-${fontFamily} reader-spacing-${lineHeight}`}>
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
                    onHighlightActivate={(highlightId, position) => {
                        setActiveHighlightId(highlightId);
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
            <NotesDrawer contentItemId={content.id} />
            {isDesktop && activeHighlight && activeHighlightPosition && (
                <HighlightPopover
                    highlightId={activeHighlight.id}
                    noteBody={activeHighlight.note_body}
                    highlightedText={activeHighlight.highlighted_text}
                    currentColor={activeHighlight.color || "yellow"}
                    position={activeHighlightPosition}
                    createdAt={activeHighlight.created_at || undefined}
                    onClose={closeActiveHighlight}
                    onMouseEnter={() => setIsPopoverHovered(true)}
                    onMouseLeave={() => {
                        setIsPopoverHovered(false);
                        closeActiveHighlight();
                    }}
                />
            )}
            {!isDesktop && activeHighlight && (
                <HighlightBottomSheet
                    noteBody={activeHighlight.note_body}
                    highlightedText={activeHighlight.highlighted_text}
                    currentColor={activeHighlight.color || "yellow"}
                    createdAt={activeHighlight.created_at || undefined}
                    onClose={closeActiveHighlight}
                />
            )}
        </div>
    );
}
