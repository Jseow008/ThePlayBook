"use client";

import Link from "next/link";
import type { ReadingProgressData } from "@/hooks/useReadingProgress";

/** A catalog lookup is a read, never permission to erase the user's library. */
export function UnavailableLibraryItems({ ids, getProgress }: {
    ids: string[];
    getProgress?: (id: string) => ReadingProgressData | null | undefined;
}) {
    if (ids.length === 0) return null;

    return (
        <section aria-label="Unavailable saved summaries" className="mb-6 space-y-3">
            <p className="text-sm text-muted-foreground">
                {ids.length === 1 ? "One saved summary is" : `${ids.length} saved summaries are`} currently unavailable.
                {" "}Your saved records have been kept. Open a summary to check for a replacement.
            </p>
            {ids.map((id) => {
                const progress = getProgress?.(id);
                const total = progress?.totalSegments ?? 0;
                return (
                    <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                        <div>
                            <p className="font-medium">Unavailable summary</p>
                            {progress && <p className="text-sm text-muted-foreground">
                                {progress.isCompleted ? "Previously completed" : total > 0
                                    ? `${Math.min(progress.completed.length, total)} of ${total} sections completed`
                                    : "Reading progress saved"}
                            </p>}
                        </div>
                        <Link href={`/read/${encodeURIComponent(id)}`} className="text-sm font-medium text-primary underline underline-offset-4">
                            View summary status
                        </Link>
                    </div>
                );
            })}
        </section>
    );
}
