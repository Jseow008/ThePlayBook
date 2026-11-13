"use client";

import { Suspense, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { ContentCard } from "@/components/ui/ContentCard";
import { AudioListenLink } from "@/components/ui/AudioListenLink";
import { LibraryGridSkeleton, LIBRARY_CARD_GRID_CLASS } from "@/components/ui/LibraryLoadingStates";
import { LibraryNav } from "@/components/ui/LibraryNav";
import { useBatchContentItems } from "@/hooks/use-content-queries";
import { useReadingProgress } from "@/hooks/useReadingProgress";

export function LibrarySearchShell({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={<LibraryGridSkeleton />}>
            <LibrarySearchContent>{children}</LibrarySearchContent>
        </Suspense>
    );
}

function LibrarySearchContent({ children }: { children: ReactNode }) {
    const searchParams = useSearchParams();
    const query = searchParams.get("q") ?? "";

    function setQuery(value: string) {
        // Persist before leaving the page, without adding a history entry per keystroke.
        // Read the live URL so rapid edits retain the latest filter and sort.
        const url = new URL(window.location.href);
        if (value) url.searchParams.set("q", value);
        else url.searchParams.delete("q");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    const { completedIds, inProgressIds, isLoaded, isCheckingLibrary, hydrationStatus, hydrationIssue, retryHydration, myListIds } = useReadingProgress();
    const normalizedQuery = query.trim().toLowerCase();
    const isSearching = normalizedQuery.length > 0;
    const allIds = useMemo(
        () => Array.from(new Set([...inProgressIds, ...myListIds, ...completedIds])),
        [inProgressIds, myListIds, completedIds],
    );
    const { data: items = [], isError, isLoading, refetch } = useBatchContentItems(allIds, {
        enabled: isLoaded && isSearching,
    });
    const results = useMemo(
        () => items.filter((item) =>
            item.title.toLowerCase().includes(normalizedQuery)
            || item.author?.toLowerCase().includes(normalizedQuery)
        ),
        [items, normalizedQuery],
    );
    const savedSet = useMemo(() => new Set(myListIds), [myListIds]);
    const readingSet = useMemo(() => new Set(inProgressIds), [inProgressIds]);
    const completedSet = useMemo(() => new Set(completedIds), [completedIds]);

    return (
        <div className="flex min-h-screen flex-col">
            {!isSearching && <LibraryNav />}
            {isLoaded && isCheckingLibrary && (
                <p role="status" className="mx-auto w-full max-w-7xl px-6 pt-4 text-sm text-muted-foreground lg:px-16">
                    Showing your saved library while checking for updates…
                </p>
            )}
            {hydrationStatus === "error" && (
                <div role="alert" className="mx-auto flex w-full max-w-7xl items-center gap-3 px-6 pt-4 text-sm text-muted-foreground lg:px-16">
                    <span>{isLoaded ? "Showing your saved library. Updates are temporarily unavailable." : "Could not load your library."}</span>
                    {hydrationIssue?.kind !== "rate_limited" && (
                        <button type="button" onClick={retryHydration} className="focus-ring touch-target-44 shrink-0 rounded-sm font-medium text-foreground hover:underline">Retry</button>
                    )}
                </div>
            )}
            <div className="mx-auto w-full max-w-7xl px-6 pt-5 lg:px-16 lg:pt-8">
                <div className="relative max-w-md">
                    <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        type="text"
                        role="searchbox"
                        aria-label="Search your entire library"
                        placeholder="Search your library by title or author…"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="h-11 w-full rounded-full border border-border/60 bg-secondary/40 pl-10 pr-11 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    />
                    {query && (
                        <button
                            type="button"
                            aria-label="Clear library search"
                            onClick={() => setQuery("")}
                            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X aria-hidden="true" className="size-4" />
                        </button>
                    )}
                </div>
            </div>
            {isSearching ? (
                <div className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-16">
                    <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">Library results</h1>
                    {isLoaded && !isLoading && !isError && (
                        <p className="mb-6 text-sm text-muted-foreground" role="status">
                            {results.length} {results.length === 1 ? "item" : "items"} found across your library
                        </p>
                    )}
                    {!isLoaded || isLoading ? (
                        <LibraryGridSkeleton />
                    ) : isError ? (
                        <div className="rounded-2xl border border-border/60 bg-secondary/10 p-6">
                            <p className="text-muted-foreground">We couldn&apos;t search your library right now.</p>
                            <button type="button" onClick={() => { void refetch(); }} className="mt-3 rounded-full border border-border px-4 py-2 text-sm text-foreground hover:bg-secondary/50">Retry</button>
                        </div>
                    ) : allIds.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 p-8 text-center text-muted-foreground">
                            <p>Your library is empty. Save something to find it here later.</p>
                            <Link href="/browse" className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Browse content</Link>
                        </div>
                    ) : results.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/10 p-8 text-center text-muted-foreground">
                            No library items match “{query.trim()}”. Try a title or author.
                        </div>
                    ) : (
                        <div className={LIBRARY_CARD_GRID_CLASS}>
                            {results.map((item) => (
                                <div key={item.id}>
                                    <ContentCard
                                        item={item}
                                        navigationMode={readingSet.has(item.id) ? "resume" : "preview"}
                                        titleDensity="app-compact"
                                    />
                                    {item.audio_url?.trim() && (
                                        <div className="mt-2"><AudioListenLink item={item} /></div>
                                    )}
                                    <ul className="mt-2 flex flex-wrap gap-1" aria-label={`Library status for ${item.title}`}>
                                        {readingSet.has(item.id) && <li className="rounded-full bg-secondary/60 px-2 py-0.5 text-xs text-foreground">In progress</li>}
                                        {savedSet.has(item.id) && <li className="rounded-full bg-secondary/60 px-2 py-0.5 text-xs text-foreground">Saved</li>}
                                        {completedSet.has(item.id) && <li className="rounded-full bg-secondary/60 px-2 py-0.5 text-xs text-foreground">Completed</li>}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1">{children}</div>
            )}
        </div>
    );
}
