"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { StickyNote, AlertCircle, Trash2, X, MessageSquareQuote, ArrowUpRight } from "lucide-react";
import { useDeleteHighlight, type HighlightWithContent } from "@/hooks/useHighlights";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { HIGHLIGHT_COLOR_CLASSES, normalizeHighlightColor } from "@/lib/highlight-utils";

interface NotesDrawerProps {
    highlights: HighlightWithContent[];
    isLoading: boolean;
    hasError: boolean;
    sections: Array<{
        id: string;
        title: string;
    }>;
    activeHighlightId?: string | null;
    onHighlightJump: (highlightId: string) => void | Promise<void>;
}

export function NotesDrawer({
    highlights,
    isLoading,
    hasError,
    sections,
    activeHighlightId = null,
    onHighlightJump,
}: NotesDrawerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const deleteHighlight = useDeleteHighlight();
    const [isMobile, setIsMobile] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const sectionTitleMap = useMemo(
        () => new Map(sections.map((section) => [section.id, section.title])),
        [sections]
    );

    useEffect(() => {
        setMounted(true);
        if (typeof window !== "undefined") {
            const checkMobile = () => setIsMobile(window.innerWidth < 640);
            checkMobile();
            window.addEventListener('resize', checkMobile);

            if (localStorage.getItem('flux_notes_fab_dismissed') === 'true') {
                setIsDismissed(true);
            }

            const handleUnhide = () => setIsDismissed(false);
            window.addEventListener('flux_notes_fab_unhide', handleUnhide);

            return () => {
                window.removeEventListener('resize', checkMobile);
                window.removeEventListener('flux_notes_fab_unhide', handleUnhide);
            };
        }
    }, []);

    // Handle Escape key to close drawer
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
        }
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    const handleDelete = async (id: string) => {
        try {
            await deleteHighlight.mutateAsync(id);
            toast.success("Highlight deleted");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete highlight");
        }
    };

    const handleJump = async (highlightId: string) => {
        await onHighlightJump(highlightId);
        if (isMobile) {
            setIsOpen(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <>
            {/* Floating Toggle Button */}
            {!isDismissed && (
                <motion.div
                    drag={isMobile}
                    dragMomentum={false}
                    dragElastic={0.1}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={() => {
                        // Small timeout to prevent the onClick from firing immediately after drag
                        setTimeout(() => setIsDragging(false), 100);
                    }}
                    style={{ marginBottom: 'env(safe-area-inset-bottom)', touchAction: 'none' }}
                    className="fixed bottom-24 sm:bottom-6 right-4 sm:right-6 z-40 flex flex-col items-end gap-2"
                >
                    {/* Close button - only visible on mobile */}
                    {isMobile && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsDismissed(true);
                                localStorage.setItem('flux_notes_fab_dismissed', 'true');
                                toast.success("Notes icon hidden", {
                                    action: {
                                        label: "Undo",
                                        onClick: () => {
                                            setIsDismissed(false);
                                            localStorage.removeItem('flux_notes_fab_dismissed');
                                        }
                                    }
                                });
                            }}
                            className="bg-background/80 backdrop-blur-md p-1.5 rounded-full border border-border shadow-sm text-muted-foreground hover:text-foreground transition-colors mr-1"
                            aria-label="Hide notes button"
                        >
                            <X className="size-3.5" />
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (!isDragging) setIsOpen(true);
                        }}
                        aria-label="Open notes drawer"
                        className="relative flex items-center justify-center gap-2 p-3 sm:px-4 sm:py-3 bg-primary text-primary-foreground font-semibold rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 min-w-[3rem] min-h-[3rem]"
                    >
                        <StickyNote className="size-5 shrink-0" />
                        <span className="hidden sm:inline">Notes</span>
                        {highlights && highlights.length > 0 && (
                            <span className="absolute -top-1 -right-1 sm:static sm:-top-auto sm:-right-auto flex items-center justify-center w-5 h-5 sm:ml-1 text-xs font-bold bg-destructive text-destructive-foreground rounded-full shadow-sm">
                                {highlights.length}
                            </span>
                        )}
                    </button>
                </motion.div>
            )}

            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={() => setIsOpen(false)}
            />

            {/* Slide-out Drawer */}
            <div
                className={cn(
                    "fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm sm:max-w-md bg-background border-l border-border/40 shadow-2xl transition-transform duration-500 ease-spring flex flex-col",
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border/40 bg-card/30">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <MessageSquareQuote className="size-5 text-primary" />
                        Highlights & Notes
                    </h2>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 -mr-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-full transition-colors"
                        aria-label="Close notes drawer"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
                    {isLoading ? (
                        <div className="flex flex-col gap-4 animate-pulse">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-20 rounded-xl bg-secondary/40" />
                            ))}
                        </div>
                    ) : hasError ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
                            <AlertCircle className="size-8 text-destructive/50" />
                            <p>Failed to load notes.</p>
                        </div>
                    ) : !highlights || highlights.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3">
                            <MessageSquareQuote className="size-12 text-muted-foreground/30" />
                            <p className="max-w-[200px]">
                                No highlights yet. Select any text while reading to save it here.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {highlights.map((item, index) => {
                                const color = normalizeHighlightColor(item.color);
                                const noteText = item.note_body?.trim() || null;
                                const sectionTitle = item.segment_id
                                    ? sectionTitleMap.get(item.segment_id) || "Saved passage"
                                    : "Saved passage";
                                const itemLabel = noteText ? "Note" : "Highlight";
                                const isActive = activeHighlightId === item.id;

                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            "group relative border-b border-border/25 py-1.5",
                                            index === 0 && "pt-0",
                                            index === highlights.length - 1 && "border-b-0 pb-0"
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={cn(
                                                "absolute left-0 top-3 bottom-3 w-px rounded-full transition-opacity duration-200",
                                                HIGHLIGHT_COLOR_CLASSES[color].swatch,
                                                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-70"
                                            )}
                                        />

                                        <button
                                            onClick={() => handleJump(item.id)}
                                            aria-label={`${itemLabel} ${sectionTitle}`}
                                            className={cn(
                                                "focus-ring w-full rounded-xl px-4 py-3 pr-20 text-left transition-colors duration-150",
                                                isActive
                                                    ? "bg-card/60"
                                                    : "bg-transparent hover:bg-card/35"
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span
                                                    className={cn(
                                                        "mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full",
                                                        HIGHLIGHT_COLOR_CLASSES[color].swatch
                                                    )}
                                                    aria-hidden="true"
                                                />

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-1.5 text-[0.72rem] leading-5 text-muted-foreground/85">
                                                        <span className="truncate font-medium text-foreground/72">
                                                            {sectionTitle}
                                                        </span>
                                                        <span className="text-muted-foreground/35">•</span>
                                                        <span>{itemLabel}</span>
                                                        <span className="text-muted-foreground/35">•</span>
                                                        <span
                                                            title={item.created_at
                                                                ? `Saved ${formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}`
                                                                : undefined}
                                                        >
                                                            {item.created_at
                                                                ? format(new Date(item.created_at), "MMM d, h:mm a")
                                                                : "Just now"}
                                                        </span>
                                                    </div>

                                                    <p className="mt-1.5 text-[0.98rem] leading-6 text-foreground/95 italic">
                                                        &ldquo;{item.highlighted_text}&rdquo;
                                                    </p>

                                                    {noteText && (
                                                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                                            {noteText}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </button>

                                        <div className="absolute right-2 top-2.5 flex items-center gap-0.5">
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleJump(item.id);
                                                }}
                                                className={cn(
                                                    "focus-ring rounded-md p-1.5 text-muted-foreground/45 transition-all hover:bg-secondary/60 hover:text-foreground",
                                                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                                                )}
                                                aria-label={`Jump to ${sectionTitle}`}
                                            >
                                                <ArrowUpRight className="size-3.5" />
                                            </button>

                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleDelete(item.id);
                                                }}
                                                disabled={deleteHighlight.isPending}
                                                className="focus-ring rounded-md p-1.5 text-muted-foreground/45 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                                aria-label={`Delete ${itemLabel.toLowerCase()} from ${sectionTitle}`}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>,
        document.body
    );
}
