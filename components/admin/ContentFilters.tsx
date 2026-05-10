"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
    ADMIN_CONTENT_SORT_LABELS,
    DEFAULT_ADMIN_CONTENT_SORT,
    normalizeAdminContentSort,
} from "@/lib/admin-content-sort";
import {
    getAdminContentViewStateFromSearchParams,
    normalizeAdminContentAiFilter,
    normalizeAdminContentPageSize,
    normalizeAdminContentStatus,
    normalizeAdminContentType,
    normalizeAdminContentVoiceFilter,
} from "@/lib/admin-content-query";
import {
    ADMIN_CONTENT_PERMANENT_FILTERS_COOKIE,
    serializeAdminContentPermanentFilters,
} from "@/lib/admin-content-permanent-filters";

export function ContentFilters({
    basePath = "/admin/content",
    initialPermanent = false,
}: {
    basePath?: string;
    initialPermanent?: boolean;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPermanent, setIsPermanent] = useState(initialPermanent);
    const [isPending, startTransition] = useTransition();

    const currentStatus = normalizeAdminContentStatus(searchParams.get("status"));
    const currentType = normalizeAdminContentType(searchParams.get("type"));
    const isFeatured = searchParams.get("featured") === "true";
    const currentSort = normalizeAdminContentSort(searchParams.get("sort"));
    const currentAi = normalizeAdminContentAiFilter(searchParams.get("ai"));
    const currentVoice = normalizeAdminContentVoiceFilter(searchParams.get("voice"));
    const currentPageSize = normalizeAdminContentPageSize(searchParams.get("page_size"));

    useEffect(() => {
        if (isPermanent) {
            const state = getAdminContentViewStateFromSearchParams({
                status: currentStatus,
                type: currentType,
                featured: isFeatured ? "true" : null,
                sort: currentSort,
                ai: currentAi,
                voice: currentVoice,
                page_size: String(currentPageSize),
            });
            document.cookie = `${ADMIN_CONTENT_PERMANENT_FILTERS_COOKIE}=${serializeAdminContentPermanentFilters(state)}; Path=${basePath}; Max-Age=31536000; SameSite=Lax`;
        } else {
            document.cookie = `${ADMIN_CONTENT_PERMANENT_FILTERS_COOKIE}=; Path=${basePath}; Max-Age=0; SameSite=Lax`;
        }
    }, [basePath, isPermanent, currentStatus, currentType, isFeatured, currentSort, currentAi, currentVoice, currentPageSize]);

    // Update filters in URL
    const updateFilters = (key: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());

        // Reset page when filtering
        params.set("page", "1");

        if (key === "sort") {
            if (value && value !== DEFAULT_ADMIN_CONTENT_SORT) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        } else if (value && value !== "all") {
            params.set(key, value);
        } else {
            params.delete(key);
        }

        startTransition(() => {
            router.push(`${basePath}?${params.toString()}`);
        });
    };

    return (
        <div className="grid w-full gap-2 rounded-lg border border-border bg-background p-2 shadow-sm sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center xl:gap-3" aria-busy={isPending}>
            <div className="hidden px-2 text-muted-foreground xl:flex xl:items-center">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
            </div>

            {/* Status Filter */}
            <select
                value={currentStatus}
                onChange={(e) => updateFilters("status", e.target.value)}
                disabled={isPending}
                className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring hover:text-foreground xl:min-w-[140px]"
            >
                <option value="all">All Status</option>
                <option value="verified">Published</option>
                <option value="draft">Drafts</option>
            </select>

            <select
                value={currentType}
                onChange={(e) => updateFilters("type", e.target.value)}
                disabled={isPending}
                className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring hover:text-foreground xl:min-w-[140px]"
                aria-label="Filter content by type"
            >
                <option value="all">All Types</option>
                <option value="book">Books</option>
                <option value="podcast">Podcasts</option>
                <option value="article">Articles</option>
                <option value="video">Videos</option>
            </select>

            <select
                value={currentSort}
                onChange={(e) => updateFilters("sort", e.target.value)}
                disabled={isPending}
                className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring hover:text-foreground xl:min-w-[180px]"
                aria-label="Sort content"
            >
                {Object.entries(ADMIN_CONTENT_SORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                        {label}
                    </option>
                ))}
            </select>

            {/* Featured Filter */}
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer group select-none">
                <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => updateFilters("featured", e.target.checked ? "true" : "all")}
                    disabled={isPending}
                    className="w-4 h-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                />
                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground whitespace-nowrap">
                    Featured Only
                </span>
            </label>

            {/* Permanent Filter Toggle */}
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 cursor-pointer group select-none sm:col-span-2 xl:col-span-1" title="Remember these filters">
                <input
                    type="checkbox"
                    checked={isPermanent}
                    onChange={(e) => setIsPermanent(e.target.checked)}
                    className="w-4 h-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                />
                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground whitespace-nowrap flex items-center gap-1">
                    Permanent
                </span>
            </label>
        </div>
    );
}
