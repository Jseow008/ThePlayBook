"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import { useEffect, useState } from "react";
import {
    ADMIN_CONTENT_SORT_LABELS,
    DEFAULT_ADMIN_CONTENT_SORT,
    normalizeAdminContentSort,
} from "@/lib/admin-content-sort";
import {
    DEFAULT_ADMIN_CONTENT_PAGE_SIZE,
    normalizeAdminContentAiFilter,
    normalizeAdminContentPageSize,
    normalizeAdminContentVoiceFilter,
} from "@/lib/admin-content-query";

export function ContentFilters({
    basePath = "/admin/content",
}: {
    basePath?: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPermanent, setIsPermanent] = useState(false);

    const currentStatus = searchParams.get("status") || "all";
    const currentType = searchParams.get("type") || "all";
    const isFeatured = searchParams.get("featured") === "true";
    const currentSort = normalizeAdminContentSort(searchParams.get("sort"));
    const currentAi = normalizeAdminContentAiFilter(searchParams.get("ai"));
    const currentVoice = normalizeAdminContentVoiceFilter(searchParams.get("voice"));
    const currentPageSize = normalizeAdminContentPageSize(searchParams.get("page_size"));

    // Load persisted filters on mount
    useEffect(() => {
        const savedPermanent = localStorage.getItem("admin_filters_permanent") === "true";
        if (savedPermanent) {
            setIsPermanent(true);
            const savedState = localStorage.getItem("admin_filters_state");
            if (savedState) {
                try {
                    const { status, type, featured, sort, ai, voice, pageSize } = JSON.parse(savedState);

                    // Only restore if URL params are empty/default or match
                    // Ideally we should restore if we are just landing on the page (no specific params)
                    // But checking if "all" is tricky because that's the default.
                    // Let's assume if there are NO query params in the URL at all, we generally restore.
                    // Or if specific params are missing.

                    const params = new URLSearchParams(searchParams.toString());
                    const currentStatusParam = params.get("status");
                    const currentTypeParam = params.get("type");
                    const currentFeaturedParam = params.get("featured");
                    const currentSortParam = params.get("sort");
                    const currentAiParam = params.get("ai");
                    const currentVoiceParam = params.get("voice");
                    const currentPageSizeParam = params.get("page_size");

                    // If current URL is "clean" (no explicit params), restore.
                    const normalizedSavedSort = normalizeAdminContentSort(sort);
                    const normalizedSavedAi = normalizeAdminContentAiFilter(ai);
                    const normalizedSavedVoice = normalizeAdminContentVoiceFilter(voice);
                    const normalizedSavedPageSize = normalizeAdminContentPageSize(pageSize);

                    if (
                        !currentStatusParam
                        && !currentTypeParam
                        && !currentFeaturedParam
                        && !currentSortParam
                        && !currentAiParam
                        && !currentVoiceParam
                        && !currentPageSizeParam
                        && (
                            status !== "all"
                            || type !== "all"
                            || featured
                            || normalizedSavedSort !== DEFAULT_ADMIN_CONTENT_SORT
                            || normalizedSavedAi !== "all"
                            || normalizedSavedVoice !== "all"
                            || normalizedSavedPageSize !== DEFAULT_ADMIN_CONTENT_PAGE_SIZE
                        )
                    ) {
                        const newParams = new URLSearchParams();
                        if (status && status !== "all") newParams.set("status", status);
                        if (type && type !== "all") newParams.set("type", type);
                        if (featured) newParams.set("featured", "true");
                        if (normalizedSavedSort !== DEFAULT_ADMIN_CONTENT_SORT) newParams.set("sort", normalizedSavedSort);
                        if (normalizedSavedAi !== "all") newParams.set("ai", normalizedSavedAi);
                        if (normalizedSavedVoice !== "all") newParams.set("voice", normalizedSavedVoice);
                        if (normalizedSavedPageSize !== DEFAULT_ADMIN_CONTENT_PAGE_SIZE) {
                            newParams.set("page_size", String(normalizedSavedPageSize));
                        }

                        router.replace(`${basePath}?${newParams.toString()}`);
                    }
                } catch (e) {
                    console.error("Failed to parse saved filters", e);
                }
            }
        }
    }, [basePath, router, searchParams]); // Run once on mount

    // Save filters when they change, if permanent is enabled
    useEffect(() => {
        if (isPermanent) {
            const state = {
                status: currentStatus,
                type: currentType,
                featured: isFeatured,
                sort: currentSort,
                ai: currentAi,
                voice: currentVoice,
                pageSize: currentPageSize,
            };
            localStorage.setItem("admin_filters_state", JSON.stringify(state));
            localStorage.setItem("admin_filters_permanent", "true");
        } else {
            // When disabling, we simply remove the permanent flag
            // We do NOT clear the state immediately, so that if they re-enable, it picks up current.
            // But we should remove the flag so next reload doesn't auto-restore.
            localStorage.removeItem("admin_filters_permanent");
        }
    }, [isPermanent, currentStatus, currentType, isFeatured, currentSort, currentAi, currentVoice, currentPageSize]);

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

        router.push(`${basePath}?${params.toString()}`);
    };

    return (
        <div className="grid w-full gap-2 rounded-lg border border-border bg-background p-2 shadow-sm sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center xl:gap-3">
            <div className="hidden px-2 text-muted-foreground xl:flex xl:items-center">
                <Filter className="w-4 h-4" />
            </div>

            {/* Status Filter */}
            <select
                value={currentStatus}
                onChange={(e) => updateFilters("status", e.target.value)}
                className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring hover:text-foreground xl:min-w-[140px]"
            >
                <option value="all">All Status</option>
                <option value="verified">Published</option>
                <option value="draft">Drafts</option>
            </select>

            <select
                value={currentType}
                onChange={(e) => updateFilters("type", e.target.value)}
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
