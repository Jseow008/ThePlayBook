"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_COLOR_CLASSES, type HighlightColor } from "@/lib/highlight-utils";
import { useReaderSettings } from "@/hooks/useReaderSettings";

const NOTE_EDITOR_COLORS: HighlightColor[] = ["yellow", "blue", "green", "red", "purple"];

export interface MobileNoteComposerContext {
    title: string;
    sectionTitle: string;
    highlightedText: string;
    existingNoteBody?: string | null;
}

interface MobileNoteComposerProps {
    context: MobileNoteComposerContext | null;
    isOpen: boolean;
    noteValue: string;
    colorValue: HighlightColor;
    canSave: boolean;
    isSaving: boolean;
    onClose: () => void;
    onNoteChange: (value: string) => void;
    onColorChange: (value: HighlightColor) => void;
    onClear: () => void;
    onSave: () => void;
}

export function MobileNoteComposer({
    context,
    isOpen,
    noteValue,
    colorValue,
    canSave,
    isSaving,
    onClose,
    onNoteChange,
    onColorChange,
    onClear,
    onSave,
}: MobileNoteComposerProps) {
    const [mounted, setMounted] = useState(false);
    const { readerTheme } = useReaderSettings();

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!isOpen || !mounted) {
            return;
        }

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [isOpen, mounted]);

    useEffect(() => {
        if (!isOpen || !mounted) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isSaving) {
                onClose();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, isSaving, mounted, onClose]);

    if (!mounted || !isOpen || !context) {
        return null;
    }

    const noteText = context.existingNoteBody?.trim() || "";
    const isExistingNote = noteText.length > 0;
    const colorClasses = HIGHLIGHT_COLOR_CLASSES[colorValue];
    const sectionTitle = context.sectionTitle || "Saved highlight";

    return createPortal(
        <div className={`reader-${readerTheme} text-foreground`}>
            <button
                type="button"
                aria-label="Close note composer"
                onClick={onClose}
                className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm"
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="reader-mobile-note-composer-title"
                className="fixed inset-x-0 bottom-0 z-[61] w-full rounded-t-[1.75rem] border-t border-border bg-card shadow-[0_-18px_48px_rgba(0,0,0,0.45)]"
            >
                <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border/80" />

                <div className="flex items-start justify-between gap-4 px-4 pb-4 pt-4">
                    <div className="min-w-0">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/78">
                            {isExistingNote ? "Edit note" : "Add note"}
                        </p>
                        <h2
                            id="reader-mobile-note-composer-title"
                            className="mt-1 line-clamp-1 text-lg font-semibold text-foreground"
                        >
                            {context.title || "Saved passage"}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {sectionTitle}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Close note composer"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="max-h-[78vh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className={cn("rounded-2xl border bg-background/70 p-4", colorClasses.border)}>
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/74">
                            Highlight
                        </p>
                        <p className="mt-2 text-[0.98rem] leading-7 text-foreground/92 italic">
                            &ldquo;{context.highlightedText}&rdquo;
                        </p>
                    </div>

                    <div className="mt-5">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                                Highlight color
                            </p>
                            <span className="text-xs text-muted-foreground">
                                Saved passage stays linked
                            </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {NOTE_EDITOR_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => onColorChange(color)}
                                    className={cn(
                                        "flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
                                        colorValue === color
                                            ? "border-white/15 bg-secondary text-foreground"
                                            : "border-border bg-background text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                                    )}
                                    aria-label={`Set highlight color to ${color}`}
                                    aria-pressed={colorValue === color}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn("size-2.5 rounded-full", HIGHLIGHT_COLOR_CLASSES[color].swatch)}
                                    />
                                    <span className="capitalize">{color}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-5">
                        <div className="flex items-center justify-between gap-3">
                            <label
                                htmlFor="reader-mobile-note-composer-textarea"
                                className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80"
                            >
                                Your note
                            </label>
                            <button
                                type="button"
                                onClick={onClear}
                                disabled={noteValue.length === 0}
                                className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Clear
                            </button>
                        </div>

                        <textarea
                            id="reader-mobile-note-composer-textarea"
                            autoFocus
                            value={noteValue}
                            onChange={(event) => onNoteChange(event.target.value)}
                            placeholder="Capture why this passage matters."
                            className="mt-3 min-h-36 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground/65 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                        />
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/60 bg-card/95 py-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground/84 transition-colors hover:bg-secondary hover:text-foreground"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={onSave}
                            disabled={isSaving || !canSave}
                            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                            {isExistingNote ? "Save changes" : "Save note"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
