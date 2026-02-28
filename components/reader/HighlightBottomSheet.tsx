"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, AlertCircle, X, Edit3, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateHighlight, useDeleteHighlight } from "@/hooks/useHighlights";
import { toast } from "sonner";

interface HighlightBottomSheetProps {
    highlightId: string;
    noteBody: string | null;
    highlightedText: string;
    currentColor: string;
    createdAt?: string;
    onClose: () => void;
}

const COLORS = [
    { name: "yellow", class: "bg-highlight-yellow" },
    { name: "blue", class: "bg-highlight-blue" },
    { name: "green", class: "bg-highlight-green" },
    { name: "red", class: "bg-highlight-red" },
    { name: "purple", class: "bg-highlight-purple" },
];

export function HighlightBottomSheet({
    highlightId,
    noteBody,
    currentColor,
    createdAt,
    onClose
}: HighlightBottomSheetProps) {
    const [mounted, setMounted] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editNote, setEditNote] = useState(noteBody || "");
    const [editColor, setEditColor] = useState(currentColor || "yellow");

    const updateHighlight = useUpdateHighlight();
    const deleteHighlight = useDeleteHighlight();

    // Prevent hydration errors
    useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent background scrolling when sheet is open
    useEffect(() => {
        if (!mounted) return;

        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, [mounted]);

    if (!mounted) return null;

    const handleClose = () => {
        setIsClosing(true);
        // Wait for slide-down animation
        setTimeout(onClose, 300);
    };

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
                handleClose();
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to update highlight");
        }
    };

    const handleDelete = async () => {
        try {
            await deleteHighlight.mutateAsync(highlightId);
            toast.success("Highlight deleted");
            handleClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to delete highlight");
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col justify-end pointer-events-none sm:hidden">
            {/* Backdrop overlay */}
            <div
                className={cn(
                    "absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto transition-opacity duration-300",
                    isClosing ? "opacity-0" : "opacity-100"
                )}
                onClick={handleClose}
            />

            {/* Bottom Sheet Modal */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label={isEditing ? "Edit Highlight" : "Highlight details"}
                className={cn(
                    "bg-popover text-popover-foreground w-full rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] border-t border-border/50 relative pointer-events-auto transform transition-transform duration-300 ease-out flex flex-col max-h-[85vh]",
                    isClosing ? "translate-y-full" : "translate-y-0"
                )}
            >
                {/* Drag Handle Indicator */}
                <div onClick={handleClose} className="w-full h-6 flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing">
                    <div className="w-12 h-1.5 bg-muted rounded-full opacity-50" />
                </div>

                {isEditing ? (
                    // --- EDIT MODE ---
                    <>
                        {/* Header */}
                        <div className="px-6 pb-4 flex items-center justify-between border-b border-border/30 shrink-0">
                            <span className="text-lg font-semibold">Edit Highlight</span>
                            <button onClick={() => setIsEditing(false)} aria-label="Cancel editing" className="p-1 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted">
                                <X className="size-5" />
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="px-6 py-5 flex flex-col gap-6 overflow-y-auto custom-scrollbar flex-1">
                            {/* Color Picker */}
                            <div className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-muted-foreground">Highlight Color</span>
                                <div className="flex items-center gap-3" role="radiogroup" aria-label="Highlight colors">
                                    {COLORS.map((c) => (
                                        <button
                                            key={c.name}
                                            role="radio"
                                            aria-checked={editColor === c.name}
                                            aria-label={`Color ${c.name}`}
                                            onClick={() => setEditColor(c.name)}
                                            className={cn(
                                                "w-8 h-8 rounded-full border-2 transition-all shadow-sm",
                                                c.class,
                                                editColor === c.name ? "border-foreground scale-110 ring-2 ring-primary/20 ring-offset-2 ring-offset-background" : "border-transparent opacity-70"
                                            )}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Note Input */}
                            <div className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-muted-foreground">Note (Optional)</span>
                                <textarea
                                    autoFocus
                                    value={editNote}
                                    onChange={(e) => setEditNote(e.target.value)}
                                    placeholder="Add your thoughts about this highlight..."
                                    className="w-full bg-background border border-border/50 rounded-xl p-4 text-base focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none min-h-[120px]"
                                />
                            </div>

                        </div>

                        {/* Footer Action Area */}
                        <div className="px-6 py-4 pb-10 border-t border-border/30 bg-muted/10 shrink-0 shadow-[0_-10px_10px_rgba(0,0,0,0.02)]">
                            <button
                                onClick={handleSave}
                                disabled={updateHighlight.isPending}
                                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-14 rounded-xl font-bold text-lg transition-colors disabled:opacity-50"
                            >
                                <Check className="size-5" />
                                Save Changes
                            </button>
                        </div>
                    </>
                ) : (
                    // --- VIEW MODE ---
                    <>
                        {/* Header */}
                        <div className="px-6 pb-4 flex items-center justify-between border-b border-border/30 shrink-0">
                            <div className="flex items-center gap-2 font-semibold">
                                {noteBody ? (
                                    <BookOpen className="size-5 text-blue-500" />
                                ) : (
                                    <AlertCircle className="size-5 text-yellow-500" />
                                )}
                                <span className="text-lg">{noteBody ? 'Your Note' : 'Highlight'}</span>
                            </div>
                            {createdAt && (
                                <span className="text-xs text-muted-foreground/60">
                                    {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
                                </span>
                            )}
                        </div>

                        {/* Content Body */}
                        {noteBody && (
                            <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                                <div className="text-base text-foreground leading-relaxed whitespace-pre-wrap">
                                    {noteBody}
                                </div>
                            </div>
                        )}

                        {/* Footer Action Area */}
                        <div className="px-6 py-6 pb-10 border-t border-border/30 bg-muted/10 shrink-0 grid grid-cols-[1fr_auto] gap-3">
                            <button
                                onClick={() => setIsEditing(true)}
                                className="w-full flex items-center justify-center gap-2 bg-blue-500 text-white hover:bg-blue-600 h-12 rounded-xl font-medium transition-colors"
                            >
                                <Edit3 className="size-4" />
                                Edit Highlight
                            </button>

                            <button
                                onClick={handleDelete}
                                disabled={deleteHighlight.isPending}
                                className="w-12 h-12 flex items-center justify-center bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-xl transition-colors disabled:opacity-50"
                                aria-label="Delete Highlight"
                            >
                                <Trash2 className="size-5" />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}
