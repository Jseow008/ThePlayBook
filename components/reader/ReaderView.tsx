"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Menu, X, BookOpen, Download, Share2, Layers } from "lucide-react";
import { SegmentNav } from "./SegmentNav";
import { SegmentContent } from "./SegmentContent";
import { AudioPlayer } from "./AudioPlayer";
import type { ContentItemWithSegments } from "@/types/domain";
import { useReadingProgress } from "@/hooks/useReadingProgress";

interface ReaderViewProps {
    content: ContentItemWithSegments;
}

export function ReaderView({ content }: ReaderViewProps) {
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isActionsOpen, setIsActionsOpen] = useState(false);
    const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
    const [completedSegments, setCompletedSegments] = useState<Set<string>>(new Set());
    const [showCopiedToast, setShowCopiedToast] = useState(false);
    const { saveReadingProgress } = useReadingProgress();

    const handleShare = async () => {
        const shareData = {
            title: content.title,
            text: `Read "${content.title}" on Flux`,
            url: window.location.href,
        };

        try {
            if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(window.location.href);
                setShowCopiedToast(true);
                setTimeout(() => setShowCopiedToast(false), 2000);
            }
        } catch (err) {
            console.error("Error sharing:", err);
        }
    };

    // Computed active segment
    const activeSegment = content.segments[activeSegmentIndex];
    const nextSegment = content.segments[activeSegmentIndex + 1];

    // Load progress from localStorage (Initial + Polling for Cloud Sync)
    useEffect(() => {
        const load = () => {
            const savedProgress = localStorage.getItem(`flux_progress_${content.id}`);
            if (savedProgress) {
                try {
                    const { lastSegmentIndex, completed } = JSON.parse(savedProgress);
                    // Only update if significantly different to avoid jitter (e.g. if user is reading)
                    // But for initial load, we want to set it. 
                    // To avoid overwriting user's active navigation, we might check if activeSegmentIndex is 0?
                    // Or just let user navigate. 
                    // Ideally, we only force update if the stored index is > active index? 
                    // Let's just load on mount and poll once or twice?
                    // Simple logic: If we are at 0, and stored is > 0, jump.

                    /* 
                       Logic: We want to accept cloud updates effectively.
                       If existing state is "default" (0), accept any update.
                       If existing state is user-modified, be careful?
                       For simplicity, we just interpret the stored state.
                       To prevent overriding user's manual navigation, we can't just react blindly.
                       
                       BUT, since we are implementing Cloud Sync, the "truth" comes from storage.
                       We rely on the standard `useEffect` below only on mount? 
                       No, I added polling plan.
                    */

                    if (completed) {
                        setCompletedSegments(prev => {
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
        };

        load();

        // Polling to catch Cloud Sync updates (e.g. coming from another device via hook sync)
        const interval = setInterval(load, 2000);
        return () => clearInterval(interval);
    }, [content.id]);

    // Separate effect for initial jump to last position to avoid polling jumping
    useEffect(() => {
        const savedProgress = localStorage.getItem(`flux_progress_${content.id}`);
        if (savedProgress) {
            try {
                const { lastSegmentIndex } = JSON.parse(savedProgress);
                if (typeof lastSegmentIndex === 'number' && lastSegmentIndex >= 0 && lastSegmentIndex < content.segments.length) {
                    setActiveSegmentIndex(lastSegmentIndex);
                }
            } catch { }
        }
    }, [content.id, content.segments.length]);

    // Mark segment as completed when index changes
    useEffect(() => {
        if (activeSegment) {
            setCompletedSegments(prev => {
                const newSet = new Set(prev);
                newSet.add(activeSegment.id);
                return newSet;
            });
        }
    }, [activeSegmentIndex, activeSegment]);

    // Save progress using hook
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const isCompleted = activeSegmentIndex === content.segments.length - 1;

            const progressData = {
                completed: Array.from(completedSegments),
                lastSegmentIndex: activeSegmentIndex,
                lastReadAt: new Date().toISOString(),
                isCompleted,
                itemId: content.id,
                totalSegments: content.segments.length
            };

            // Use the hook to save (handles localStorage + Cloud Sync)
            saveReadingProgress(content.id, progressData);
        }, 1000); // 1s debounce

        return () => clearTimeout(timeoutId);
    }, [activeSegmentIndex, content.id, content.segments.length, completedSegments, saveReadingProgress]);

    const handleNext = () => {
        if (activeSegmentIndex < content.segments.length - 1) {
            setActiveSegmentIndex(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const handlePrev = () => {
        if (activeSegmentIndex > 0) {
            setActiveSegmentIndex(prev => prev - 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const handleSegmentClick = (segmentId: string) => {
        const index = content.segments.findIndex(s => s.id === segmentId);
        if (index !== -1) {
            setActiveSegmentIndex(index);
            setIsSidebarOpen(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const segments = content.segments.map(s => ({
        id: s.id,
        order_index: s.order_index,
        title: s.title,
        start_time_sec: s.start_time_sec
    }));

    // Actions Panel Content
    const ActionsPanel = () => {
        return (
            <div className="space-y-6 pt-6">
                {/* Actions */}
                <div className="p-4 rounded-lg bg-card border shadow-sm space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                        Actions
                    </h3>
                    <button
                        disabled
                        className="w-full flex items-center gap-3 p-3 rounded-md bg-secondary/50 text-muted-foreground hover:bg-secondary transition-colors text-sm text-left opacity-50 cursor-not-allowed"
                    >
                        <Download className="size-4" />
                        <span>Download PDF (Coming Soon)</span>
                    </button>
                    <button
                        onClick={handleShare}
                        className="w-full flex items-center gap-3 p-3 rounded-md bg-secondary/50 text-foreground hover:bg-secondary transition-colors text-sm text-left"
                    >
                        <Share2 className="size-4" />
                        <span>{showCopiedToast ? "Link Copied!" : "Share Summary"}</span>
                    </button>
                </div>

                {/* Progress */}
                <div className="p-4 rounded-lg bg-card border shadow-sm">
                    <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{Math.round(((activeSegmentIndex + 1) / segments.length) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-500"
                            style={{ width: `${((activeSegmentIndex + 1) / segments.length) * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-background overflow-hidden font-sans">
            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 w-full z-50 flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-md border-b">
                <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-muted-foreground">
                    <Menu className="size-5" />
                </button>
                <span className="font-semibold truncate max-w-[200px]">{content.title}</span>
                <div className="flex items-center">
                    <button
                        onClick={() => setIsActionsOpen(true)}
                        className="p-2 text-muted-foreground lg:hidden"
                    >
                        <Layers className="size-5" />
                    </button>
                    <Link href="/" className="p-2 -mr-2 text-muted-foreground">
                        <X className="size-5" />
                    </Link>
                </div>
            </header>

            {/* Left Column: Navigation (Desktop: w-72, Mobile: Drawer) */}
            <aside
                className={`
                    fixed inset-y-0 left-0 z-40 w-72 bg-card border-r transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none
                    ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                `}
            >
                <div className="h-full flex flex-col">
                    <div className="flex items-center gap-3 p-4 border-b h-16">
                        <button
                            onClick={() => router.push("/")}
                            className="flex items-center gap-3 w-full p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent/50 transition-colors text-left"
                        >
                            <ArrowLeft className="size-4" />
                            <span className="font-semibold truncate">Library</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 px-2">
                            Sections
                        </h3>
                        <SegmentNav
                            segments={segments}
                            currentSegmentId={activeSegment?.id || null}
                            completedSegments={completedSegments}
                            onSegmentClick={handleSegmentClick}
                        />
                    </div>
                </div>
            </aside>

            {/* Center Column: Content (Main) */}
            <main className="flex-1 overflow-y-auto h-full pt-16 lg:pt-0 scroll-smooth">
                <div className="max-w-3xl mx-auto px-6 py-12 lg:py-16 min-h-screen flex flex-col">
                    <header className="mb-12 text-center">
                        <div className="inline-flex items-center justify-center p-2 bg-secondary rounded-full mb-6">
                            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-2">
                                {content.type} • {activeSegmentIndex + 1} of {segments.length}
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
                            {content.title}
                        </h1>
                        {content.author && (
                            <p className="text-xl text-muted-foreground">by {content.author}</p>
                        )}

                        {/* Audio Player (Read For Me) */}
                        {content.audio_url && (
                            <div className="mt-8 max-w-xl mx-auto">
                                <AudioPlayer
                                    src={content.audio_url}
                                    title="Listen to this summary"
                                />
                            </div>
                        )}
                    </header>

                    {/* Main Content - Always Deep Mode */}
                    <div className="font-serif flex-1">
                        {activeSegment ? (
                            <SegmentContent
                                key={activeSegment.id}
                                segment={activeSegment}
                                nextSegment={nextSegment}
                                isDeepMode={true}
                                onNext={handleNext}
                            />
                        ) : (
                            <div className="text-center py-20 text-muted-foreground">
                                No content available.
                            </div>
                        )}
                    </div>

                    {/* Pagination Controls */}
                    <div className="mt-12 pt-12 border-t flex items-center justify-between">
                        <button
                            onClick={handlePrev}
                            disabled={activeSegmentIndex === 0}
                            className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                        >
                            ← Previous
                        </button>
                        {/* Centered Back to Library for ease */}
                        <button
                            onClick={() => router.push("/")}
                            className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm font-medium transition-colors"
                        >
                            Back to Library
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={activeSegmentIndex === segments.length - 1}
                            className="text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                        >
                            Next →
                        </button>
                    </div>
                </div>
            </main>

            {/* Right Column: Actions (Desktop: w-80, Mobile: Hidden/Bottom Sheet?) */}
            <aside className="hidden lg:block w-80 bg-background border-l p-6 overflow-y-auto">
                <ActionsPanel />
            </aside>

            {/* Mobile Overlay for Sidebar */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Mobile Overlay for Actions */}
            {isActionsOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setIsActionsOpen(false)}
                />
            )}

            {/* Mobile Actions Slide-over */}
            <aside
                className={`
                    fixed inset-y-0 right-0 z-40 w-80 bg-background border-l transform transition-transform duration-300 ease-in-out lg:hidden
                    ${isActionsOpen ? "translate-x-0" : "translate-x-full"}
                `}
            >
                <div className="h-full flex flex-col p-6 overflow-y-auto">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-semibold">Actions & Progress</h2>
                        <button
                            onClick={() => setIsActionsOpen(false)}
                            className="p-2 -mr-2 text-muted-foreground"
                        >
                            <X className="size-5" />
                        </button>
                    </div>
                    <ActionsPanel />
                </div>
            </aside>
        </div>
    );
}
