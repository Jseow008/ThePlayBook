"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import type { FocusFeedItem } from "@/types/domain";
import { buildFocusCards, mergeUniqueFocusItems, type FocusCard } from "@/components/focus/focus-feed-utils";

const BATCH_SIZE = 6;
const FEED_VIEWPORT_CLASS = "h-[calc(100svh-8.75rem)] md:h-[calc(100svh-7.5rem)]";

function formatDuration(durationSeconds: number | null) {
    if (!durationSeconds) return null;
    return `${Math.max(1, Math.round(durationSeconds / 60))} min`;
}

function buildExcludeParam(ids: string[]) {
    return Array.from(new Set(ids.filter(Boolean))).join(",");
}

export function FocusFeed() {
    const router = useRouter();
    const { completedIds, isLoaded } = useReadingProgress();
    const isDesktop = useMediaQuery("(min-width: 768px)");
    const [items, setItems] = useState<FocusFeedItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeCardIndex, setActiveCardIndex] = useState(0);
    const listRef = useRef<HTMLDivElement | null>(null);
    const seenIdsRef = useRef<Set<string>>(new Set());
    const hasInitializedRef = useRef(false);
    const isFetchingRef = useRef(false);

    const cards = useMemo(() => buildFocusCards(items), [items]);

    const fetchBatch = useCallback(async () => {
        if (isFetchingRef.current || !hasMore) {
            return;
        }

        isFetchingRef.current = true;
        setLoading(true);
        setError(null);

        try {
            const excludeIds = buildExcludeParam([
                ...completedIds,
                ...Array.from(seenIdsRef.current),
            ]);

            const params = new URLSearchParams({
                limit: String(BATCH_SIZE),
            });

            if (excludeIds) {
                params.set("excludeIds", excludeIds);
            }

            const response = await fetch(`/api/focus?${params.toString()}`);
            if (!response.ok) {
                throw new Error("Failed to load focus feed.");
            }

            const data = (await response.json()) as FocusFeedItem[];

            data.forEach((item) => seenIdsRef.current.add(item.id));
            setItems((current) => mergeUniqueFocusItems(current, data));
            setHasMore(data.length >= BATCH_SIZE);
        } catch (err) {
            console.error(err);
            setError("Focus mode is unavailable right now.");
        } finally {
            isFetchingRef.current = false;
            setLoading(false);
        }
    }, [completedIds, hasMore]);

    useEffect(() => {
        if (!isLoaded || hasInitializedRef.current) {
            return;
        }

        hasInitializedRef.current = true;
        void fetchBatch();
    }, [fetchBatch, isLoaded]);

    useEffect(() => {
        const list = listRef.current;
        if (!list) {
            return;
        }

        const cardElements = Array.from(
            list.querySelectorAll<HTMLElement>("[data-focus-card-index]")
        );

        if (cardElements.length === 0) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const visibleEntry = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

                if (!visibleEntry) {
                    return;
                }

                const nextIndex = Number(
                    (visibleEntry.target as HTMLElement).dataset.focusCardIndex ?? 0
                );
                setActiveCardIndex(Number.isNaN(nextIndex) ? 0 : nextIndex);
            },
            {
                root: list,
                threshold: [0.55, 0.85],
            }
        );

        cardElements.forEach((element) => observer.observe(element));
        return () => observer.disconnect();
    }, [cards.length]);

    useEffect(() => {
        if (!hasInitializedRef.current || loading || !hasMore || cards.length === 0) {
            return;
        }

        if (cards.length - activeCardIndex <= 3) {
            void fetchBatch();
        }
    }, [activeCardIndex, cards.length, fetchBatch, hasMore, loading]);

    return (
        <section className="px-4 py-3 md:px-6 lg:px-10">
            <div className="mx-auto max-w-3xl space-y-3">
                <header className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
                        Focus Mode
                    </p>
                </header>

                {!isLoaded || (loading && cards.length === 0) ? (
                    <LoadingState />
                ) : !loading && cards.length === 0 ? (
                    <EmptyState error={error} />
                ) : (
                    <div
                        ref={listRef}
                        data-testid="focus-feed-list"
                        className={`${FEED_VIEWPORT_CLASS} snap-y snap-mandatory overflow-y-auto overscroll-y-contain`}
                    >
                        <div className="space-y-3 pb-2">
                            {cards.map((card, index) => (
                                <FocusCardView
                                    key={card.id}
                                    card={card}
                                    cardIndex={index}
                                    isDesktop={isDesktop}
                                    onOpen={() => router.push(`/read/${card.id}`)}
                                />
                            ))}

                            {loading && cards.length > 0 && (
                                <div className="flex min-h-20 items-center justify-center py-3 text-sm text-muted-foreground">
                                    <Loader2 className="mr-2 size-4 animate-spin text-primary" />
                                    Loading more
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

function LoadingState() {
    return (
        <div className={`flex items-center justify-center rounded-3xl border border-border/60 bg-card/40 px-6 ${FEED_VIEWPORT_CLASS}`}>
            <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-5 py-3 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading focus mode
            </div>
        </div>
    );
}

function EmptyState({ error }: { error: string | null }) {
    return (
        <div className={`flex items-center justify-center rounded-3xl border border-border/60 bg-card/40 px-6 ${FEED_VIEWPORT_CLASS}`}>
            <div className="max-w-md rounded-[2rem] border border-border/60 bg-card/70 p-8 text-center shadow-sm">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Nothing queued yet
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Focus mode needs verified quick-mode content to build the feed.
                </p>
                {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            </div>
        </div>
    );
}

function FocusCardView({
    card,
    cardIndex,
    isDesktop,
    onOpen,
}: {
    card: FocusCard;
    cardIndex: number;
    isDesktop: boolean;
    onOpen: () => void;
}) {
    const duration = formatDuration(card.duration_seconds);
    const visibleTakeaways = isDesktop ? card.takeaways.slice(0, 4) : card.takeaways.slice(0, 3);

    return (
        <article
            data-focus-card-index={cardIndex}
            data-testid="focus-feed-card"
            className={`${FEED_VIEWPORT_CLASS} snap-start overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 px-5 py-4 shadow-sm backdrop-blur sm:px-6 sm:py-5`}
        >
            <div className="flex h-full flex-col">
                <div className="space-y-3">
                    <div className="space-y-2">
                        <h2 className="line-clamp-3 text-[1.2rem] font-semibold tracking-tight leading-[1.1] text-foreground sm:text-[1.5rem] sm:leading-[1.1]">
                            {card.title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/70 sm:text-xs">
                            {card.author && <span className="line-clamp-1">{card.author}</span>}
                            <span className="rounded-full border border-border/40 px-2 py-0.5 uppercase tracking-[0.16em] text-muted-foreground/80">
                                {card.type}
                            </span>
                            {card.category && (
                                <span className="line-clamp-1 rounded-full border border-border/40 px-2 py-0.5 text-muted-foreground/80">
                                    {card.category}
                                </span>
                            )}
                            {duration && (
                                <span className="rounded-full border border-border/40 px-2 py-0.5 text-muted-foreground/80">
                                    {duration}
                                </span>
                            )}
                        </div>
                    </div>

                    <section className="rounded-2xl border border-border/50 bg-background/45 p-4 sm:p-[1.125rem]">
                        <p className="line-clamp-6 text-[0.95rem] leading-[1.55] text-foreground/92 sm:text-[1rem] sm:leading-[1.55]">
                            {card.hook}
                        </p>
                    </section>

                    <section className="rounded-2xl border border-border/50 bg-background/45 p-4 sm:p-[1.125rem]">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/75 sm:text-[11px]">
                            Key Takeaways
                        </p>
                        {visibleTakeaways.length > 0 ? (
                            <div className="mt-2 space-y-2">
                                {visibleTakeaways.map((takeaway, index) => (
                                    <div
                                        key={`${card.id}-${index}`}
                                        className="flex gap-2.5 text-[0.85rem] leading-[1.55] text-foreground/88 sm:text-[0.9rem] sm:leading-[1.55]"
                                    >
                                        <span className="mt-0.5 text-[11px] font-semibold text-primary sm:text-xs">
                                            {String(index + 1).padStart(2, "0")}
                                        </span>
                                        <span className="line-clamp-2">{takeaway}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2.5 line-clamp-2 text-[0.9rem] leading-[1.55] text-muted-foreground">
                                Open the full summary for the complete breakdown.
                            </p>
                        )}
                    </section>

                    <div className="pt-0.5">
                        <button
                            type="button"
                            onClick={onOpen}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-primary/15"
                            aria-label={`View summary for ${card.title}`}
                        >
                            <BookOpen className="size-4" />
                            View summary
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
}
