"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

interface SearchTopicSelectProps {
    query?: string;
    type?: string;
    value?: string;
    options: string[];
}

function buildSearchHref({ query, category, type }: { query?: string; category?: string; type?: string }) {
    const params = new URLSearchParams();

    if (query?.trim()) {
        params.set("q", query.trim());
    }

    if (category) {
        params.set("category", category);
    }

    if (type && type.toLowerCase() !== "all") {
        params.set("type", type.toLowerCase());
    }

    const search = params.toString();
    return search ? `/search?${search}` : "/search";
}

export function SearchTopicSelect({ query, type, value = "", options }: SearchTopicSelectProps) {
    const router = useRouter();

    if (options.length === 0 && !value) {
        return null;
    }

    return (
        <div className="relative inline-flex min-w-[180px]">
            <label htmlFor="search-topic-select" className="sr-only">
                More topics
            </label>
            <select
                id="search-topic-select"
                aria-label="More topics"
                value={value}
                onChange={(event) => {
                    const nextCategory = event.target.value || undefined;
                    router.push(buildSearchHref({ query, category: nextCategory, type }));
                }}
                className="h-9 w-full appearance-none rounded-full border border-border bg-secondary/30 pl-4 pr-10 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary"
            >
                <option value="">More topics</option>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
    );
}
