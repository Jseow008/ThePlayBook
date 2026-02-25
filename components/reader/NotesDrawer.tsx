"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { StickyNote, AlertCircle, Trash2, X, MessageSquareQuote } from "lucide-react";
import { useHighlights, useDeleteHighlight } from "@/hooks/useHighlights";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NotesDrawerProps {
    contentItemId: string;
}

export function NotesDrawer({ contentItemId }: NotesDrawerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const { data: highlights, isLoading, error } = useHighlights(contentItemId);
    const deleteHighlight = useDeleteHighlight();

    useEffect(() => {
        setMounted(true);
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

    if (!mounted) return null;

    return createPortal(
        <>
            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsOpen(true)}
                style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
                className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-40 flex items-center justify-center gap-2 p-3 sm:px-4 sm:py-3 bg-primary text-primary-foreground font-semibold rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:-translate-y-1 hover:shadow-xl transition-all duration-300 min-w-[3rem] min-h-[3rem]"
            >
                <StickyNote className="size-5 shrink-0" />
                <span className="hidden sm:inline">Notes</span>
                {highlights && highlights.length > 0 && (
                    <span className="absolute -top-1 -right-1 sm:static sm:-top-auto sm:-right-auto flex items-center justify-center w-5 h-5 sm:ml-1 text-xs font-bold bg-white text-primary rounded-full shadow-sm">
                        {highlights.length}
                    </span>
                )}
            </button>

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
                                <div key={i} className="h-32 bg-secondary/50 rounded-xl" />
                            ))}
                        </div>
                    ) : error ? (
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
                        <div className="flex flex-col gap-5">
                            {highlights.map((item) => (
                                <div
                                    key={item.id}
                                    className="group relative flex flex-col gap-3 p-4 rounded-xl bg-card border border-border/40 hover:border-border transition-colors"
                                >
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleDelete(item.id);
                                        }}
                                        disabled={deleteHighlight.isPending}
                                        className="absolute top-2 right-2 p-2.5 z-10 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-md transition-all focus-ring"
                                        aria-label="Delete highlight"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>

                                    {/* The Highlight */}
                                    <div className="relative pl-3 border-l-2 border-yellow-500/50 pr-6">
                                        <p className="text-[0.95rem] leading-relaxed text-foreground/90 italic">
                                            &ldquo;{item.highlighted_text}&rdquo;
                                        </p>
                                    </div>

                                    {/* The Note */}
                                    {item.note_body && (
                                        <div className="mt-1 p-3 rounded-lg bg-secondary/50 text-sm leading-relaxed text-foreground/80">
                                            {item.note_body}
                                        </div>
                                    )}

                                    <div className="text-[0.7rem] font-medium text-muted-foreground uppercase tracking-wider mt-1">
                                        {formatDistanceToNow(new Date(item.created_at || ""), { addSuffix: true })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>,
        document.body
    );
}
