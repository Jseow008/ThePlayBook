"use client";

import { Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LibraryToolbarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    activeFilter: string;
    onFilterChange: (filter: string) => void;
    activeSort: "newest" | "oldest" | "title";
    onSortChange: (sort: "newest" | "oldest" | "title") => void;
    className?: string;
}

export function LibraryToolbar({
    searchQuery,
    onSearchChange,
    activeFilter,
    onFilterChange,
    activeSort,
    onSortChange,
    className,
}: LibraryToolbarProps) {
    const filters = ["all", "book", "podcast", "article"] as const;

    return (
        <div className={cn("flex flex-col gap-2.5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-3", className)}>
            {/* Search */}
            <div className="relative w-full lg:w-64 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary/40 border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all text-sm placeholder:text-muted-foreground/80"
                />
            </div>

            <div
                data-testid="library-toolbar-controls"
                className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap lg:gap-3"
            >
                {/* Filter */}
                <div
                    data-testid="library-toolbar-filters"
                    className="flex flex-wrap gap-2 lg:items-center lg:rounded-full lg:border lg:border-border/60 lg:bg-secondary/25 lg:p-1"
                >
                    {filters.map((filter) => (
                        <button
                            key={filter}
                            onClick={() => onFilterChange(filter)}
                            className={cn(
                                "inline-flex h-8 items-center justify-center rounded-full border px-3 text-xs font-medium capitalize transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-3.5 lg:h-8 lg:border-transparent lg:px-4",
                                activeFilter === filter
                                    ? "border-border/70 bg-secondary/50 text-foreground shadow-sm lg:bg-background"
                                    : "border-border/60 bg-transparent text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-secondary/30 lg:hover:bg-secondary/50"
                            )}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                {/* Sort */}
                <div
                    data-testid="library-toolbar-sort"
                    className="relative shrink-0"
                >
                    <select
                        value={activeSort}
                        onChange={(e) => onSortChange(e.target.value as any)}
                        aria-label="Sort library items"
                        className="h-8 min-w-28 rounded-full border border-border/60 bg-background/40 pl-3 pr-8 text-xs font-medium text-muted-foreground transition-colors appearance-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer lg:h-9 lg:bg-secondary/25"
                    >
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="title">A-Z</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                </div>
            </div>
        </div>
    );
}
