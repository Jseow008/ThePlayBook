"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import { useEffect, useState } from "react";
import {
    ADMIN_CONTENT_SORT_LABELS,
    DEFAULT_ADMIN_CONTENT_SORT,
    normalizeAdminContentSort,
} from "@/lib/admin-content-sort";

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

    // Load persisted filters on mount
    useEffect(() => {
        const savedPermanent = localStorage.getItem("admin_filters_permanent") === "true";
        if (savedPermanent) {
            setIsPermanent(true);
            const savedState = localStorage.getItem("admin_filters_state");
            if (savedState) {
                try {
                    const { status, type, featured, sort } = JSON.parse(savedState);

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

                    // If current URL is "clean" (no explicit params), restore.
                    const normalizedSavedSort = normalizeAdminContentSort(sort);

                    if (
                        !currentStatusParam
                        && !currentTypeParam
                        && !currentFeaturedParam
                        && !currentSortParam
                        && (status !== "all" || type !== "all" || featured || normalizedSavedSort !== DEFAULT_ADMIN_CONTENT_SORT)
                    ) {
                        const newParams = new URLSearchParams();
                        if (status && status !== "all") newParams.set("status", status);
                        if (type && type !== "all") newParams.set("type", type);
                        if (featured) newParams.set("featured", "true");
                        if (normalizedSavedSort !== DEFAULT_ADMIN_CONTENT_SORT) newParams.set("sort", normalizedSavedSort);

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
            };
            localStorage.setItem("admin_filters_state", JSON.stringify(state));
            localStorage.setItem("admin_filters_permanent", "true");
        } else {
            // When disabling, we simply remove the permanent flag
            // We do NOT clear the state immediately, so that if they re-enable, it picks up current.
            // But we should remove the flag so next reload doesn't auto-restore.
            localStorage.removeItem("admin_filters_permanent");
        }
    }, [isPermanent, currentStatus, currentType, isFeatured, currentSort]);

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
        <div className="flex items-center gap-4 bg-background p-2 rounded-lg border border-border shadow-sm">
            <div className="px-2 text-muted-foreground">
                <Filter className="w-4 h-4" />
            </div>

            <div className="h-6 w-px bg-border"></div>

            {/* Status Filter */}
            <select
                value={currentStatus}
                onChange={(e) => updateFilters("status", e.target.value)}
                className="bg-transparent text-sm font-medium text-muted-foreground focus:outline-none cursor-pointer hover:text-foreground"
            >
                <option value="all">All Status</option>
                <option value="verified">Published</option>
                <option value="draft">Drafts</option>
            </select>

            <div className="h-6 w-px bg-border"></div>

            <select
                value={currentType}
                onChange={(e) => updateFilters("type", e.target.value)}
                className="bg-transparent text-sm font-medium text-muted-foreground focus:outline-none cursor-pointer hover:text-foreground"
                aria-label="Filter content by type"
            >
                <option value="all">All Types</option>
                <option value="book">Books</option>
                <option value="podcast">Podcasts</option>
                <option value="article">Articles</option>
                <option value="video">Videos</option>
            </select>

            <div className="h-6 w-px bg-border"></div>

            <select
                value={currentSort}
                onChange={(e) => updateFilters("sort", e.target.value)}
                className="bg-transparent text-sm font-medium text-muted-foreground focus:outline-none cursor-pointer hover:text-foreground"
                aria-label="Sort content"
            >
                {Object.entries(ADMIN_CONTENT_SORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                        {label}
                    </option>
                ))}
            </select>

            <div className="h-6 w-px bg-border"></div>

            {/* Featured Filter */}
            <label className="flex items-center gap-2 cursor-pointer group select-none">
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

            <div className="h-6 w-px bg-border"></div>

            {/* Permanent Filter Toggle */}
            <label className="flex items-center gap-2 cursor-pointer group select-none" title="Remember these filters">
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
