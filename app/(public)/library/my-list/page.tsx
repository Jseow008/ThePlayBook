"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ListPlus, Plus } from "lucide-react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentCard } from "@/components/ui/ContentCard";
import { LibraryToolbar } from "@/components/ui/LibraryToolbar";
import type { ContentItem } from "@/types/database";

/**
 * My List Page
 * 
 * Shows content manually bookmarked by the user for later reading.
 */
export default function MyListPage() {
    const { myListIds, isLoaded, removeFromMyList } = useReadingProgress();
    const [allItems, setAllItems] = useState<ContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filter/Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState("all");
    const [activeSort, setActiveSort] = useState<"newest" | "oldest" | "title">("newest");

    useEffect(() => {
        if (!isLoaded) return;

        if (myListIds.length === 0) {
            setIsLoading(false);
            setAllItems([]);
            return;
        }

        // Fetch content items for the my-list IDs
        const fetchItems = async () => {
            try {
                const response = await fetch("/api/content/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: myListIds }),
                });

                if (response.ok) {
                    const data: ContentItem[] = await response.json();

                    // Identify items that are in localStorage but not in the DB
                    const validIds = new Set(data.map(item => item.id));
                    const invalidIds = myListIds.filter(id => !validIds.has(id));

                    // Self-healing: Remove invalid entries
                    if (invalidIds.length > 0) {
                        console.log("Cleaning up invalid My List items:", invalidIds);
                        invalidIds.forEach(id => {
                            // We use the hook's remove function but we need to do it carefully in loop
                            // Actually, refresh logic handles basic loading, but we should remove invalid keys
                            // Since My List is a single array key, we can update it once.
                            // But `removeFromMyList` updates state and storage. Calling in loop is okay but might cause multiple renders.
                            // Better: filter valid IDs and update storage manually if needed, or just let user see empty?
                            // Actually, we should clean up.
                            // The hook manages 'flux_mylist'.
                            // Let's just call removeFromMyList for each invalid ID.
                            removeFromMyList(id);
                        });
                    }

                    // Store all items
                    setAllItems(data);
                }
            } catch (error) {
                console.error("Failed to fetch items:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchItems();
    }, [myListIds, isLoaded, removeFromMyList]);

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
            // For newest/oldest in My List, we rely on the order in myListIds (which is added-to-top by default)
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
        <div className="min-h-screen bg-background pb-20">
            {/* Header */}
            <div className="sticky top-12 lg:top-0 z-40 bg-background/90 backdrop-blur-md border-b border-border/70">
                <div className="max-w-7xl mx-auto px-6 lg:px-16 py-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/"
                                className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                                <ArrowLeft className="size-5" />
                            </Link>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-secondary/60 rounded-lg border border-border/70">
                                    <ListPlus className="size-6 text-zinc-100" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-foreground">My List</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Content you&apos;ve saved for later
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stats Summary */}
                        {!isLoading && allItems.length > 0 && (
                            <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                                <div className="flex flex-col items-center">
                                    <span className="font-bold text-foreground text-lg">{allItems.length}</span>
                                    <span className="text-xs uppercase tracking-wider">Saved Items</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Toolbar */}
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
                        <div className="inline-flex items-center justify-center p-6 bg-secondary/30 rounded-full mb-6 border border-border/70">
                            <Plus className="size-10 text-muted-foreground" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            Your list is empty
                        </h2>
                        <p className="text-muted-foreground mb-8 max-w-sm">
                            Add books, podcasts, and articles to your list so you can easily find them later.
                        </p>
                        <Link
                            href="/"
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
                                    onRemove={(id) => removeFromMyList(id)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
