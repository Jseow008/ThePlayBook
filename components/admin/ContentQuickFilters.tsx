"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    normalizeAdminContentAiFilter,
    normalizeAdminContentStatus,
    normalizeAdminContentVoiceFilter,
} from "@/lib/admin-content-query";

const CHIP_CLASS_NAME = "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all";

export function ContentQuickFilters({
    basePath = "/admin/content",
}: {
    basePath?: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentStatus = normalizeAdminContentStatus(searchParams.get("status"));
    const currentAi = normalizeAdminContentAiFilter(searchParams.get("ai"));
    const currentVoice = normalizeAdminContentVoiceFilter(searchParams.get("voice"));
    const isFeatured = searchParams.get("featured") === "true";

    const toggleParam = (key: string, nextValue: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", "1");

        if (!nextValue || nextValue === "all") {
            params.delete(key);
        } else {
            params.set(key, nextValue);
        }

        router.push(`${basePath}?${params.toString()}`);
    };

    const clearQuickFilters = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", "1");
        params.delete("status");
        params.delete("featured");
        params.delete("ai");
        params.delete("voice");
        router.push(`${basePath}?${params.toString()}`);
    };

    const hasQuickFilters = currentStatus !== "all" || isFeatured || currentAi !== "all" || currentVoice !== "all";

    const chips = [
        {
            key: "published",
            label: "Published",
            active: currentStatus === "verified",
            onClick: () => toggleParam("status", currentStatus === "verified" ? null : "verified"),
        },
        {
            key: "draft",
            label: "Draft",
            active: currentStatus === "draft",
            onClick: () => toggleParam("status", currentStatus === "draft" ? null : "draft"),
        },
        {
            key: "featured",
            label: "Featured",
            active: isFeatured,
            onClick: () => toggleParam("featured", isFeatured ? null : "true"),
        },
        {
            key: "voice",
            label: "No Voice",
            active: currentVoice === "missing",
            onClick: () => toggleParam("voice", currentVoice === "missing" ? null : "missing"),
        },
        {
            key: "ai",
            label: "Needs Sync",
            active: currentAi === "stale",
            onClick: () => toggleParam("ai", currentAi === "stale" ? null : "stale"),
        },
    ];

    return (
        <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
                <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onClick}
                    className={`${CHIP_CLASS_NAME} ${
                        chip.active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-transparent bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    }`}
                >
                    {chip.label}
                </button>
            ))}

            {hasQuickFilters && (
                <button
                    type="button"
                    onClick={clearQuickFilters}
                    className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    Clear quick filters
                </button>
            )}
        </div>
    );
}
