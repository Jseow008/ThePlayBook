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
    return (
        <div className={cn("flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between py-4", className)}>
            {/* Search */}
            <div className="relative w-full lg:w-96 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary/40 border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all text-sm placeholder:text-muted-foreground/80"
                />
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 scrollbar-hide">
                {/* Filter */}
                <div className="flex items-center bg-secondary/25 rounded-full p-1 border border-border/60">
                    {["all", "book", "podcast", "article"].map((filter) => (
                        <button
                            key={filter}
                            onClick={() => onFilterChange(filter)}
                            className={cn(
                                "h-8 px-4 rounded-full text-xs font-medium capitalize transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                activeFilter === filter
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                            )}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                {/* Sort */}
                <div className="relative">
                    <select
                        value={activeSort}
                        onChange={(e) => onSortChange(e.target.value as any)}
                        className="h-9 pl-3 pr-8 rounded-full bg-secondary/25 text-xs font-medium border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer text-muted-foreground hover:text-foreground transition-colors appearance-none"
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
