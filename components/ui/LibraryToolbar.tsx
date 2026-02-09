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
        <div className={cn("flex flex-col lg:flex-row gap-4 items-center justify-between py-4", className)}>
            {/* Search */}
            <div className="relative w-full lg:w-96 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-full bg-secondary/50 border-none focus:ring-1 focus:ring-primary/20 transition-all outline-none text-sm placeholder:text-muted-foreground/70"
                />
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 scrollbar-hide">
                {/* Filter */}
                <div className="flex items-center bg-secondary/30 rounded-full p-1 border border-zinc-800/50">
                    {["all", "book", "podcast", "article"].map((filter) => (
                        <button
                            key={filter}
                            onClick={() => onFilterChange(filter)}
                            className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-all whitespace-nowrap",
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
                        className="h-9 pl-3 pr-8 rounded-full bg-secondary/30 text-xs font-medium border-none outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer text-muted-foreground hover:text-foreground transition-colors appearance-none"
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
