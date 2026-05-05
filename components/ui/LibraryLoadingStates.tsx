import { cn } from "@/lib/utils";

export const LIBRARY_CARD_GRID_CLASS = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4 md:gap-6";

export function LibraryStatBadge({
    count,
    label,
    isLoading,
}: {
    count: number;
    label: string;
    isLoading: boolean;
}) {
    if (isLoading) {
        return (
            <div
                aria-hidden="true"
                className="hidden h-7 w-32 animate-pulse rounded-full border border-border/50 bg-secondary/30 sm:flex"
            />
        );
    }

    return (
        <div className="hidden items-center gap-2 rounded-full border border-border/50 bg-secondary/30 px-3 py-1 text-sm text-muted-foreground sm:flex">
            <span className="font-bold text-foreground">{count}</span>
            <span className="text-xs uppercase tracking-wider">{label}</span>
        </div>
    );
}

export function LibraryToolbarSkeleton({ className }: { className?: string }) {
    return (
        <div
            aria-hidden="true"
            className={cn("flex flex-col gap-2.5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-3", className)}
        >
            <div className="h-10 w-full animate-pulse rounded-full border border-border/60 bg-secondary/40 lg:w-64" />
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap lg:gap-3">
                <div className="flex flex-wrap gap-2 lg:rounded-full lg:border lg:border-border/60 lg:bg-secondary/25 lg:p-1">
                    {[...Array(4)].map((_, index) => (
                        <div
                            key={index}
                            className="h-8 w-16 animate-pulse rounded-full border border-border/60 bg-secondary/25 lg:w-20"
                        />
                    ))}
                </div>
                <div className="h-8 w-28 shrink-0 animate-pulse rounded-full border border-border/60 bg-secondary/25 lg:h-9" />
            </div>
        </div>
    );
}

export function LibraryGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div className={LIBRARY_CARD_GRID_CLASS}>
            {[...Array(count)].map((_, index) => (
                <div
                    key={index}
                    className="aspect-[2/3] animate-pulse rounded-lg bg-secondary/50"
                />
            ))}
        </div>
    );
}
