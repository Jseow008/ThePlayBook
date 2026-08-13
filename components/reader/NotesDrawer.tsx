"use client";

import { useState, useEffect, useMemo, useCallback, useRef, type TransitionEvent as ReactTransitionEvent } from "react";
import { createPortal } from "react-dom";
import { StickyNote, AlertCircle, Trash2, X, MessageSquareQuote, ArrowUpRight, Edit3 } from "lucide-react";
import { useDeleteHighlight, useUpdateHighlight, type HighlightWithContent } from "@/hooks/useHighlights";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { toast } from "sonner";
import { HIGHLIGHT_COLOR_CLASSES, normalizeHighlightColor, type HighlightColor } from "@/lib/highlight-utils";
import { MobileNoteComposer, type MobileNoteComposerContext } from "./MobileNoteComposer";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { VIEWPORT_QUERIES } from "@/lib/breakpoints";
import { useOverlayInteractions } from "@/hooks/useOverlayInteractions";
import { OVERLAY_LAYER_CLASS } from "@/lib/overlay-layers";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface NotesDrawerProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    highlights: HighlightWithContent[];
    isLoading: boolean;
    hasError: boolean;
    sections: Array<{
        id: string;
        title: string;
    }>;
    activeHighlightId?: string | null;
    isAudioMiniPlayerVisible?: boolean;
    onHighlightJump: (highlightId: string) => void | Promise<void>;
}

export function NotesDrawer({
    isOpen,
    onOpenChange,
    highlights,
    isLoading,
    hasError,
    sections,
    activeHighlightId = null,
    isAudioMiniPlayerVisible = false,
    onHighlightJump,
}: NotesDrawerProps) {
    const [mounted, setMounted] = useState(false);
    const drawerPanelRef = useRef<HTMLDivElement>(null);
    const openerButtonRef = useRef<HTMLButtonElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const activeRowScrollTimeoutRef = useRef<number | null>(null);
    const deleteHighlight = useDeleteHighlight();
    const updateHighlight = useUpdateHighlight();
    const isCompactReaderControls = useMediaQuery(VIEWPORT_QUERIES.compactReaderControls);
    const prefersReducedMotion = usePrefersReducedMotion();
    const [editingHighlight, setEditingHighlight] = useState<HighlightWithContent | null>(null);
    const [draftNote, setDraftNote] = useState("");
    const [draftColor, setDraftColor] = useState<HighlightColor>("yellow");
    const sectionTitleMap = useMemo(
        () => new Map(sections.map((section) => [section.id, section.title])),
        [sections]
    );

    const hasDraftChanges = useMemo(() => {
        if (!editingHighlight) {
            return false;
        }

        const originalNote = editingHighlight.note_body?.trim() || "";
        const originalColor = normalizeHighlightColor(editingHighlight.color);
        return draftNote.trim() !== originalNote || draftColor !== originalColor;
    }, [draftColor, draftNote, editingHighlight]);

    const composerContext = useMemo<MobileNoteComposerContext | null>(() => {
        if (!editingHighlight) {
            return null;
        }

        return {
            title: editingHighlight.content_item?.title || "Saved passage",
            sectionTitle: editingHighlight.segment?.title?.trim() || "Saved highlight",
            highlightedText: editingHighlight.highlighted_text,
            existingNoteBody: editingHighlight.note_body,
        };
    }, [editingHighlight]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useOverlayInteractions({
        enabled: isOpen && editingHighlight === null,
        containerRef: drawerPanelRef,
        initialFocusRef: closeButtonRef,
        restoreFocusRef: openerButtonRef,
        onEscape: () => onOpenChange(false),
        scrollLock: true,
    });

    useEffect(() => {
        if (!isOpen) {
            setEditingHighlight(null);
        }
    }, [isOpen]);

    const scrollActiveHighlightIntoView = useCallback(() => {
        if (!activeHighlightId) {
            return;
        }

        const row = drawerPanelRef.current?.querySelector<HTMLElement>(
            `[data-highlight-id="${activeHighlightId}"]`
        );
        row?.scrollIntoView?.({
            block: "center",
            behavior: prefersReducedMotion ? "auto" : "smooth",
        });
    }, [activeHighlightId, prefersReducedMotion]);

    useEffect(() => {
        if (!isOpen || !activeHighlightId) {
            return;
        }

        if (activeRowScrollTimeoutRef.current !== null) {
            window.clearTimeout(activeRowScrollTimeoutRef.current);
        }

        activeRowScrollTimeoutRef.current = window.setTimeout(() => {
            activeRowScrollTimeoutRef.current = null;
            scrollActiveHighlightIntoView();
        }, 550);

        return () => {
            if (activeRowScrollTimeoutRef.current !== null) {
                window.clearTimeout(activeRowScrollTimeoutRef.current);
                activeRowScrollTimeoutRef.current = null;
            }
        };
    }, [activeHighlightId, isOpen, scrollActiveHighlightIntoView]);

    const handlePanelTransitionEnd = (event: ReactTransitionEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget || !isOpen) {
            return;
        }

        if (activeRowScrollTimeoutRef.current !== null) {
            window.clearTimeout(activeRowScrollTimeoutRef.current);
            activeRowScrollTimeoutRef.current = null;
        }

        scrollActiveHighlightIntoView();
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteHighlight.mutateAsync(id);
            toast.success("Highlight deleted");
        } catch (error: any) {
            toast.error(error.message || "Failed to delete highlight");
        }
    };

    const handleJump = (highlightId: string) => {
        onOpenChange(false);
        void onHighlightJump(highlightId);
    };

    const handleOpenComposer = (item: HighlightWithContent) => {
        setEditingHighlight(item);
        setDraftNote(item.note_body?.trim() || "");
        setDraftColor(normalizeHighlightColor(item.color));
    };

    const handleCloseComposer = () => {
        if (updateHighlight.isPending) {
            return;
        }

        setEditingHighlight(null);
    };

    const handleSaveComposer = async () => {
        if (!editingHighlight || !hasDraftChanges) {
            return;
        }

        const trimmedNote = draftNote.trim();
        const hadNote = Boolean(editingHighlight.note_body?.trim());

        try {
            await updateHighlight.mutateAsync({
                id: editingHighlight.id,
                note_body: trimmedNote === "" ? null : trimmedNote,
                color: draftColor,
            });

            if (!hadNote && trimmedNote.length > 0) {
                captureAnalyticsEvent("note_created", {
                    content_id: editingHighlight.content_item_id,
                    highlight_id: editingHighlight.id,
                    note_length: trimmedNote.length,
                    route: "NotesDrawer",
                    user_state: "authenticated",
                });
            }

            setEditingHighlight(null);

            if (trimmedNote === "") {
                toast.success(hadNote ? "Note removed" : "Highlight updated");
                return;
            }

            toast.success(hadNote ? "Note updated" : "Note added");
        } catch (error: any) {
            toast.error(error.message || "Failed to save note");
        }
    };

    if (!mounted) return null;

    return createPortal(
        <>
            {/* Floating Toggle Button */}
            <div
                style={{ touchAction: 'none' }}
                className={cn(
                    "notes-drawer-motion-anchor fixed right-4 flex flex-col items-end gap-2 transition-[bottom] duration-300 motion-reduce:transition-none sm:right-6",
                    OVERLAY_LAYER_CLASS.shell,
                    // The larger offset clears the audio mini-player when it is visible.
                    isAudioMiniPlayerVisible
                        ? "bottom-[calc(8.5rem+var(--safe-area-bottom))] sm:bottom-24"
                        : "bottom-[calc(2rem+var(--safe-area-bottom))] sm:bottom-6"
                )}
            >
                <button
                    ref={openerButtonRef}
                    onClick={() => {
                        onOpenChange(true);
                    }}
                    aria-label="Open notes drawer"
                    className="notes-drawer-motion-opener relative flex min-h-[3rem] min-w-[3rem] items-center justify-center gap-2 rounded-full bg-primary p-3 font-semibold text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:px-4 sm:py-3"
                >
                    <StickyNote className="size-5 shrink-0" />
                    <span className="hidden sm:inline">Notes</span>
                    {highlights && highlights.length > 0 && (
                        <span className="absolute -top-1 -right-1 sm:static sm:-top-auto sm:-right-auto flex items-center justify-center w-5 h-5 sm:ml-1 text-xs font-bold bg-destructive text-destructive-foreground rounded-full shadow-sm">
                            {highlights.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Backdrop */}
            <div
                className={cn(
                    "notes-drawer-motion-backdrop fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none",
                    OVERLAY_LAYER_CLASS.drawer,
                    isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                onClick={() => onOpenChange(false)}
            />

            {/* Slide-out Drawer */}
            <div
                ref={drawerPanelRef}
                data-testid="reader-notes-drawer"
                data-state={isOpen ? "open" : "closed"}
                role="dialog"
                aria-modal="true"
                aria-labelledby="reader-notes-drawer-title"
                aria-hidden={!isOpen}
                inert={!isOpen}
                tabIndex={-1}
                onTransitionEnd={handlePanelTransitionEnd}
                className={cn(
                    "notes-drawer-motion-panel fixed top-0 right-0 bottom-0 flex w-full max-w-sm flex-col border-l border-border/40 bg-background shadow-2xl transition-transform duration-500 ease-spring motion-reduce:transition-none sm:max-w-md",
                    OVERLAY_LAYER_CLASS.drawer,
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-border/40 bg-card/30">
                    <h2 id="reader-notes-drawer-title" className="text-lg font-bold flex items-center gap-2">
                        <MessageSquareQuote className="size-5 text-primary" />
                        Highlights & Notes
                    </h2>
                    <button
                        ref={closeButtonRef}
                        onClick={() => onOpenChange(false)}
                        className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:size-9"
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
                                            "group relative border-b border-border/15 py-1",
                                            index === 0 && "pt-0",
                                            index === highlights.length - 1 && "border-b-0 pb-0"
                                        )}
                                    >
                                        <button
                                            data-highlight-id={item.id}
                                            data-highlight-row="true"
                                            data-active={isActive ? "true" : "false"}
                                            onClick={() => handleJump(item.id)}
                                            aria-label={`${itemLabel} ${sectionTitle}`}
                                            className={cn(
                                                "focus-ring relative w-full rounded-lg pl-5 py-2.5 text-left transition-colors duration-150",
                                                isCompactReaderControls ? "pr-28" : "pr-14",
                                                isActive
                                                    ? "bg-card/50"
                                                    : "bg-card/[0.14] hover:bg-card/[0.28]"
                                            )}
                                        >
                                            <span
                                                data-highlight-rail="true"
                                                aria-hidden="true"
                                                className={cn(
                                                    "absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full transition-opacity duration-150",
                                                    HIGHLIGHT_COLOR_CLASSES[color].swatch,
                                                    isActive ? "opacity-100" : "opacity-85 group-hover:opacity-100"
                                                )}
                                            />

                                            <div className="min-w-0">
                                                <div className="flex min-w-0 items-center gap-2 pr-6 text-[0.72rem] leading-5 text-muted-foreground/70">
                                                    <span className="min-w-0 truncate font-medium text-foreground/82">
                                                        {sectionTitle}
                                                    </span>
                                                    <span className="shrink-0 text-muted-foreground/30">•</span>
                                                    <span className="shrink-0 text-muted-foreground/62">{itemLabel}</span>
                                                    <span className="shrink-0 text-muted-foreground/30">•</span>
                                                    <span
                                                        className="shrink-0 text-muted-foreground/56"
                                                        title={item.created_at
                                                            ? `Saved ${formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}`
                                                            : undefined}
                                                    >
                                                        {item.created_at
                                                            ? format(new Date(item.created_at), "MMM d, h:mm a")
                                                            : "Just now"}
                                                    </span>
                                                </div>

                                                <p
                                                    data-highlight-quote="true"
                                                    className="mt-1 max-w-[31ch] text-[0.94rem] leading-[1.7] text-foreground/96 italic"
                                                >
                                                    &ldquo;{item.highlighted_text}&rdquo;
                                                </p>

                                                {noteText && (
                                                    <p className="mt-1 whitespace-pre-wrap text-[0.86rem] leading-5 text-muted-foreground/78">
                                                        {noteText}
                                                    </p>
                                                )}
                                            </div>
                                        </button>

                                        <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                                            {isCompactReaderControls && (
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleOpenComposer(item);
                                                    }}
                                                    className="focus-ring inline-flex min-h-8 items-center gap-1 rounded-full border border-border/70 bg-background/72 px-2.5 py-1 text-[0.68rem] font-medium text-foreground/82 transition-colors hover:bg-secondary/70 hover:text-foreground"
                                                    aria-label={noteText ? `Edit note for ${sectionTitle}` : `Add note for ${sectionTitle}`}
                                                >
                                                    <Edit3 className="size-3" />
                                                    <span>{noteText ? "Edit" : "Add"}</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleJump(item.id);
                                                }}
                                                className={cn(
                                                    "focus-ring rounded-md p-1.5 text-muted-foreground/38 transition-all hover:bg-secondary/45 hover:text-foreground/85",
                                                    isActive ? "opacity-85" : "opacity-50 group-hover:opacity-85 focus-visible:opacity-85"
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
                                                className="focus-ring rounded-md p-1.5 text-muted-foreground/38 transition-colors hover:bg-destructive/10 hover:text-destructive"
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

                <MobileNoteComposer
                    context={composerContext}
                    isOpen={Boolean(editingHighlight)}
                    noteValue={draftNote}
                    colorValue={draftColor}
                    canSave={hasDraftChanges}
                    isSaving={updateHighlight.isPending}
                    onClose={handleCloseComposer}
                    onNoteChange={setDraftNote}
                    onColorChange={setDraftColor}
                    onClear={() => setDraftNote("")}
                    onSave={() => {
                        void handleSaveComposer();
                    }}
                />
            </div>
        </>,
        document.body
    );
}
