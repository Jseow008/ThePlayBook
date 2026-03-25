"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, Info } from "lucide-react";
import type { ContentItem } from "@/types/database";

interface SeriesSequenceListProps {
    items: ContentItem[];
    showItemAuthors?: boolean;
}

function formatDuration(durationSeconds: number | null) {
    if (!durationSeconds) {
        return null;
    }

    const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));

    if (totalMinutes < 60) {
        return `${totalMinutes} min`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getItemHook(item: ContentItem) {
    const value = item.quick_mode_json;

    if (!value || Array.isArray(value) || typeof value !== "object") {
        return null;
    }

    const hook = (value as { hook?: unknown }).hook;
    return typeof hook === "string" && hook.trim().length > 0 ? hook.trim() : null;
}

export function SeriesSequenceList({ items, showItemAuthors = false }: SeriesSequenceListProps) {
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

    if (items.length === 0) {
        return null;
    }

    return (
        <ol className="space-y-3">
            {items.map((item, index) => {
                const durationLabel = formatDuration(item.duration_seconds);
                const hook = getItemHook(item);
                const isExpanded = expandedItemId === item.id;
                const panelId = `series-hook-${item.id}`;

                return (
                    <li key={item.id}>
                        <div
                            className={`group rounded-[1.6rem] border px-4 py-4 transition-all duration-200 sm:px-5 ${
                                isExpanded
                                    ? "border-white/12 bg-card/55 shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
                                    : "border-border/50 bg-card/35 hover:-translate-y-0.5 hover:border-white/12 hover:bg-card/55 hover:shadow-[0_18px_40px_rgba(0,0,0,0.22)]"
                            }`}
                        >
                            <div className="flex items-start gap-4 sm:items-center">
                                <button
                                    type="button"
                                    aria-expanded={isExpanded}
                                    aria-controls={panelId}
                                    onClick={() =>
                                        setExpandedItemId((current) => current === item.id ? null : item.id)
                                    }
                                    className="focus-ring flex min-w-0 flex-1 items-start gap-4 rounded-xl text-left sm:items-center"
                                >
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-lg font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                                        {index + 1}
                                    </div>

                                    <div className="min-w-0 flex-1 space-y-2">
                                        <h2 className="font-display text-lg font-semibold leading-tight tracking-tight text-foreground sm:text-[1.35rem]">
                                            {item.title}
                                        </h2>
                                        {showItemAuthors && item.author ? (
                                            <p className="text-sm text-muted-foreground">
                                                {item.author}
                                            </p>
                                        ) : null}
                                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                            <span className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                                                {item.type}
                                            </span>
                                            {durationLabel ? <span>{durationLabel}</span> : null}
                                        </div>
                                    </div>

                                    <ChevronRight
                                        className={`mt-1 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                            isExpanded ? "rotate-90 text-foreground" : ""
                                        }`}
                                    />
                                </button>
                            </div>

                            {isExpanded ? (
                                <div
                                    id={panelId}
                                    className="mt-4 border-t border-border/50 pt-4"
                                >
                                    {hook ? (
                                        <p className="text-sm leading-7 text-muted-foreground whitespace-pre-line sm:text-base">
                                            {hook}
                                        </p>
                                    ) : null}
                                    <div className="mt-4 flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-start">
                                        <Link
                                            href={`/read/${item.id}`}
                                            aria-label={`Read ${item.title}`}
                                            className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-black shadow-[0_0_16px_rgba(255,255,255,0.14)] transition-all hover:scale-[1.02] hover:bg-white/95 hover:shadow-[0_0_24px_rgba(255,255,255,0.22)] active:scale-95 md:h-10 md:w-fit md:flex-none md:self-start md:px-5 md:hover:scale-105"
                                        >
                                            <BookOpen className="size-4 fill-black" />
                                            <span>Read</span>
                                        </Link>
                                        <Link
                                            href={`/preview/${item.id}`}
                                            aria-label={`Preview ${item.title}`}
                                            className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-black/20 px-4 text-sm font-semibold text-white backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.25)] transition-all hover:scale-[1.02] hover:bg-black/35 hover:border-white/35 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] active:scale-95 md:h-10 md:w-fit md:flex-none md:self-start md:px-5 md:hover:scale-105"
                                        >
                                            <Info className="size-4" />
                                            <span>Preview</span>
                                        </Link>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
