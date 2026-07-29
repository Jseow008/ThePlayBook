"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Edit3, Highlighter, Loader2, X } from "lucide-react";
import {
    HighlightConflictError,
    useCreateHighlight,
    useUpdateHighlight,
} from "@/hooks/useHighlights";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { toast } from "sonner";
import { type HighlightColor } from "@/lib/highlight-utils";
import { MobileNoteComposer, type MobileNoteComposerContext } from "./MobileNoteComposer";
import { findSegmentElement, getTrimmedSelection } from "./selection-utils";

interface MobileSelectionActionsProps {
    contentItemId: string;
    contentTitle: string;
    sections: Array<{
        id: string;
        title: string;
    }>;
}

interface SelectionInfo {
    text: string;
    segmentId: string;
    segmentTitle: string;
    anchorStart: number;
    anchorEnd: number;
}

export function MobileSelectionActions({
    contentItemId,
    contentTitle,
    sections,
}: MobileSelectionActionsProps) {
    const [mounted, setMounted] = useState(false);
    const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
    const [isComposerOpen, setIsComposerOpen] = useState(false);
    const [draftNote, setDraftNote] = useState("");
    const [draftColor, setDraftColor] = useState<HighlightColor>("blue");
    const createHighlight = useCreateHighlight();
    const updateHighlight = useUpdateHighlight();
    const { readerTheme } = useReaderSettings();

    useEffect(() => {
        setMounted(true);
    }, []);

    const composerContext = useMemo<MobileNoteComposerContext | null>(() => {
        if (!selectionInfo) {
            return null;
        }

        return {
            title: contentTitle,
            sectionTitle: selectionInfo.segmentTitle,
            highlightedText: selectionInfo.text,
            existingNoteBody: null,
        };
    }, [contentTitle, selectionInfo]);

    useEffect(() => {
        if (!mounted || isComposerOpen) {
            return;
        }

        const handleSelectionChange = () => {
            const selection = window.getSelection();

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

            const segmentTitle = sections.find((section) => section.id === segmentId)?.title || "Saved highlight";

            setSelectionInfo({
                text: trimmedSelection.text,
                segmentId,
                segmentTitle,
                anchorStart: trimmedSelection.anchorStart,
                anchorEnd: trimmedSelection.anchorEnd,
            });
        };

        let timeout: NodeJS.Timeout;
        const debouncedHandleSelection = () => {
            clearTimeout(timeout);
            timeout = setTimeout(handleSelectionChange, 180);
        };

        document.addEventListener("selectionchange", debouncedHandleSelection);
        document.addEventListener("mouseup", debouncedHandleSelection);
        document.addEventListener("touchend", debouncedHandleSelection);
        window.addEventListener("scroll", debouncedHandleSelection, { passive: true });

        return () => {
            clearTimeout(timeout);
            document.removeEventListener("selectionchange", debouncedHandleSelection);
            document.removeEventListener("mouseup", debouncedHandleSelection);
            document.removeEventListener("touchend", debouncedHandleSelection);
            window.removeEventListener("scroll", debouncedHandleSelection);
        };
    }, [isComposerOpen, mounted, sections]);

    const clearSelectionState = () => {
        window.getSelection()?.removeAllRanges();
        setSelectionInfo(null);
        setIsComposerOpen(false);
        setDraftNote("");
        setDraftColor("blue");
    };

    const offerHighlightReplacement = (
        error: HighlightConflictError,
        selected: SelectionInfo,
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
                            clearSelectionState();
                        } catch (replacementError: any) {
                            toast.error(replacementError.message || "Failed to replace highlight");
                        }
                    })();
                },
            },
        });
    };

    const handleSaveHighlight = async () => {
        if (!selectionInfo) {
            return;
        }

        const selected = selectionInfo;

        try {
            const result = await createHighlight.mutateAsync({
                content_item_id: contentItemId,
                segment_id: selected.segmentId,
                highlighted_text: selected.text,
                anchor_start: selected.anchorStart,
                anchor_end: selected.anchorEnd,
            });

            toast.success(result.disposition === "existing" ? "Already highlighted" : "Highlight saved");
            clearSelectionState();
        } catch (error: any) {
            if (error instanceof HighlightConflictError) {
                offerHighlightReplacement(error, selected);
                return;
            }

            toast.error(error.message || "Failed to save highlight");
        }
    };

    const handleOpenComposer = () => {
        if (!selectionInfo) {
            return;
        }

        setDraftColor("blue");
        setDraftNote("");
        setIsComposerOpen(true);
        window.getSelection()?.removeAllRanges();
    };

    const handleCloseComposer = () => {
        if (createHighlight.isPending) {
            return;
        }

        clearSelectionState();
    };

    const handleSaveNote = async () => {
        if (!selectionInfo || !draftNote.trim()) {
            return;
        }

        const selected = selectionInfo;
        const trimmedNote = draftNote.trim();

        try {
            const result = await createHighlight.mutateAsync({
                content_item_id: contentItemId,
                segment_id: selected.segmentId,
                highlighted_text: selected.text,
                note_body: trimmedNote,
                color: draftColor,
                anchor_start: selected.anchorStart,
                anchor_end: selected.anchorEnd,
            });

            if (result.disposition === "existing") {
                await updateHighlight.mutateAsync({
                    id: result.highlight.id,
                    note_body: trimmedNote,
                    color: draftColor,
                });
            }

            toast.success("Highlight & note saved");
            clearSelectionState();
        } catch (error: any) {
            if (error instanceof HighlightConflictError) {
                offerHighlightReplacement(error, selected, {
                    note_body: trimmedNote,
                    color: draftColor,
                });
                return;
            }

            toast.error(error.message || "Failed to save note");
        }
    };

    if (!mounted || !selectionInfo) {
        return null;
    }

    return createPortal(
        <div className={`reader-${readerTheme} text-foreground`}>
            {!isComposerOpen && (
                <div className="fixed inset-x-0 bottom-0 z-[55] px-4 safe-area-pb-md sm:hidden">
                    <div className="rounded-3xl border border-border/80 bg-card/96 p-4 shadow-[0_-18px_48px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/78">
                                    Text selected
                                </p>
                                <p className="mt-1 line-clamp-2 text-sm leading-6 text-foreground/88 italic">
                                    &ldquo;{selectionInfo.text}&rdquo;
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={clearSelectionState}
                                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                aria-label="Dismiss selection actions"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        <div className="mt-4 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    void handleSaveHighlight();
                                }}
                                disabled={createHighlight.isPending}
                                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {createHighlight.isPending && !isComposerOpen ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Highlighter className="size-4 text-highlight-yellow" />
                                )}
                                Save highlight
                            </button>

                            <button
                                type="button"
                                onClick={handleOpenComposer}
                                disabled={createHighlight.isPending}
                                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Edit3 className="size-4" />
                                Add note
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MobileNoteComposer
                context={composerContext}
                isOpen={isComposerOpen}
                noteValue={draftNote}
                colorValue={draftColor}
                canSave={draftNote.trim().length > 0}
                isSaving={createHighlight.isPending}
                onClose={handleCloseComposer}
                onNoteChange={setDraftNote}
                onColorChange={setDraftColor}
                onClear={() => setDraftNote("")}
                onSave={() => {
                    void handleSaveNote();
                }}
            />
        </div>,
        document.body
    );
}
