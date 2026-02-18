"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";


export function AdminSearch() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryParam = searchParams.get("q") || "";

    // Local state for immediate feedback
    const [query, setQuery] = useState(queryParam);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Sync local state with URL param if it changes externally
    useEffect(() => {
        setQuery(queryParam);
    }, [queryParam]);

    const handleSearch = (term: string) => {
        setQuery(term);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());

            // Reset page when searching
            params.set("page", "1");

            if (term.trim()) {
                params.set("q", term.trim());
            } else {
                params.delete("q");
            }

            router.push(`/admin?${params.toString()}`);
        }, 300);
    };

    const clearSearch = () => {
        setQuery("");
        handleSearch("");
    };

    return (
        <div className="relative w-full max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-zinc-400" />
            </div>
            <input
                type="text"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                className="block w-full pl-10 pr-10 py-2 border border-zinc-200 rounded-lg bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                placeholder="Search content..."
            />
            {query && (
                <button
                    onClick={clearSearch}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
