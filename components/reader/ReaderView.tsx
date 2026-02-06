"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Menu, X, BookOpen, Download, Share2, Layers } from "lucide-react";
import { SegmentNav } from "./SegmentNav";
import { SegmentContent } from "./SegmentContent";
import { ChecklistDisplay } from "./ChecklistDisplay";
import type { ContentItemWithSegments } from "@/types/domain";

interface ReaderViewProps {
    content: ContentItemWithSegments;
}

export function ReaderView({ content }: ReaderViewProps) {
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isActionsOpen, setIsActionsOpen] = useState(false);
    const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
    const [completedSegments, setCompletedSegments] = useState<Set<string>>(new Set());

    // Computed active segment
    const activeSegment = content.segments[activeSegmentIndex];
    const nextSegment = content.segments[activeSegmentIndex + 1];

    // Load progress from localStorage
    useEffect(() => {
        const savedProgress = localStorage.getItem(`lifebook_progress_${content.id}`);
        if (savedProgress) {
            try {
                const { lastSegmentIndex, completed } = JSON.parse(savedProgress);
                // Validate index
                if (typeof lastSegmentIndex === 'number' && lastSegmentIndex >= 0 && lastSegmentIndex < content.segments.length) {
                    setActiveSegmentIndex(lastSegmentIndex);
                }
                if (completed) {
                    setCompletedSegments(new Set(completed));
                }
            } catch (e) {
                console.error("Failed to parse progress", e);
            }
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

    // Save progress to localStorage (debounced, separate from state updates)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            localStorage.setItem(
                `lifebook_progress_${content.id}`,
                JSON.stringify({
                    completed: Array.from(completedSegments),
                    lastSegmentIndex: activeSegmentIndex,
                    lastReadAt: new Date().toISOString(),
                })
            );
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [activeSegmentIndex, content.id, completedSegments]);

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
        // Filter for checklist artifacts
        const checklists = (content.artifacts || [])
            .filter(a => a.type === "checklist")
            .map(a => ({
                id: a.id,
                type: "checklist" as const,
                payload_schema: a.payload_schema as { title: string; items: Array<{ id: string; label: string; mandatory: boolean }> },
            }));

        return (
            <div className="space-y-6 pt-6">
                {/* Interactive Learning Checklists */}
                {checklists.length > 0 && (
                    <ChecklistDisplay contentId={content.id} checklists={checklists} />
                )}

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
                    <button className="w-full flex items-center gap-3 p-3 rounded-md bg-secondary/50 text-foreground hover:bg-secondary transition-colors text-sm text-left">
                        <Share2 className="size-4" />
                        <span>Share Summary</span>
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
                <Link href="/" className="p-2 -mr-2 text-muted-foreground">
                    <X className="size-5" />
                </Link>
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
                    </header>

                    {/* Main Content - Always Deep Mode */}
                    <div className="font-serif flex-1">
                        {activeSegment ? (
                            <SegmentContent
                                segment={activeSegment}
                                nextSegment={nextSegment}
                                isDeepMode={true}
                                onNext={handleNext}
                            />
                        ) : (
                            <div className="text-center py-20 text-muted-foreground">
                                Loading content...
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
        </div>
    );
}
