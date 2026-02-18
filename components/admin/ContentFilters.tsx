"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";
import { useEffect, useState } from "react";

export function ContentFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPermanent, setIsPermanent] = useState(false);

    const currentStatus = searchParams.get("status") || "all";
    const isFeatured = searchParams.get("featured") === "true";

    // Load persisted filters on mount
    useEffect(() => {
        const savedPermanent = localStorage.getItem("admin_filters_permanent") === "true";
        if (savedPermanent) {
            setIsPermanent(true);
            const savedState = localStorage.getItem("admin_filters_state");
            if (savedState) {
                try {
                    const { status, featured } = JSON.parse(savedState);

                    // Only restore if URL params are empty/default or match
                    // Ideally we should restore if we are just landing on the page (no specific params)
                    // But checking if "all" is tricky because that's the default.
                    // Let's assume if there are NO query params in the URL at all, we generally restore.
                    // Or if specific params are missing.

                    const params = new URLSearchParams(searchParams.toString());
                    const currentStatusParam = params.get("status");
                    const currentFeaturedParam = params.get("featured");

                    // If current URL is "clean" (no explicit params), restore.
                    if (!currentStatusParam && !currentFeaturedParam && (status !== "all" || featured)) {
                        const newParams = new URLSearchParams();
                        if (status && status !== "all") newParams.set("status", status);
                        if (featured) newParams.set("featured", "true");

                        router.replace(`/admin?${newParams.toString()}`);
                    }
                } catch (e) {
                    console.error("Failed to parse saved filters", e);
                }
            }
        }
    }, [router, searchParams]); // Run once on mount

    // Save filters when they change, if permanent is enabled
    useEffect(() => {
        if (isPermanent) {
            const state = {
                status: currentStatus,
                featured: isFeatured
            };
            localStorage.setItem("admin_filters_state", JSON.stringify(state));
            localStorage.setItem("admin_filters_permanent", "true");
        } else {
            // When disabling, we simply remove the permanent flag
            // We do NOT clear the state immediately, so that if they re-enable, it picks up current.
            // But we should remove the flag so next reload doesn't auto-restore.
            localStorage.removeItem("admin_filters_permanent");
        }
    }, [isPermanent, currentStatus, isFeatured]);

    // Update filters in URL
    const updateFilters = (key: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());

        // Reset page when filtering
        params.set("page", "1");

        if (value && value !== "all") {
            params.set(key, value);
        } else {
            params.delete(key);
        }

        router.push(`/admin?${params.toString()}`);
    };

    return (
        <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-zinc-200 shadow-sm">
            <div className="px-2 text-zinc-400">
                <Filter className="w-4 h-4" />
            </div>

            <div className="h-6 w-px bg-zinc-200"></div>

            {/* Status Filter */}
            <select
                value={currentStatus}
                onChange={(e) => updateFilters("status", e.target.value)}
                className="bg-transparent text-sm font-medium text-zinc-700 focus:outline-none cursor-pointer hover:text-zinc-900"
            >
                <option value="all">All Status</option>
                <option value="verified">Published</option>
                <option value="draft">Drafts</option>
            </select>

            <div className="h-6 w-px bg-zinc-200"></div>

            {/* Featured Filter */}
            <label className="flex items-center gap-2 cursor-pointer group select-none">
                <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => updateFilters("featured", e.target.checked ? "true" : "all")}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                />
                <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 whitespace-nowrap">
                    Featured Only
                </span>
            </label>

            <div className="h-6 w-px bg-zinc-200"></div>

            {/* Permanent Filter Toggle */}
            <label className="flex items-center gap-2 cursor-pointer group select-none" title="Remember these filters">
                <input
                    type="checkbox"
                    checked={isPermanent}
                    onChange={(e) => setIsPermanent(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                />
                <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900 whitespace-nowrap flex items-center gap-1">
                    Permanent
                </span>
            </label>
        </div>
    );
}
