import { Loader2 } from "lucide-react";
import { FEED_LIST_VIEWPORT_CLASS } from "@/components/focus/focus-feed-layout";

export function LoadingState() {
    return (
        <div className={`flex items-center justify-center rounded-3xl border border-border/60 bg-card/40 px-6 ${FEED_LIST_VIEWPORT_CLASS}`}>
            <div className="flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-5 py-3 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="size-4 animate-spin text-primary" />
                Loading focus mode
            </div>
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
