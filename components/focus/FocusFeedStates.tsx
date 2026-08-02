import {
    FEED_CARD_HEIGHT_CLASS,
    FEED_LIST_VIEWPORT_CLASS,
} from "@/components/focus/focus-feed-layout";

export function LoadingState() {
    return (
        <div
            data-testid="focus-loading-state"
            role="status"
            aria-busy="true"
            aria-live="polite"
            className={`overflow-hidden ${FEED_LIST_VIEWPORT_CLASS}`}
        >
            <span className="sr-only">Loading focus mode</span>
            <article
                aria-hidden="true"
                className={`${FEED_CARD_HEIGHT_CLASS} overflow-hidden rounded-[2rem] border border-border/60 bg-card/70 px-5 py-4 shadow-sm backdrop-blur motion-safe:animate-pulse sm:px-6 sm:py-5`}
            >
                <div className="flex h-full min-h-0 flex-col md:hidden">
                    <div className="space-y-3">
                        <div className="flex justify-center">
                            <div
                                data-testid="focus-loading-cover"
                                className="aspect-[2/3] w-[clamp(7rem,18dvh,8.75rem)] rounded-[1.35rem] border border-white/10 bg-secondary/50 shadow-[0_22px_50px_-24px_rgba(0,0,0,0.85)]"
                            />
                        </div>

                        <div className="space-y-3 text-center">
                            <div className="mx-auto h-6 w-3/4 max-w-[22rem] rounded-full bg-secondary/55" />
                            <div className="mx-auto h-4 w-2/5 max-w-40 rounded-full bg-secondary/40" />
                            <div className="flex justify-center gap-1.5">
                                <div className="h-6 w-14 rounded-full border border-border/50 bg-secondary/45" />
                                <div className="h-6 w-20 rounded-full border border-border/50 bg-secondary/45" />
                                <div className="h-6 w-14 rounded-full border border-border/50 bg-secondary/45" />
                            </div>
                            <div className="flex justify-center gap-3">
                                <div className="size-9 rounded-full bg-secondary/40" />
                                <div className="size-9 rounded-full bg-secondary/40" />
                            </div>
                        </div>

                        <div
                            data-testid="focus-loading-hook"
                            className="space-y-2 rounded-[1.4rem] border border-border/35 bg-secondary/20 px-4 py-3 sm:px-5"
                        >
                            <div className="h-4 w-full rounded-full bg-secondary/55" />
                            <div className="h-4 w-11/12 rounded-full bg-secondary/55" />
                            <div className="h-4 w-3/5 rounded-full bg-secondary/55" />
                        </div>

                        <div className="flex justify-center pt-0.5">
                            <div className="h-11 w-40 rounded-full bg-primary/35" />
                        </div>
                    </div>
                </div>

                <div className="hidden h-full min-h-0 flex-col gap-3 md:flex">
                    <div className="space-y-3 text-center">
                        <div className="flex justify-center">
                            <div className="aspect-[2/3] w-[clamp(5.75rem,16dvh,8.25rem)] rounded-[1.35rem] border border-white/10 bg-secondary/50 shadow-[0_22px_50px_-24px_rgba(0,0,0,0.85)]" />
                        </div>
                        <div className="mx-auto h-7 w-3/5 max-w-[28rem] rounded-full bg-secondary/55" />
                        <div className="mx-auto h-4 w-36 rounded-full bg-secondary/40" />
                        <div className="flex justify-center gap-2">
                            <div className="h-5 w-14 rounded-full border border-border/50 bg-secondary/45" />
                            <div className="h-5 w-20 rounded-full border border-border/50 bg-secondary/45" />
                            <div className="h-5 w-14 rounded-full border border-border/50 bg-secondary/45" />
                        </div>
                        <div className="flex justify-center gap-2">
                            <div className="size-9 rounded-full border border-border/45 bg-secondary/30" />
                            <div className="size-9 rounded-full border border-border/45 bg-secondary/30" />
                        </div>
                    </div>

                    <div className="space-y-2 rounded-r-2xl border-l-[3px] border-primary/30 bg-secondary/25 py-2 pl-5 pr-4">
                        <div className="h-4 w-full rounded-full bg-secondary/55" />
                        <div className="h-4 w-5/6 rounded-full bg-secondary/55" />
                    </div>

                    <div className="min-h-0 flex-1 space-y-2.5 px-1">
                        <div className="h-3 w-24 rounded-full bg-secondary/40" />
                        {["w-11/12", "w-4/5", "w-3/4"].map((width) => (
                            <div key={width} className="flex items-center gap-3">
                                <div className="size-6 shrink-0 rounded-lg bg-primary/20" />
                                <div className={`h-4 rounded-full bg-secondary/50 ${width}`} />
                            </div>
                        ))}
                    </div>

                    <div className="h-10 w-36 rounded-full bg-primary/35" />
                </div>
            </article>
        </div>
    );
}

export function EmptyState({
    error,
    onRetry,
}: {
    error: string | null;
    onRetry: () => void;
}) {
    return (
        <div className={`flex items-center justify-center rounded-3xl border border-border/60 bg-card/40 px-6 ${FEED_LIST_VIEWPORT_CLASS}`}>
            <div className="max-w-md rounded-[2rem] border border-border/60 bg-card/70 p-8 text-center shadow-sm">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    Nothing queued yet
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Focus mode needs verified quick-mode content to build the feed.
                </p>
                {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
                {error && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="focus-ring mt-5 inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Retry
                    </button>
                )}
            </div>
        </div>
    );
}
