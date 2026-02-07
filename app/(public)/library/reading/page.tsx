"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, BookMarked, Clock, Search, ChevronDown } from "lucide-react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { ContentCard } from "@/components/ui/ContentCard";
import type { ContentItem } from "@/types/database";

/**
 * Continue Reading Page
 * 
 * Shows all items the user has started reading but not completed with filters.
 */
export default function ContinueReadingPage() {
    const { inProgressIds, isLoaded, refresh, removeFromProgress } = useReadingProgress();
    const [allItems, setAllItems] = useState<ContentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filter/Sort State
    const [searchQuery, setSearchQuery] = useState("");
    const [activeFilter, setActiveFilter] = useState("all");
    const [activeSort, setActiveSort] = useState<"newest" | "oldest" | "title">("newest");

    useEffect(() => {
        if (!isLoaded) return;

        if (inProgressIds.length === 0) {
            setIsLoading(false);
            setAllItems([]);
            return;
        }

        // Fetch content items for the in-progress IDs
        const fetchItems = async () => {
            try {
                const response = await fetch("/api/content/batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ids: inProgressIds }),
                });

                if (response.ok) {
                    const data: ContentItem[] = await response.json();

                    // Identify items that are in localStorage but not in the DB
                    const validIds = new Set(data.map(item => item.id));
                    const invalidIds = inProgressIds.filter(id => !validIds.has(id));

                    // Self-healing: Remove invalid entries from localStorage
                    if (invalidIds.length > 0) {
                        console.log("Cleaning up invalid reading progress:", invalidIds);
                        invalidIds.forEach(id => {
                            localStorage.removeItem(`lifebook_progress_${id}`);
                        });
                        refresh();
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
    }, [inProgressIds, isLoaded]);

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
            const indexA = inProgressIds.indexOf(a.id);
            const indexB = inProgressIds.indexOf(b.id);
            if (activeSort === "newest") return indexA - indexB;
            if (activeSort === "oldest") return indexB - indexA;
            return 0;
        });

        return items;
    }, [allItems, activeFilter, searchQuery, activeSort, inProgressIds]);

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header */}
            <div className="border-b border-zinc-800/50 bg-background/80 backdrop-blur-md sticky top-0 z-40">
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
                                <div className="p-2 bg-amber-500/20 rounded-lg">
                                    <BookMarked className="size-6 text-amber-400" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-foreground">Continue Reading</h1>
                                    <p className="text-sm text-muted-foreground">
                                        Pick up where you left off
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Stats Summary */}
                        {!isLoading && allItems.length > 0 && (
                            <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
                                <div className="flex flex-col items-center">
                                    <span className="font-bold text-foreground text-lg">{allItems.length}</span>
                                    <span className="text-xs uppercase tracking-wider">In Progress</span>
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

                    {/* Toolbar */}
                    {!isLoading && allItems.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-zinc-800/50">
                            <div className="flex flex-col md:flex-row gap-4 justify-between">
                                {/* Search */}
                                <div className="relative group w-full md:w-96">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        className="block w-full pl-10 pr-3 py-2 border border-zinc-800 rounded-md leading-5 bg-zinc-900/50 text-foreground placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm transition-all"
                                        placeholder="Search titles or authors..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                {/* Filters & Sort */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                                    <div className="relative">
                                        <select
                                            value={activeFilter}
                                            onChange={(e) => setActiveFilter(e.target.value)}
                                            className="h-9 block w-full pl-3 pr-8 py-2 text-base border-zinc-800 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-zinc-900/50 text-foreground appearance-none"
                                        >
                                            <option value="all">All Types</option>
                                            <option value="book">Books</option>
                                            <option value="podcast">Podcasts</option>
                                            <option value="article">Articles</option>
                                        </select>
                                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                    <div className="h-4 w-px bg-zinc-800 mx-2" />
                                    <div className="relative">
                                        <select
                                            value={activeSort}
                                            onChange={(e) => setActiveSort(e.target.value as any)}
                                            className="h-9 block w-full pl-3 pr-8 py-2 text-base border-zinc-800 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-zinc-900/50 text-foreground appearance-none"
                                        >
                                            <option value="newest">Recent</option>
                                            <option value="oldest">Oldest First</option>
                                            <option value="title">Title (A-Z)</option>
                                        </select>
                                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                </div>
                            </div>
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
                            <Clock className="size-10 text-muted-foreground" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            No reading in progress
                        </h2>
                        <p className="text-muted-foreground mb-8 max-w-sm">
                            Start reading any content and your progress will be saved here automatically.
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
