/**
 * /read/[id] — Route-level loading skeleton
 *
 * Shown by Next.js when the server component is fetching content data.
 * Mirrors the ReaderView layout: hero header → big-idea card → accordion sections.
 */
export default function ReadLoading() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="max-w-3xl mx-auto px-5 sm:px-6 pt-8 pb-8 sm:pt-12 lg:pb-24">
                {/* Hero Header Skeleton */}
                <div className="space-y-4 mb-8">
                    <div className="h-8 w-3/4 bg-secondary/50 rounded-lg animate-pulse" />
                    <div className="flex items-center gap-3">
                        <div className="h-4 w-24 bg-secondary/40 rounded animate-pulse" />
                        <div className="h-4 w-16 bg-secondary/40 rounded animate-pulse" />
                    </div>
                    {/* Progress bar skeleton */}
                    <div className="h-1.5 w-full bg-secondary/30 rounded-full overflow-hidden">
                        <div className="h-full w-0 bg-primary/20 rounded-full" />
                    </div>
                </div>

                {/* Big Idea Skeleton */}
                <div className="bg-card/40 rounded-xl p-6 sm:p-8 border border-border/40 mb-8 space-y-3 animate-pulse">
                    <div className="h-3 w-20 bg-secondary/50 rounded" />
                    <div className="h-4 w-full bg-secondary/40 rounded" />
                    <div className="h-4 w-5/6 bg-secondary/40 rounded" />
                </div>

                {/* Accordion Sections Skeleton */}
                <div className="space-y-2">
                    <div className="h-3 w-16 bg-secondary/40 rounded mb-4 animate-pulse" />
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div
                            key={i}
                            className="flex items-center gap-4 p-4 rounded-xl bg-card/60 border border-transparent animate-pulse"
                            style={{ animationDelay: `${i * 100}ms` }}
                        >
                            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-secondary/50" />
                            <div className="flex-1 h-5 bg-secondary/40 rounded" />
                            <div className="flex-shrink-0 w-4 h-4 bg-secondary/30 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
