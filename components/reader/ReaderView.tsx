"use client";

import { useState, useEffect } from "react";
import { ReaderHeroHeader } from "./ReaderHeroHeader";
import { SegmentAccordion } from "./SegmentAccordion";
import type { ContentItemWithSegments, QuickMode } from "@/types/domain";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useReadingTimer } from "@/hooks/useReadingTimer";
import { ContentFeedback } from "@/components/ui/ContentFeedback";
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

    // Handle segment open — mark as completed and track progress
    const handleSegmentOpen = (segmentId: string, index: number) => {
        // Mark completed
        setCompletedSegments((prev) => {
            const next = new Set(prev);
            next.add(segmentId);
            return next;
        });

        // Update max
        setMaxSegmentIndex((prev) => Math.max(prev, index));
    };

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

    return (
        <div className="min-h-screen bg-background font-sans text-foreground">
            <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-8 pb-24 sm:pt-12 lg:pb-12">
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
                        <h3 className="text-xs font-bold text-primary uppercase tracking-[0.2em] mb-3">
                            The Big Idea
                        </h3>
                        <p className="text-base sm:text-lg text-foreground/90 leading-relaxed">
                            {quickMode.big_idea}
                        </p>
                    </div>
                )}

                {/* Accordion Sections */}
                <SegmentAccordion
                    segments={content.segments}
                    completedSegments={completedSegments}
                    onSegmentOpen={handleSegmentOpen}
                    highlights={highlights}
                />

                {/* Content Feedback */}
                <ContentFeedback contentId={content.id} />

                {/* Floating Action Menu for Highlights */}
                <TextSelectionToolbar contentItemId={content.id} />

                {/* Notes Drawer */}
                <NotesDrawer contentItemId={content.id} />
            </div>
        </div>
    );
}
