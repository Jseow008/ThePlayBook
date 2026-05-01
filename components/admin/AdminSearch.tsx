"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";

function normalizeQuery(value: string) {
    return value.trim();
}

export function AdminSearch({
    basePath = "/admin/content",
}: {
    basePath?: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryParam = searchParams.get("q") || "";

    // Local state for immediate feedback
    const [query, setQuery] = useState(queryParam);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const latestQueryRef = useRef(queryParam);
    const isFocusedRef = useRef(false);
    const pendingSearchQueryRef = useRef<string | null>(null);

    // Sync local state with URL param if it changes externally
    useEffect(() => {
        const normalizedQueryParam = normalizeQuery(queryParam);
        const normalizedCurrentQuery = normalizeQuery(latestQueryRef.current);
        const pendingSearchQuery = pendingSearchQueryRef.current;

        if (pendingSearchQuery !== null) {
            if (normalizedQueryParam === pendingSearchQuery) {
                pendingSearchQueryRef.current = null;
                latestQueryRef.current = queryParam;
                setQuery(queryParam);
                return;
            }

            if (normalizedCurrentQuery === pendingSearchQuery) {
                return;
            }
        }

        if (isFocusedRef.current && normalizedQueryParam !== normalizedCurrentQuery) {
            return;
        }

        latestQueryRef.current = queryParam;
        setQuery(queryParam);
    }, [queryParam]);

    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    const handleSearch = (term: string) => {
        const normalizedTerm = normalizeQuery(term);
        latestQueryRef.current = term;
        setQuery(term);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            pendingSearchQueryRef.current = normalizedTerm === normalizeQuery(queryParam)
                ? null
                : normalizedTerm;
            const params = new URLSearchParams(searchParams.toString());

            // Reset page when searching
            params.set("page", "1");

            if (normalizedTerm) {
                params.set("q", normalizedTerm);
            } else {
                params.delete("q");
            }

            router.replace(`${basePath}?${params.toString()}`);
            debounceRef.current = null;
        }, 300);
    };

    const clearSearch = () => {
        handleSearch("");
    };

    return (
        <div className="relative w-full sm:max-w-sm xl:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-zinc-400" />
            </div>
            <input
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => {
                    isFocusedRef.current = true;
                }}
                onBlur={() => {
                    isFocusedRef.current = false;
                }}
                className="block w-full pl-10 pr-10 py-2 border border-input rounded-lg bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all"
                placeholder="Search content..."
            />
            {query && (
                <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
