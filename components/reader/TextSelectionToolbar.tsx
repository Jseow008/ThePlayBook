"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Highlighter, Edit3, X, Check } from "lucide-react";
import {
    HighlightConflictError,
    useCreateHighlight,
    useUpdateHighlight,
} from "@/hooks/useHighlights";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { findSegmentElement, getTrimmedSelection } from "./selection-utils";
import { OVERLAY_LAYER_CLASS } from "@/lib/overlay-layers";

interface TextSelectionToolbarProps {
    contentItemId: string;
}

export function TextSelectionToolbar({ contentItemId }: TextSelectionToolbarProps) {
    const [selectionInfo, setSelectionInfo] = useState<{
        text: string;
        rect: DOMRect;
        segmentId: string;
        anchorStart: number;
        anchorEnd: number;
    } | null>(null);

    const [isAddingNote, setIsAddingNote] = useState(false);
    const [noteText, setNoteText] = useState("");
    const [mounted, setMounted] = useState(false);

    const createHighlight = useCreateHighlight();
    const updateHighlight = useUpdateHighlight();

    // Prevent hydration errors by only rendering on client
    useEffect(() => {
        setMounted(true);
    }, []);

    // 1. Detect Selection
    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = window.getSelection();

            // If we're already adding a note, don't dismiss the toolbar instantly 
            // on selection change (e.g., when clicking into the input field)
            if (isAddingNote) return;

            if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) {
                setSelectionInfo(null);
                return;
            }

            const range = selection.getRangeAt(0);
            const startSegment = findSegmentElement(range.startContainer);
            const endSegment = findSegmentElement(range.endContainer);

            if (!startSegment || !endSegment || startSegment !== endSegment) {
                setSelectionInfo(null);
                return;
            }

            const segmentId = startSegment.getAttribute("data-segment-id");
            const trimmedSelection = getTrimmedSelection(range, startSegment);

            if (!segmentId || !trimmedSelection) {
                setSelectionInfo(null);
                return;
            }

            const rect = range.getBoundingClientRect();
            setSelectionInfo({
                text: trimmedSelection.text,
                rect,
                segmentId,
                anchorStart: trimmedSelection.anchorStart,
                anchorEnd: trimmedSelection.anchorEnd,
            });
        };

        // Debounce slightly to avoid aggressive layout thrashing
        let timeout: NodeJS.Timeout;
        const debouncedHandleSelection = () => {
            clearTimeout(timeout);
            timeout = setTimeout(handleSelectionChange, 150);
        };

        document.addEventListener("selectionchange", debouncedHandleSelection);

        // Also listen to mouseup and touchend for better mobile support
        document.addEventListener("mouseup", debouncedHandleSelection);
        document.addEventListener("touchend", debouncedHandleSelection);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener("selectionchange", debouncedHandleSelection);
            document.removeEventListener("mouseup", debouncedHandleSelection);
            document.removeEventListener("touchend", debouncedHandleSelection);
        };
    }, [isAddingNote]);

    if (!selectionInfo) return null;

    const clearSelection = () => {
        window.getSelection()?.removeAllRanges();
        setSelectionInfo(null);
    };

    const offerHighlightReplacement = (
        error: HighlightConflictError,
        selected: NonNullable<typeof selectionInfo>,
        updates?: { note_body?: string | null; color?: string }
    ) => {
        toast.warning("This selection overlaps an existing highlight", {
            description: "Replace the existing passage with this selection?",
            action: {
                label: "Replace",
                onClick: () => {
                    void (async () => {
                        try {
                            await updateHighlight.mutateAsync({
                                id: error.details.existingHighlightId,
                                highlighted_text: selected.text,
                                anchor_start: selected.anchorStart,
                                anchor_end: selected.anchorEnd,
                                ...updates,
                            });
                            toast.success("Highlight replaced");
                            clearSelection();
                            setNoteText("");
                            setIsAddingNote(false);
                        } catch (replacementError: any) {
                            toast.error(replacementError.message || "Failed to replace highlight");
                        }
                    })();
                },
            },
        });
    };

    const handleHighlight = async () => {
        const selected = selectionInfo;

        try {
            const result = await createHighlight.mutateAsync({
                content_item_id: contentItemId,
                segment_id: selected.segmentId,
                highlighted_text: selected.text,
                anchor_start: selected.anchorStart,
                anchor_end: selected.anchorEnd,
            });

            if (result.disposition === "existing") {
                toast.info("Already highlighted");
            } else if (localStorage.getItem('netflux_notes_fab_dismissed') === 'true') {
                toast.success("Highlight saved", {
                    action: {
                        label: "Show Notes Button",
                        onClick: () => {
                            localStorage.removeItem('netflux_notes_fab_dismissed');
                            window.dispatchEvent(new Event('netflux_notes_fab_unhide'));
                        }
                    }
                });
            } else {
                toast.success("Highlight saved");
            }

            clearSelection();
        } catch (error: any) {
            if (error instanceof HighlightConflictError) {
                offerHighlightReplacement(error, selected);
                return;
            }

            toast.error(error.message || "Failed to save highlight");
        }
    };

    const handleSaveNote = async () => {
        if (!noteText.trim()) return;
        const selected = selectionInfo;
        const trimmedNote = noteText.trim();

        try {
            const result = await createHighlight.mutateAsync({
                content_item_id: contentItemId,
                segment_id: selected.segmentId,
                highlighted_text: selected.text,
                note_body: trimmedNote,
                anchor_start: selected.anchorStart,
                anchor_end: selected.anchorEnd,
            });

            if (result.disposition === "existing") {
                await updateHighlight.mutateAsync({
                    id: result.highlight.id,
                    note_body: trimmedNote,
                });
            }

            if (localStorage.getItem('netflux_notes_fab_dismissed') === 'true') {
                toast.success("Highlight & Note saved", {
                    action: {
                        label: "Show Notes Button",
                        onClick: () => {
                            localStorage.removeItem('netflux_notes_fab_dismissed');
                            window.dispatchEvent(new Event('netflux_notes_fab_unhide'));
                        }
                    }
                });
            } else {
                toast.success("Highlight & Note saved");
            }

            // Cleanup
            setNoteText("");
            setIsAddingNote(false);
            clearSelection();
        } catch (error: any) {
            if (error instanceof HighlightConflictError) {
                offerHighlightReplacement(error, selected, { note_body: trimmedNote });
                return;
            }

            toast.error(error.message || "Failed to save note");
        }
    };

    const handleCancelNote = () => {
        setIsAddingNote(false);
        setNoteText("");
        clearSelection();
    };

    // Calculate position: centered above the selection rect
    const top = selectionInfo.rect.top + window.scrollY - 10;
    const left = selectionInfo.rect.left + selectionInfo.rect.width / 2;

    if (!mounted) return null;

    return createPortal(
        <div
            onMouseDown={(e) => {
                // Prevent focus shifting which collapses text selection and closes the toolbar
                if (!isAddingNote) {
                    e.preventDefault();
                }
            }}
            className={cn(
                "absolute flex flex-col gap-2 -translate-x-1/2 -translate-y-full rounded-xl shadow-2xl bg-zinc-900 border border-white/10 p-1.5 transition-all duration-200 animate-in fade-in zoom-in-95",
                OVERLAY_LAYER_CLASS.popover,
                isAddingNote ? "w-64" : "w-auto"
            )}
            style={{
                top: `${top}px`,
                left: `${left}px`,
            }}
        >
            {!isAddingNote ? (
                // Toolbar Mode
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleHighlight}
                        disabled={createHighlight.isPending}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Highlight text"
                    >
                        <Highlighter className="size-4 text-highlight-yellow" />
                        Highlight
                    </button>
                    <div className="w-px h-4 bg-white/20 mx-1" />
                    <button
                        onClick={() => setIsAddingNote(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Add note"
                    >
                        <Edit3 className="size-4 text-highlight-blue" />
                        Add Note
                    </button>
                </div>
            ) : (
                // Note Entry Mode
                <div className="flex flex-col gap-2 p-1">
                    <textarea
                        autoFocus
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Add your note..."
                        className="w-full bg-black/50 border border-white/10 rounded-lg p-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                        rows={3}
                    />
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={handleCancelNote}
                            className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label="Cancel note"
                        >
                            <X className="size-4" />
                        </button>
                        <button
                            onClick={handleSaveNote}
                            disabled={!noteText.trim() || createHighlight.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        >
                            <Check className="size-3.5" />
                            Save
                        </button>
                    </div>
                </div>
            )}

            {/* Little caret pointing down at the selection */}
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-900 border-b border-r border-white/10 rotate-45" />
        </div>,
        document.body
    );
}
