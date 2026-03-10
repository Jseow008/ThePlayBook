"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, AlertCircle, X, Highlighter } from "lucide-react";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_COLOR_CLASSES, normalizeHighlightColor } from "@/lib/highlight-utils";

interface HighlightBottomSheetProps {
    noteBody: string | null;
    highlightedText: string;
    currentColor: string;
    createdAt?: string;
    onClose: () => void;
}

export function HighlightBottomSheet({
    noteBody,
    highlightedText,
    currentColor,
    createdAt,
    onClose,
}: HighlightBottomSheetProps) {
    const [mounted, setMounted] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const color = normalizeHighlightColor(currentColor);
    const colorClasses = HIGHLIGHT_COLOR_CLASSES[color];

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, [mounted]);

    if (!mounted) return null;

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(onClose, 300);
    };

    return createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col justify-end pointer-events-none sm:hidden">
            <div
                className={cn(
                    "absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto transition-opacity duration-300",
                    isClosing ? "opacity-0" : "opacity-100"
                )}
                onClick={handleClose}
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-label="Highlight details"
                className={cn(
                    "bg-popover text-popover-foreground w-full rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-border/50 relative pointer-events-auto transform transition-transform duration-300 ease-out flex flex-col max-h-[85vh]",
                    isClosing ? "translate-y-full" : "translate-y-0"
                )}
            >
                <div onClick={handleClose} className="w-full h-6 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing">
                    <div className="w-12 h-1.5 bg-muted rounded-full opacity-50" />
                </div>

                <div className="px-6 pb-4 flex items-center justify-between border-b border-border/30 shrink-0">
                    <div className="flex items-center gap-2 font-semibold">
                        {noteBody ? (
                            <BookOpen className="size-5 text-blue-500" />
                        ) : (
                            <AlertCircle className="size-5 text-yellow-500" />
                        )}
                        <span className="text-lg">{noteBody ? "Your Note" : "Highlight"}</span>
                    </div>
                    <button
                        onClick={handleClose}
                        aria-label="Close highlight details"
                        className="p-1 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        <Highlighter className={cn("size-3.5", colorClasses.text)} />
                        <span>{color} highlight</span>
                        {createdAt && (
                            <span className="normal-case tracking-normal text-muted-foreground/70">
                                {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
                            </span>
                        )}
                    </div>

                    <div className={cn("rounded-2xl border p-4 text-base leading-relaxed italic text-foreground", colorClasses.border)}>
                        &ldquo;{highlightedText}&rdquo;
                    </div>

                    {noteBody ? (
                        <div className="rounded-2xl bg-secondary/50 p-4 text-base leading-relaxed whitespace-pre-wrap text-foreground/90">
                            {noteBody}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            This highlight does not have a note attached.
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
