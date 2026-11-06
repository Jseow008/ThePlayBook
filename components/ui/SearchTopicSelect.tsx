"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { beginSearchJourney, resolveSearchFilterHref } from "@/lib/search-journey-measurement";

interface SearchTopicSelectProps {
    query?: string;
    type?: string;
    sort?: "recent" | "popular";
    value?: string;
    options: string[];
    variant?: "more-topics" | "all-topics";
}

function buildSearchHref({ query, category, type, sort }: { query?: string; category?: string; type?: string; sort?: "recent" | "popular" }) {
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

    if (!query?.trim() && sort === "popular") {
        params.set("sort", sort);
    }

    const search = params.toString();
    return search ? `/search?${search}` : "/search";
}

export function SearchTopicSelect({ query, type, sort, value = "", options, variant = "more-topics" }: SearchTopicSelectProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const isAllTopics = variant === "all-topics";
    const label = isAllTopics ? "Topics" : "More topics";
    const selectId = isAllTopics ? "search-topic-select-all" : "search-topic-select";

    if (options.length === 0 && !value) {
        return null;
    }

    return (
        <div className={isAllTopics ? "relative flex w-full min-w-0" : "relative inline-flex min-w-[180px]"}>
            <label htmlFor={selectId} className="sr-only">
                {label}
            </label>
            <select
                id={selectId}
                aria-label={label}
                aria-busy={isPending}
                value={value}
                onChange={(event) => {
                    const nextCategory = event.target.value || undefined;
                    const href = resolveSearchFilterHref(
                        buildSearchHref({ query, category: nextCategory, type, sort }),
                        "category",
                        nextCategory,
                    );
                    beginSearchJourney(href, "filter", "select", "topic");
                    startTransition(() => {
                        router.push(href);
                    });
                }}
                className={`${isAllTopics ? "h-11 min-w-0" : "h-9"} w-full appearance-none rounded-full border border-border bg-secondary/30 pl-4 pr-10 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-primary`}
            >
                <option value="">{isAllTopics ? "All topics" : "More topics"}</option>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
            {isPending ? (
                <Loader2 aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 motion-safe:animate-spin" />
            ) : (
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            )}
        </div>
    );
}
