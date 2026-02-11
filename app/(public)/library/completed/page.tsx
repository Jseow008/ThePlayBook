"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Trophy } from "lucide-react";
import { LibraryToolbar } from "@/components/ui/LibraryToolbar";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentCard } from "@/components/ui/ContentCard";
import type { ContentItem } from "@/types/database";

/**
 * Filter and Sort Controls
 */
// Since I don't have LibraryToolbar.tsx yet (Wait, I just created it!), I'll define a simple local version if the import fails, 
// but assuming the previous step worked, let's use it.
// Actually, let's include the Toolbar logic directly here to be safe and robust if the file creation failed or I want to customize it heavily.
// But better to use the component for reusability. Let's assume the previous step succeeded.

/**
 * Completed Page
 * 
 * Shows all items the user has finished reading with search, filter, and sort capabilities.
 */
export default function CompletedPage() {
    const { completedIds, isLoaded, refresh, removeFromProgress } = useReadingProgress();
    const [allItems, setAllItems] = useState<ContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filter/Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'book' | 'podcast' | 'article'
    const [activeSort, setActiveSort] = useState<"newest" | "oldest" | "title">("newest");

    useEffect(() => {
        if (!isLoaded) return;

        if (completedIds.length === 0) {
            setIsLoading(false);
            setAllItems([]);
            return;
        }

        // Fetch content items for the completed IDs
        const fetchItems = async () => {
            try {
                const response = await fetch("/api/content/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: completedIds }),
                });

                if (response.ok) {
                    const data: ContentItem[] = await response.json();

                    // Identify items that are in localStorage but not in the DB
                    const validIds = new Set(data.map(item => item.id));
                    const invalidIds = completedIds.filter(id => !validIds.has(id));

                    // Self-healing: Remove invalid entries from localStorage
                    if (invalidIds.length > 0) {
                        console.log("Cleaning up invalid completed items:", invalidIds);
                        invalidIds.forEach(id => {
                            localStorage.removeItem(`flux_progress_${id}`);
                        });
                        refresh();
                    }

                    // Store all items (client-side filtering is fast for <1000 items)
                    setAllItems(data);
                }
            } catch (error) {
                console.error("Failed to fetch items:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();
    }, [completedIds, isLoaded, refresh]);

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
            // For newest/oldest, we rely on the original 'completedIds' order which is by completion time (recency)
            // But 'allItems' from API doesn't guarantee order. We should ideally store completion timestamps.
            // Since `useReadingProgress` sorts by `lastReadAt`, we can use the index in `completedIds` as a proxy for recency.
            const indexA = completedIds.indexOf(a.id);
            const indexB = completedIds.indexOf(b.id);

            if (activeSort === "newest") return indexA - indexB; // Lower index = more recent (sorted desc in hook)
            if (activeSort === "oldest") return indexB - indexA;

            return 0;
        });

        return items;
    }, [allItems, activeFilter, searchQuery, activeSort, completedIds]);

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header */}
            <div className="bg-background/80 backdrop-blur-md sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-6 lg:px-16 py-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/"
                                className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-zinc-800/50"
                            >
                                <ArrowLeft className="size-5" />
                            </Link>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-500/20 rounded-lg">
                                    <CheckCircle2 className="size-6 text-emerald-400" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-foreground">Completed</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Your knowledge milestones
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stats Summary (visible on larger screens) */}
                        {!isLoading && allItems.length > 0 && (
                            <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                                <div className="flex flex-col items-center">
                                    <span className="font-bold text-foreground text-lg">{allItems.length}</span>
                                    <span className="text-xs uppercase tracking-wider">Total Items</span>
                                </div>
                                <div className="w-px h-8 bg-zinc-800" />
                                <div className="flex flex-col items-center">
                                    <span className="font-bold text-foreground text-lg">
                                        {allItems.filter(i => i.type === 'book').length}
                                    </span>
                                    <span className="text-xs uppercase tracking-wider">Books</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Controls Toolbar */}
                    {!isLoading && allItems.length > 0 && (
                        <div className="mt-2">
                            <LibraryToolbar
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                activeFilter={activeFilter}
                                onFilterChange={setActiveFilter}
                                activeSort={activeSort}
                                onSortChange={setActiveSort}
                                className="pt-2"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 lg:px-16 py-8">
                {isLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="aspect-[2/3] bg-zinc-800/50 rounded-lg animate-pulse" />
                        ))}
                    </div>
                ) : allItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="inline-flex items-center justify-center p-6 bg-zinc-800/30 rounded-full mb-6 border border-zinc-800">
                            <Trophy className="size-10 text-muted-foreground" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            No completed content yet
                        </h2>
                        <p className="text-muted-foreground mb-8 max-w-sm">
                            Finish reading your first book summary or podcast to see it appear here.
                        </p>
                        <Link
                            href="/"
                            className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-all hover:scale-105"
                        >
                            Browse Library
                        </Link>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-muted-foreground">No items match your search.</p>
                        <button
                            onClick={() => { setSearchQuery(""); setActiveFilter("all"); }}
                            className="text-primary hover:underline mt-2 text-sm"
                        >
                            Clear filters
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="mb-6 flex items-center justify-between">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Showing {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {filteredItems.map((item) => (
                                <ContentCard
                                    key={item.id}
                                    item={item}
                                    showCompletedBadge
                                    onRemove={(id) => {
                                        removeFromProgress(id);
                                        setAllItems(prev => prev.filter(i => i.id !== id));
                                    }}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
