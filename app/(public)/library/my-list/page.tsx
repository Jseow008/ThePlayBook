"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Plus } from "lucide-react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentCard } from "@/components/ui/ContentCard";
import { LibraryToolbar } from "@/components/ui/LibraryToolbar";
import { useBatchContentItems } from "@/hooks/use-content-queries";
import {
    LIBRARY_CARD_GRID_CLASS,
    LibraryGridSkeleton,
    LibraryStatBadge,
    LibraryToolbarSkeleton,
} from "@/components/ui/LibraryLoadingStates";

/**
 * Saved Library Page
 * 
 * Shows content manually bookmarked by the user for later reading.
 */
export default function MyListPage() {
    const { myListIds, isLoaded, removeFromMyList } = useReadingProgress();

    // Filter/Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState("all");
    const [activeSort, setActiveSort] = useState<"newest" | "oldest" | "title">("newest");

    const {
        data: allItems = [],
        isError,
        isLoading,
        isSuccess,
        refetch,
    } = useBatchContentItems(myListIds, { enabled: isLoaded });
    const isPageLoading = !isLoaded || isLoading;
    const shouldShowLibraryControls = isPageLoading || allItems.length > 0;

    useEffect(() => {
        if (!isLoaded || !isSuccess || isLoading || myListIds.length === 0) return;

        const validIds = new Set(allItems.map((item) => item.id));
        const invalidIds = myListIds.filter((id) => !validIds.has(id));

        if (invalidIds.length > 0) {
            invalidIds.forEach((id) => removeFromMyList(id));
        }
    }, [allItems, isLoaded, isLoading, isSuccess, myListIds, removeFromMyList]);

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
            // For newest/oldest saved items, we rely on the order in myListIds (which is added-to-top by default)
            const indexA = myListIds.indexOf(a.id);
            const indexB = myListIds.indexOf(b.id);

            // myListIds has newest at index 0.
            // So updates are unshift.

            if (activeSort === "newest") return indexA - indexB; // Lower index = more recent
            if (activeSort === "oldest") return indexB - indexA;

            return 0;
        });

        return items;
    }, [allItems, activeFilter, searchQuery, activeSort, myListIds]);

    return (
        <div className="min-h-screen bg-background pb-8 lg:pb-24">
            <div className="max-w-7xl mx-auto px-6 lg:px-16 py-8 md:py-12">


                {/* Header */}
                <div className="flex flex-col gap-2 mb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold text-foreground font-display tracking-tight leading-tight">Saved</h1>
                        </div>

                        {/* Stats Summary - Desktop only for now to save space on mobile */}
                        {shouldShowLibraryControls && (
                            <LibraryStatBadge
                                count={allItems.length}
                                label={allItems.length === 1 ? "Saved Item" : "Saved Items"}
                                isLoading={isPageLoading}
                            />
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        Content you saved
                    </p>
                </div>

                {/* Toolbar */}
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
                                searchLabel="Search saved items"
                                searchPlaceholder="Search saved items…"
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
                                We couldn&apos;t load your saved items
                            </h2>
                            <p className="text-muted-foreground mb-8 max-w-sm">
                                Your saved items are still intact. Try again in a moment.
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
                                <Plus className="size-10 text-muted-foreground" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground mb-2">
                                Your library is empty
                            </h2>
                            <p className="text-muted-foreground mb-8 max-w-sm">
                                Save books, podcasts, articles, and videos to your library so you can easily find them later.
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
                                        showDesktopQuickActions
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
