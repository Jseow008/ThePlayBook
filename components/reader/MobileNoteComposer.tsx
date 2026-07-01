"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_COLOR_CLASSES, type HighlightColor } from "@/lib/highlight-utils";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useOverlayInteractions } from "@/hooks/useOverlayInteractions";
import { OVERLAY_LAYER_CLASS } from "@/lib/overlay-layers";

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
    const dialogRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useOverlayInteractions({
        enabled: isOpen && mounted,
        containerRef: dialogRef,
        initialFocusRef: textareaRef,
        onEscape: isSaving ? undefined : onClose,
        scrollLock: { lockDocumentElement: true },
    });

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
                className={cn(
                    "fixed inset-0 bg-black/65 backdrop-blur-sm",
                    OVERLAY_LAYER_CLASS.composerBackdrop
                )}
            />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reader-mobile-note-composer-title"
                tabIndex={-1}
                className={cn(
                    "fixed inset-x-0 bottom-0 w-full rounded-t-[1.75rem] border-t border-border bg-card shadow-[0_-18px_48px_rgba(0,0,0,0.45)]",
                    OVERLAY_LAYER_CLASS.composer
                )}
            >
                <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border/80" />

                <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
                    <div className="min-w-0">
                        <h2
                            id="reader-mobile-note-composer-title"
                            className="line-clamp-1 text-lg font-semibold text-foreground"
                        >
                            {context.title || "Saved passage"}
                        </h2>
                        <p className="mt-0.5 text-sm text-muted-foreground/78">
                            {sectionTitle}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-2 text-muted-foreground/72 transition-colors hover:bg-secondary/70 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Close note composer"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="max-h-[74vh] overflow-y-auto px-4 pb-[max(0.9rem,var(--safe-area-bottom))]">
                    <div className={cn("rounded-2xl border bg-background/60 px-4 py-3.5", colorClasses.border)}>
                        <p className="text-[0.98rem] leading-7 text-foreground/94 italic">
                            &ldquo;{context.highlightedText}&rdquo;
                        </p>
                    </div>

                    <div className="mt-4">
                        <div className="flex items-center gap-3">
                            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/64">
                                Highlight color
                            </p>
                        </div>

                        <div className="mt-2.5 flex items-center justify-start gap-2.5">
                            {NOTE_EDITOR_COLORS.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => onColorChange(color)}
                                    className={cn(
                                        "flex size-7 shrink-0 items-center justify-center rounded-full border transition-all focus:outline-none focus:ring-2 focus:ring-ring",
                                        HIGHLIGHT_COLOR_CLASSES[color].swatch,
                                        colorValue === color
                                            ? "border-white/25 shadow-[0_6px_18px_rgba(0,0,0,0.12)] ring-2 ring-foreground/20 ring-offset-2 ring-offset-background"
                                            : "border-black/5 hover:scale-[1.03]"
                                    )}
                                    aria-label={`Set highlight color to ${color}`}
                                    aria-pressed={colorValue === color}
                                    title={color[0].toUpperCase() + color.slice(1)}
                                >
                                    <span className="sr-only capitalize">{color}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className="flex items-center justify-between gap-3">
                            <label
                                htmlFor="reader-mobile-note-composer-textarea"
                                className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/64"
                            >
                                Your note
                            </label>
                            <button
                                type="button"
                                onClick={onClear}
                                disabled={noteValue.length === 0}
                                className="inline-flex min-h-8 items-center justify-center rounded-full border border-border/75 bg-background/80 px-2.5 py-1 text-[0.72rem] font-medium text-foreground/92 transition-colors hover:bg-secondary/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                Clear
                            </button>
                        </div>

                        <textarea
                            ref={textareaRef}
                            id="reader-mobile-note-composer-textarea"
                            value={noteValue}
                            onChange={(event) => onNoteChange(event.target.value)}
                            placeholder="Capture why this passage matters."
                            className="mt-2.5 min-h-36 w-full resize-none rounded-2xl border border-border/75 bg-background/88 px-4 py-3 text-sm leading-6 text-foreground shadow-inner placeholder:text-muted-foreground/60 focus:border-primary/25 focus:outline-none focus:ring-2 focus:ring-primary/35"
                        />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/35 bg-card/95 pb-2 pt-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex min-h-10 items-center justify-center rounded-full border border-border/85 px-4 py-2 text-sm font-medium text-foreground/78 transition-colors hover:bg-secondary/70 hover:text-foreground"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={onSave}
                            disabled={isSaving || !canSave}
                            className={cn(
                                "inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                                canSave && !isSaving
                                    ? "border border-primary bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(0,0,0,0.16)] hover:bg-primary/92"
                                    : "border border-border/70 bg-secondary/60 text-muted-foreground/72 disabled:cursor-not-allowed"
                            )}
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
