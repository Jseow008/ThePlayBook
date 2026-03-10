"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { BookOpen, AlertCircle, Edit3, Trash2, Check, X, Highlighter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateHighlight, useDeleteHighlight } from "@/hooks/useHighlights";
import { toast } from "sonner";
import { HIGHLIGHT_COLOR_CLASSES, normalizeHighlightColor } from "@/lib/highlight-utils";

interface HighlightPopoverProps {
    highlightId: string;
    noteBody: string | null;
    highlightedText: string;
    currentColor: string;
    createdAt?: string;
    position: { top: number; left: number; width: number; height: number };
    portalContainer: HTMLElement;
    onClose: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const COLORS = ["yellow", "blue", "green", "red", "purple"] as const;

export function HighlightPopover({
    highlightId,
    noteBody,
    highlightedText,
    currentColor,
    position,
    portalContainer,
    onClose,
    onMouseEnter,
    onMouseLeave,
}: HighlightPopoverProps) {
    const [mounted, setMounted] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editNote, setEditNote] = useState(noteBody || "");
    const [editColor, setEditColor] = useState(normalizeHighlightColor(currentColor));
    const [localNoteBody, setLocalNoteBody] = useState(noteBody);
    const [localColor, setLocalColor] = useState(normalizeHighlightColor(currentColor));
    const updateHighlight = useUpdateHighlight();
    const deleteHighlight = useDeleteHighlight();

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const normalizedColor = normalizeHighlightColor(currentColor);
        setEditNote(noteBody || "");
        setEditColor(normalizedColor);
        setLocalNoteBody(noteBody);
        setLocalColor(normalizedColor);
        setIsEditing(false);
    }, [currentColor, highlightId, noteBody]);

    useEffect(() => {
        if (!mounted) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (!popoverRef.current) return;

            const path = event.composedPath ? (event.composedPath() as Node[]) : [];
            if (path.includes(popoverRef.current) || popoverRef.current.contains(event.target as Node)) {
                return;
            }

            if (isEditing) return;
            onClose();
        };

        const timeout = setTimeout(() => {
            window.addEventListener("click", handleClickOutside);
        }, 10);

        return () => {
            clearTimeout(timeout);
            window.removeEventListener("click", handleClickOutside);
        };
    }, [isEditing, mounted, onClose]);

    if (!mounted) return null;

    const top = position.top + window.scrollY;
    const left = position.left + window.scrollX + (position.width / 2);
    const colorClasses = HIGHLIGHT_COLOR_CLASSES[localColor];

    const handleSave = async () => {
        try {
            await updateHighlight.mutateAsync({
                id: highlightId,
                note_body: editNote.trim() === "" ? null : editNote.trim(),
                color: editColor,
            });

            setLocalNoteBody(editNote.trim() === "" ? null : editNote.trim());
            setLocalColor(editColor);
            setIsEditing(false);
            toast.success("Highlight updated");
        } catch (error: any) {
            toast.error(error.message || "Failed to update highlight");
        }
    };

    const handleDelete = async () => {
        try {
            await deleteHighlight.mutateAsync(highlightId);
            toast.success("Highlight deleted");
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete highlight");
        }
    };

    return createPortal(
        <div
            ref={popoverRef}
            onMouseEnter={onMouseEnter}
            onMouseLeave={() => {
                if (!isEditing && onMouseLeave) {
                    onMouseLeave();
                }
            }}
            className="absolute z-[100] transform -translate-x-1/2 -translate-y-full w-80 origin-bottom animate-in fade-in zoom-in-95 duration-200 pb-2.5"
            style={{ top, left }}
        >
            <div className="bg-popover/95 backdrop-blur-md text-popover-foreground rounded-xl shadow-2xl border border-border/50 overflow-hidden flex flex-col pointer-events-auto">
                {isEditing ? (
                    <div className="p-3 flex flex-col gap-3">
                        <div className={cn("rounded-lg border p-3 text-sm italic text-foreground/85", colorClasses.border)}>
                            &ldquo;{highlightedText}&rdquo;
                        </div>
                        <textarea
                            autoFocus
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="Add a note..."
                            className="w-full bg-background border border-border/50 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none custom-scrollbar"
                            rows={3}
                        />
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                                {COLORS.map((color) => (
                                    <button
                                        key={color}
                                        onClick={() => setEditColor(color)}
                                        className={cn(
                                            "w-5 h-5 rounded-full border-2 transition-all ring-offset-2 ring-offset-popover",
                                            HIGHLIGHT_COLOR_CLASSES[color].swatch,
                                            editColor === color
                                                ? "border-white shadow-sm scale-110 ring-2 ring-white/65 opacity-100"
                                                : "border-white/15 opacity-85 hover:opacity-100 hover:border-white/40"
                                        )}
                                        aria-label={`Set color to ${color}`}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setEditNote(localNoteBody || "");
                                        setEditColor(localColor);
                                        setIsEditing(false);
                                    }}
                                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                                >
                                    <X className="size-4" />
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={updateHighlight.isPending}
                                    className="px-2.5 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors inline-flex items-center gap-1"
                                >
                                    <Check className="size-3.5" />
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="px-3 py-2 flex items-center justify-between bg-muted/30">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                {localNoteBody ? (
                                    <BookOpen className="size-3.5 text-blue-500" />
                                ) : (
                                    <AlertCircle className="size-3.5 text-yellow-500" />
                                )}
                                <span>{localNoteBody ? "Your Note" : "Highlight"}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="p-1 text-muted-foreground hover:text-foreground hover:bg-border/50 rounded transition-colors"
                                    title="Edit Color or Note"
                                >
                                    <Edit3 className="size-3.5" />
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                                    title="Delete Highlight"
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </div>
                        </div>
                        <div className="p-3 flex flex-col gap-3 border-t border-border/30">
                            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                <Highlighter className={cn("size-3.5", HIGHLIGHT_COLOR_CLASSES[localColor].text)} />
                                <span>{localColor} highlight</span>
                            </div>
                            <div className={cn("rounded-lg border p-3 text-sm italic text-foreground/90", colorClasses.border)}>
                                &ldquo;{highlightedText}&rdquo;
                            </div>
                            {localNoteBody ? (
                                <div className="rounded-lg bg-muted/40 p-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                                    {localNoteBody}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No note attached to this highlight.</p>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="w-3 h-3 bg-popover/95 backdrop-blur-md border-b border-r border-border/50 absolute bottom-1 translate-y-1/2 rotate-45 transform left-1/2 -translate-x-1/2 pointer-events-none" />
        </div>,
        portalContainer
    );
}
