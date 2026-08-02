import {
    READER_COVER_FRAME_CLASS,
    READER_COVER_WRAPPER_CLASS,
} from "@/components/ui/content-card-standards";

const TAKEAWAY_LINE_WIDTHS = ["w-11/12", "w-4/5", "w-2/3"] as const;
const SEGMENT_LINE_WIDTHS = ["w-2/3", "w-3/4", "w-1/2", "w-4/5"] as const;

function ContentHeroSkeleton({ showPrimaryAction }: { showPrimaryAction: boolean }) {
    return (
        <div className="mb-6 flex flex-col gap-6 sm:flex-row sm:gap-8">
            <div className={READER_COVER_WRAPPER_CLASS}>
                <div
                    data-testid="content-detail-loading-cover"
                    className={`${READER_COVER_FRAME_CLASS} mx-auto rounded-2xl border border-border bg-secondary/45 shadow-2xl shadow-black/20 sm:mx-0`}
                />
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
                <div className="mx-auto mb-3 h-8 w-4/5 max-w-md rounded-full bg-secondary/55 sm:mx-0 sm:h-9" />
                <div className="mx-auto mb-5 h-5 w-2/5 max-w-44 rounded-full bg-secondary/40 sm:mx-0" />

                <div className="mb-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <div className="h-7 w-16 rounded-lg border border-border/60 bg-secondary/45" />
                    <div className="h-7 w-24 rounded-lg border border-border/60 bg-secondary/45" />
                    <div className="h-7 w-20 rounded-lg border border-border/60 bg-secondary/45" />
                </div>

                <div className="flex justify-center gap-2.5 sm:justify-start">
                    {showPrimaryAction ? (
                        <div className="hidden h-12 min-w-44 flex-1 rounded-xl bg-primary/35 sm:block" />
                    ) : null}
                    <div className="size-10 rounded-full border border-border/50 bg-secondary/35 sm:size-12 sm:rounded-xl" />
                    <div className="size-10 rounded-full border border-border/50 bg-secondary/35 sm:size-12 sm:rounded-xl" />
                </div>
            </div>
        </div>
    );
}

function TakeawayRowsSkeleton() {
    return (
        <div className="grid gap-3">
            {TAKEAWAY_LINE_WIDTHS.map((width) => (
                <div
                    key={width}
                    className="flex gap-4 rounded-xl border border-border/40 bg-card/40 p-4"
                >
                    <div className="size-8 shrink-0 rounded-lg bg-primary/15" />
                    <div className="flex flex-1 flex-col justify-center gap-2">
                        <div className={`h-4 rounded-full bg-secondary/50 ${width}`} />
                        <div className="h-4 w-3/5 rounded-full bg-secondary/40" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function PreviewLoadingState() {
    return (
        <div
            data-testid="preview-loading-state"
            role="status"
            aria-label="Loading preview"
            aria-busy="true"
            className="min-h-screen bg-background pb-[calc(5.75rem+var(--safe-area-bottom))] text-foreground sm:pb-10 lg:pb-8"
        >
            <span className="sr-only">Loading preview</span>
            <div
                aria-hidden="true"
                className="mx-auto max-w-3xl px-5 pb-3 pt-8 motion-safe:animate-pulse sm:px-6 sm:py-12"
            >
                <ContentHeroSkeleton showPrimaryAction />

                <div
                    data-testid="preview-loading-hook"
                    className="mb-4 space-y-2 rounded-r-xl border-l-[3px] border-primary/35 bg-secondary/30 py-4 pl-5 pr-6"
                >
                    <div className="h-4 w-full rounded-full bg-secondary/55" />
                    <div className="h-4 w-11/12 rounded-full bg-secondary/55" />
                    <div className="h-4 w-3/5 rounded-full bg-secondary/55" />
                </div>

                <div className="mb-4 h-3.5 w-28 rounded-full bg-secondary/45" />
                <TakeawayRowsSkeleton />

                <div className="fixed inset-x-0 bottom-0 z-50 flex h-20 items-end px-3 safe-area-pb-sm sm:hidden">
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background via-background/70 to-transparent" />
                    <div className="relative mx-auto flex w-full max-w-3xl gap-2 rounded-2xl border border-border/45 bg-background/75 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.32)] backdrop-blur-xl">
                        <div className="h-11 min-w-0 flex-1 rounded-xl bg-primary/35" />
                        <div className="size-11 rounded-xl border border-border/40 bg-secondary/35" />
                        <div className="size-11 rounded-xl border border-border/40 bg-secondary/35" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ReaderLoadingState() {
    return (
        <div
            data-testid="reader-loading-state"
            role="status"
            aria-label="Loading reader"
            aria-busy="true"
            className="min-h-screen bg-background font-sans text-foreground"
        >
            <span className="sr-only">Loading reader</span>
            <div
                aria-hidden="true"
                className="mx-auto max-w-3xl px-5 pb-8 pt-8 motion-safe:animate-pulse sm:px-6 sm:pt-12 lg:pb-24"
            >
                <ContentHeroSkeleton showPrimaryAction={false} />

                <div className="mb-8">
                    <div className="mb-2 flex justify-between">
                        <div className="h-3 w-28 rounded-full bg-secondary/40" />
                        <div className="h-3 w-32 rounded-full bg-secondary/40" />
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full w-1/4 rounded-full bg-primary/35" />
                    </div>
                </div>

                <div
                    data-testid="reader-loading-big-idea"
                    className="mb-8 space-y-3 rounded-xl border border-border/40 bg-card/40 p-6 sm:p-8"
                >
                    <div className="h-3.5 w-24 rounded-full bg-primary/25" />
                    <div className="h-5 w-full rounded-full bg-secondary/50" />
                    <div className="h-5 w-4/5 rounded-full bg-secondary/50" />
                </div>

                <div className="mb-4 h-3.5 w-20 rounded-full bg-secondary/45" />
                <div className="space-y-2">
                    {SEGMENT_LINE_WIDTHS.map((width) => (
                        <div
                            key={width}
                            data-testid="reader-loading-segment"
                            className="flex items-center gap-4 rounded-xl border border-transparent bg-card/60 p-4"
                        >
                            <div className="size-9 shrink-0 rounded-lg bg-secondary/60" />
                            <div className={`h-5 rounded-full bg-secondary/50 ${width}`} />
                            <div className="ml-auto size-4 shrink-0 rounded bg-secondary/40" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
