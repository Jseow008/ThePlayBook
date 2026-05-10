"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
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
    const [isPending, startTransition] = useTransition();
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

        startTransition(() => {
            router.push(`${basePath}?${params.toString()}`);
        });
    };

    const clearQuickFilters = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", "1");
        params.delete("status");
        params.delete("featured");
        params.delete("ai");
        params.delete("voice");
        startTransition(() => {
            router.push(`${basePath}?${params.toString()}`);
        });
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
            key: "voice-stale",
            label: "Voice Out of Date",
            active: currentVoice === "stale",
            onClick: () => toggleParam("voice", currentVoice === "stale" ? null : "stale"),
        },
        {
            key: "ai",
            label: "AI Needs Sync",
            active: currentAi === "stale",
            onClick: () => toggleParam("ai", currentAi === "stale" ? null : "stale"),
        },
    ];

    return (
        <div className="flex flex-wrap items-center gap-2" aria-busy={isPending}>
            {chips.map((chip) => (
                <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onClick}
                    disabled={isPending}
                    className={`${CHIP_CLASS_NAME} ${
                        chip.active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-transparent bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                >
                    {chip.label}
                </button>
            ))}

            {hasQuickFilters && (
                <button
                    type="button"
                    onClick={clearQuickFilters}
                    disabled={isPending}
                    className="rounded-full border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-70"
                >
                    Clear quick filters
                </button>
            )}
        </div>
    );
}
