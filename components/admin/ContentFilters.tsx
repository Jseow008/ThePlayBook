"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";

export function ContentFilters() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const currentStatus = searchParams.get("status") || "all";
    const isFeatured = searchParams.get("featured") === "true";

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
            <label className="flex items-center gap-2 cursor-pointer group">
                <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => updateFilters("featured", e.target.checked ? "true" : "all")}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                />
                <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">
                    Featured Only
                </span>
            </label>
        </div>
    );
}
