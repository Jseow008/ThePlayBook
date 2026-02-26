"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { BookOpen, AlertCircle, Edit3, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateHighlight, useDeleteHighlight } from "@/hooks/useHighlights";
import { toast } from "sonner";

interface HighlightPopoverProps {
    highlightId: string;
    noteBody: string | null;
    highlightedText: string;
    currentColor: string;
    createdAt?: string;
    position: { top: number; left: number; width: number; height: number };
    onClose: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

const COLORS = [
    { name: "yellow", class: "bg-highlight-yellow" },
    { name: "blue", class: "bg-highlight-blue" },
    { name: "green", class: "bg-highlight-green" },
    { name: "red", class: "bg-highlight-red" },
    { name: "purple", class: "bg-highlight-purple" },
];

export function HighlightPopover({
    highlightId,
    noteBody,
    currentColor,
    position,
    onClose,
    onMouseEnter,
    onMouseLeave
}: HighlightPopoverProps) {
    const [mounted, setMounted] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    const [isEditing, setIsEditing] = useState(false);
    const [editNote, setEditNote] = useState(noteBody || "");
    const [editColor, setEditColor] = useState(currentColor || "yellow");

    const updateHighlight = useUpdateHighlight();
    const deleteHighlight = useDeleteHighlight();

    // Prevent hydration errors
    useEffect(() => {
        setMounted(true);
    }, []);

    // Global click-outside listener to close popover
    useEffect(() => {
        if (!mounted) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (!popoverRef.current) return;
            const path = e.composedPath ? (e.composedPath() as Node[]) : [];
            if (path.includes(popoverRef.current) || popoverRef.current.contains(e.target as Node)) {
                return;
            }
            onClose();
        };

        const timeout = setTimeout(() => {
            window.addEventListener('click', handleClickOutside);
        }, 10);

        return () => {
            clearTimeout(timeout);
            window.removeEventListener('click', handleClickOutside);
        };
    }, [mounted, onClose]);

    if (!mounted || !position) return null;

    const top = position.top + window.scrollY;
    const left = position.left + window.scrollX + (position.width / 2);

    const handleSave = async () => {
        try {
            await updateHighlight.mutateAsync({
                id: highlightId,
                note_body: editNote.trim() === "" ? null : editNote.trim(),
                color: editColor,
            });
            toast.success("Highlight updated");
            setIsEditing(false);
            if (editNote.trim() === "") {
                onClose();
            }
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
            onMouseLeave={onMouseLeave}
            className="absolute z-[100] transform -translate-x-1/2 -translate-y-full w-72 origin-bottom animate-in fade-in zoom-in-95 duration-200 pb-2.5"
            style={{ top, left }}
        >
            <div className="bg-popover/95 backdrop-blur-md text-popover-foreground rounded-xl shadow-2xl border border-border/50 overflow-hidden flex flex-col pointer-events-auto">
                {isEditing ? (
                    <div className="p-3 flex flex-col gap-3">
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
                                {COLORS.map((c) => (
                                    <button
                                        key={c.name}
                                        onClick={() => setEditColor(c.name)}
                                        className={cn(
                                            "w-5 h-5 rounded-full border-2 transition-all",
                                            c.class,
                                            editColor === c.name ? "border-foreground shadow-sm scale-110" : "border-transparent opacity-50 hover:opacity-100"
                                        )}
                                        aria-label={`Set color to ${c.name}`}
                                    />
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setEditNote(noteBody || "");
                                        setEditColor(currentColor || "yellow");
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
                                {noteBody ? (
                                    <BookOpen className="size-3.5 text-blue-500" />
                                ) : (
                                    <AlertCircle className="size-3.5 text-yellow-500" />
                                )}
                                <span>{noteBody ? 'Your Note' : 'Highlight'}</span>
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
                        {noteBody && (
                            <div className="p-3 text-sm flex flex-col gap-2 max-h-48 overflow-y-auto custom-scrollbar border-t border-border/30">
                                <div className="font-medium text-foreground leading-relaxed whitespace-pre-wrap">
                                    {noteBody}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* The little pointer arrow */}
            <div className="w-3 h-3 bg-popover/95 backdrop-blur-md border-b border-r border-border/50 absolute bottom-1 translate-y-1/2 rotate-45 transform left-1/2 -translate-x-1/2 pointer-events-none" />
        </div>,
        document.body
    );
}
