"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertCircle, Trophy } from "lucide-react";
import { toast } from "sonner";
import { LibraryToolbar } from "@/components/ui/LibraryToolbar";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useOverlayInteractions } from "@/hooks/useOverlayInteractions";
import { ContentCard } from "@/components/ui/ContentCard";
import { useBatchContentItems } from "@/hooks/use-content-queries";
import { cn } from "@/lib/utils";
import { OVERLAY_LAYER_CLASS } from "@/lib/overlay-layers";
import {
    LIBRARY_CARD_GRID_CLASS,
    LibraryGridSkeleton,
    LibraryStatBadge,
    LibraryToolbarSkeleton,
} from "@/components/ui/LibraryLoadingStates";

function parseCompletedTime(value: string | null | undefined) {
    if (!value) return 0;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Completed Page
 * 
 * Shows all items the user has finished reading with search, filter, and sort capabilities.
 */
export default function CompletedPage() {
    const {
        archiveFromProgressList,
        completedIds,
        getProgress,
        isLoaded,
        removeFromHistory,
        removeFromProgress,
        restoreProgressListArchive,
    } = useReadingProgress();

    // Filter/Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'book' | 'podcast' | 'article'
    const [activeSort, setActiveSort] = useState<"newest" | "oldest" | "title">("newest");
    const [pendingHistoryRemoval, setPendingHistoryRemoval] = useState<string | null>(null);
    const [shouldDeleteNotes, setShouldDeleteNotes] = useState(false);
    const [isRemovingHistory, setIsRemovingHistory] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const historyDialogRef = useRef<HTMLDivElement | null>(null);

    const {
        data: allItems = [],
        isError,
        isLoading,
        isSuccess,
        refetch,
    } = useBatchContentItems(completedIds, { enabled: isLoaded });
    const isPageLoading = !isLoaded || isLoading;
    const shouldShowLibraryControls = isPageLoading || allItems.length > 0;

    useEffect(() => {
        if (!isLoaded || !isSuccess || isLoading || completedIds.length === 0) return;

        const validIds = new Set(allItems.map((item) => item.id));
        const invalidIds = completedIds.filter((id) => !validIds.has(id));

        if (invalidIds.length > 0) {
            invalidIds.forEach((id) => removeFromProgress(id));
        }
    }, [allItems, completedIds, isLoaded, isLoading, isSuccess, removeFromProgress]);

    // Apply Filters & Sort
    const filteredItems = useMemo(() => {
        let items = [...allItems];

        // 1. Filter by Type
        if (activeFilter !== "all") {
            items = items.filter(item => item.type === activeFilter);
        }

        // 2. Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            items = items.filter(item =>
                item.title.toLowerCase().includes(query) ||
                (item.author && item.author.toLowerCase().includes(query))
            );
        }

        // 3. Sort
        items.sort((a, b) => {
            if (activeSort === "title") {
                return a.title.localeCompare(b.title);
            }
            const completedAtA = getProgress(a.id)?.completedAt;
            const completedAtB = getProgress(b.id)?.completedAt;
            if (completedAtA || completedAtB) {
                const timeA = parseCompletedTime(completedAtA);
                const timeB = parseCompletedTime(completedAtB);
                if (activeSort === "newest") return timeB - timeA;
                if (activeSort === "oldest") return timeA - timeB;
            }

            const indexA = completedIds.indexOf(a.id);
            const indexB = completedIds.indexOf(b.id);

            if (activeSort === "newest") return indexA - indexB; // Lower index = more recent (sorted desc in hook)
            if (activeSort === "oldest") return indexB - indexA;

            return 0;
        });

        return items;
    }, [allItems, activeFilter, searchQuery, activeSort, completedIds, getProgress]);

    const pendingRemovalItem = useMemo(
        () => allItems.find((item) => item.id === pendingHistoryRemoval) ?? null,
        [allItems, pendingHistoryRemoval],
    );

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const closeHistoryRemovalDialog = useCallback(() => {
        if (isRemovingHistory) return;

        setPendingHistoryRemoval(null);
        setShouldDeleteNotes(false);
    }, [isRemovingHistory]);

    useOverlayInteractions({
        enabled: pendingRemovalItem !== null,
        containerRef: historyDialogRef,
        onEscape: isRemovingHistory ? undefined : closeHistoryRemovalDialog,
        scrollLock: true,
    });

    const confirmHistoryRemoval = useCallback(() => {
        if (!pendingRemovalItem) return;

        setIsRemovingHistory(true);

        void removeFromHistory(pendingRemovalItem.id, {
            deleteNotesAndHighlights: shouldDeleteNotes,
        })
            .then((didSync) => {
                if (didSync) {
                    toast.success(
                        shouldDeleteNotes
                            ? "Removed from history and deleted notes"
                            : "Removed from history"
                    );
                    return;
                }

                toast.error("Removed locally. Some history updates may sync later.");
            })
            .finally(() => {
                setIsRemovingHistory(false);
                setPendingHistoryRemoval(null);
                setShouldDeleteNotes(false);
            });
    }, [pendingRemovalItem, removeFromHistory, shouldDeleteNotes]);

    const historyRemovalDialog = pendingRemovalItem && isMounted
        ? createPortal(
            <div
                className={cn(
                    "fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm",
                    OVERLAY_LAYER_CLASS.dialog
                )}
                role="presentation"
                onClick={(event) => {
                    if (event.target === event.currentTarget) {
                        closeHistoryRemovalDialog();
                    }
                }}
            >
                <div
                    ref={historyDialogRef}
                    className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-md border border-border bg-card p-5 shadow-2xl outline-none"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="remove-history-title"
                    aria-describedby="remove-history-description"
                    tabIndex={-1}
                >
                    <div className="space-y-2">
                        <h2 id="remove-history-title" className="text-lg font-semibold text-foreground">
                            Remove from history?
                        </h2>
                        <p id="remove-history-description" className="text-sm leading-6 text-muted-foreground">
                            This removes <span className="font-medium text-foreground">{pendingRemovalItem.title}</span> from your reading history and updates completed count, stats, streaks, and recommendations.
                        </p>
                    </div>

                    <label className="mt-5 flex items-start gap-3 rounded-md border border-border/70 bg-secondary/20 p-3 text-sm text-foreground">
                        <input
                            type="checkbox"
                            checked={shouldDeleteNotes}
                            onChange={(event) => setShouldDeleteNotes(event.target.checked)}
                            className="mt-1 size-4 rounded border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span>
                            <span className="block font-medium">Also delete notes and highlights</span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                This permanently removes saved highlights and written notes for this content.
                            </span>
                        </span>
                    </label>

                    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={closeHistoryRemovalDialog}
                            disabled={isRemovingHistory}
                            className="touch-target-44 inline-flex h-10 items-center justify-center rounded-full border border-border/70 bg-secondary/30 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={confirmHistoryRemoval}
                            disabled={isRemovingHistory}
                            className="touch-target-44 inline-flex h-10 items-center justify-center rounded-full bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isRemovingHistory ? "Removing..." : "Remove from history"}
                        </button>
                    </div>
                </div>
            </div>,
            document.body,
        )
        : null;

    return (
        <div className="min-h-screen bg-background pb-20">
            <div className="max-w-7xl mx-auto px-6 lg:px-16 py-8 md:py-12">


                {/* Header */}
                <div className="flex flex-col gap-2 mb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight">Completed</h1>
                        </div>

                        {/* Stats Summary */}
                        {shouldShowLibraryControls && (
                            <LibraryStatBadge
                                count={allItems.length}
                                label={allItems.length === 1 ? "Completed Item" : "Completed Items"}
                                isLoading={isPageLoading}
                            />
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        Your knowledge milestones
                    </p>
                </div>

                {/* Controls Toolbar */}
                {shouldShowLibraryControls && (
                    <div className="mb-8">
                        {isPageLoading ? (
                            <LibraryToolbarSkeleton className="w-full" />
                        ) : (
                            <LibraryToolbar
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                activeFilter={activeFilter}
                                onFilterChange={setActiveFilter}
                                activeSort={activeSort}
                                onSortChange={setActiveSort}
                                searchLabel="Search completed items"
                                searchPlaceholder="Search completed items…"
                                className="w-full"
                            />
                        )}
                    </div>
                )}

                {/* Content */}
                <div>
                    {isPageLoading ? (
                        <LibraryGridSkeleton />
                    ) : isError && allItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border/50 rounded-2xl bg-secondary/5">
                            <div className="inline-flex items-center justify-center p-6 bg-secondary/30 rounded-full mb-6 border border-border/70">
                                <AlertCircle className="size-10 text-muted-foreground" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground mb-2">
                                We couldn&apos;t load your completed items
                            </h2>
                            <p className="text-muted-foreground mb-8 max-w-sm">
                                Your completion history is still saved. Try again in a moment.
                            </p>
                            <button
                                onClick={() => { void refetch(); }}
                                className="inline-flex items-center h-11 px-6 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                                Retry
                            </button>
                        </div>
                    ) : allItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border/50 rounded-2xl bg-secondary/5">
                            <div className="inline-flex items-center justify-center p-6 bg-secondary/30 rounded-full mb-6 border border-border/70">
                                <Trophy className="size-10 text-muted-foreground" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground mb-2">
                                No completed content yet
                            </h2>
                            <p className="text-muted-foreground mb-8 max-w-sm">
                                Finish your first summary to see it appear here.
                            </p>
                            <Link
                                href="/browse"
                                className="inline-flex items-center h-11 px-6 rounded-full bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                                Browse Library
                            </Link>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-muted-foreground">No items match your search.</p>
                            <button
                                onClick={() => { setSearchQuery(""); setActiveFilter("all"); }}
                                className="mt-3 inline-flex h-9 items-center rounded-full border border-border/70 bg-secondary/30 px-4 text-sm text-foreground hover:bg-secondary/50 transition-colors"
                            >
                                Clear filters
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 flex items-center justify-between">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Showing {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
                                </p>
                            </div>

                            <div className={LIBRARY_CARD_GRID_CLASS}>
                                {filteredItems.map((item) => (
                                    <ContentCard
                                        key={item.id}
                                        item={item}
                                        titleDensity="app-compact"
                                        showCompletedBadge
                                        showDesktopQuickActions
                                        removeIcon="archive"
                                        removeLabel="Hide from Completed"
                                        secondaryRemoveLabel="Remove from reading history"
                                        onSecondaryRemove={(id) => {
                                            setPendingHistoryRemoval(id);
                                            setShouldDeleteNotes(false);
                                        }}
                                        onRemove={(id) => {
                                            archiveFromProgressList(id, "completed");
                                            toast.success("Archived from List", {
                                                action: {
                                                    label: "Undo",
                                                    onClick: () => restoreProgressListArchive(id, "completed"),
                                                },
                                            });
                                        }}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {historyRemovalDialog}
        </div>
    );
}
