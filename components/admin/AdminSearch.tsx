"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SearchBox } from "@/components/ui/SearchBox";
import { useState, useEffect, useRef, useTransition } from "react";

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
    const [, startTransition] = useTransition();

    // Local state for immediate feedback
    const [query, setQuery] = useState(queryParam);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const latestQueryRef = useRef(queryParam);
    const isFocusedRef = useRef(false);
    const editRevisionRef = useRef(0);
    const pendingSearchRef = useRef<{ query: string; revision: number } | null>(null);

    // Sync local state with URL param if it changes externally
    useEffect(() => {
        const normalizedQueryParam = normalizeQuery(queryParam);
        const normalizedCurrentQuery = normalizeQuery(latestQueryRef.current);
        const pendingSearch = pendingSearchRef.current;

        if (pendingSearch !== null) {
            if (pendingSearch.revision < editRevisionRef.current) {
                pendingSearchRef.current = null;
                if (normalizedQueryParam !== normalizedCurrentQuery) {
                    return;
                }
            } else if (normalizedQueryParam === pendingSearch.query) {
                pendingSearchRef.current = null;
                latestQueryRef.current = queryParam;
                setQuery(queryParam);
                return;
            }

            if (normalizedCurrentQuery === pendingSearch.query) {
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
        const revision = editRevisionRef.current + 1;
        editRevisionRef.current = revision;
        latestQueryRef.current = term;
        setQuery(term);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            pendingSearchRef.current = normalizedTerm === normalizeQuery(queryParam)
                ? null
                : { query: normalizedTerm, revision };
            const params = new URLSearchParams(searchParams.toString());

            // Reset page when searching
            params.set("page", "1");

            if (normalizedTerm) {
                params.set("q", normalizedTerm);
            } else {
                params.delete("q");
            }

            startTransition(() => {
                router.replace(`${basePath}?${params.toString()}`);
            });
            debounceRef.current = null;
        }, 300);
    };

    const clearSearch = () => {
        handleSearch("");
    };

    return (
        <div className="relative w-full sm:max-w-sm xl:max-w-xs">
            <SearchBox
                searchIconClassName="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 pointer-events-none"
                clear={{
                    label: "Clear search",
                    onClick: clearSearch,
                    buttonClassName: "absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground",
                    iconClassName: "h-4 w-4",
                }}
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => {
                    isFocusedRef.current = true;
                }}
                onBlur={() => {
                    isFocusedRef.current = false;
                }}
                className="block w-full pl-10 pr-10 py-2 border border-input rounded-lg bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all search-box-preserve-ios-height [--search-box-line-height:var(--text-sm--line-height)]"
                placeholder="Search content..."
            />
        </div>
    );
}
