"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const RECENT_SEARCHES_KEY = "lifebook_recent_searches";
const MAX_RECENT_SEARCHES = 5;

interface SearchInputProps {
    initialQuery?: string;
    category?: string;
    type?: string;
    placeholder?: string;
}

export function SearchInput({
    initialQuery = "",
    category,
    type,
    placeholder = "Search by title, author, or keyword..."
}: SearchInputProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [query, setQuery] = useState(initialQuery);
    const [isFocused, setIsFocused] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Load recent searches from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
            if (saved) {
                setRecentSearches(JSON.parse(saved));
            }
        } catch { }
    }, []);

    // Save search to recent history
    const saveToRecent = useCallback((term: string) => {
        if (!term.trim()) return;

        setRecentSearches(prev => {
            const filtered = prev.filter(s => s.toLowerCase() !== term.toLowerCase());
            const updated = [term, ...filtered].slice(0, MAX_RECENT_SEARCHES);
            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
            return updated;
        });
    }, []);

    // Navigate to search results
    const performSearch = useCallback((searchQuery: string, saveHistory = true) => {
        if (saveHistory && searchQuery.trim()) {
            saveToRecent(searchQuery.trim());
        }

        const params = new URLSearchParams();
        if (searchQuery.trim()) params.set("q", searchQuery.trim());
        if (category) params.set("category", category);
        if (type && type !== "All") params.set("type", type);

        router.push(`/search?${params.toString()}`);
    }, [router, category, type, saveToRecent]);

    // Debounced search on input change
    useEffect(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        // Only auto-search if query has content
        if (query.trim().length > 0) {
            debounceRef.current = setTimeout(() => {
                performSearch(query, false); // Don't save to history on debounce
            }, 500);
        }

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [query, performSearch]);

    // Handle form submission (Enter key)
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        performSearch(query, true); // Save to history on explicit submit
        inputRef.current?.blur();
    };

    // Handle recent search click
    const handleRecentClick = (term: string) => {
        setQuery(term);
        performSearch(term, true);
        setIsFocused(false);
    };

    // Clear search
    const handleClear = () => {
        setQuery("");
        inputRef.current?.focus();
        // Navigate to clean search page
        const params = new URLSearchParams();
        if (category) params.set("category", category);
        if (type && type !== "All") params.set("type", type);
        router.push(`/search?${params.toString()}`);
    };

    // Clear a specific recent search
    const removeRecentSearch = (term: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setRecentSearches(prev => {
            const updated = prev.filter(s => s !== term);
            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
            return updated;
        });
    };

    const showRecent = isFocused && !query.trim() && recentSearches.length > 0;

    return (
        <div className="relative max-w-2xl">
            <form onSubmit={handleSubmit}>
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                        placeholder={placeholder}
                        className={cn(
                            "w-full h-14 pl-12 pr-12 rounded-xl bg-card border text-foreground placeholder:text-muted-foreground",
                            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg",
                            "transition-all duration-200",
                            isFocused ? "border-primary/50" : "border-border"
                        )}
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="size-5" />
                        </button>
                    )}
                </div>
            </form>

            {/* Recent Searches Dropdown */}
            {showRecent && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-2 border-b border-border">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Recent Searches
                        </span>
                    </div>
                    <ul>
                        {recentSearches.map((term, idx) => (
                            <li key={idx}>
                                <button
                                    type="button"
                                    onClick={() => handleRecentClick(term)}
                                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left group"
                                >
                                    <Clock className="size-4 text-muted-foreground flex-shrink-0" />
                                    <span className="flex-1 text-foreground truncate">{term}</span>
                                    <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <button
                                        type="button"
                                        onClick={(e) => removeRecentSearch(term, e)}
                                        className="p-1 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <X className="size-3" />
                                    </button>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
