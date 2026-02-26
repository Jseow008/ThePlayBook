"use client";

import { useState, useEffect } from "react";
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
    const { saveReadingProgress } = useReadingProgress();
    const { data: highlights = [] } = useHighlights(content.id);
    const { readerTheme, fontFamily, fontSize, lineHeight } = useReaderSettings();

    // Start tracking reading time
    useReadingTimer(content.id);

    // Load progress from localStorage on mount
    useEffect(() => {
        const savedProgress = localStorage.getItem(`flux_progress_${content.id}`);
        if (savedProgress) {
            try {
                const parsed = JSON.parse(savedProgress);
                if (parsed.completed) {
                    setCompletedSegments(new Set(parsed.completed));
                }
                if (typeof parsed.maxSegmentIndex === "number") {
                    setMaxSegmentIndex(parsed.maxSegmentIndex);
                }
            } catch (e) {
                console.error("Failed to parse progress", e);
            }
        }
    }, [content.id]);

    // Listen for cross-tab sync
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === `flux_progress_${content.id}`) {
                const savedProgress = localStorage.getItem(`flux_progress_${content.id}`);
                if (savedProgress) {
                    try {
                        const { completed } = JSON.parse(savedProgress);
                        if (completed) {
                            setCompletedSegments((prev) => {
                                if (prev.size !== completed.length) {
                                    return new Set(completed);
                                }
                                return prev;
                            });
                        }
                    } catch (e) {
                        console.error("Failed to parse progress", e);
                    }
                }
            }
        };

        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, [content.id]);

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
    }, [completedSegments, maxSegmentIndex, content.id, content.segments.length, saveReadingProgress]);

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

    return (
        <div className={`min-h-screen bg-background font-sans text-foreground transition-colors duration-300 reader-${readerTheme} reader-font-${fontFamily} reader-spacing-${lineHeight}`}>
            <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-8 pb-20 sm:pt-12 lg:pb-40">
                {/* Hero Header */}
                <ReaderHeroHeader
                    title={content.title}
                    author={content.author}
                    type={content.type}
                    coverImageUrl={content.cover_image_url}
                    audioUrl={content.audio_url}
                    durationSeconds={content.duration_seconds}
                    segmentsTotal={content.segments.length}
                    segmentsRead={maxSegmentIndex + 1}
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
            <TextSelectionToolbar contentItemId={content.id} />
            <NotesDrawer contentItemId={content.id} />
        </div>
    );
}
