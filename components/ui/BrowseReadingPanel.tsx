"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen } from "lucide-react";
import { useReadingProgress } from "@/hooks/useReadingProgress";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useBatchContentItems } from "@/hooks/use-content-queries";
import { buildReadPath } from "@/lib/content-paths";
import { ResilientImage } from "@/components/ui/ResilientImage";

type ActivityDay = {
    activity_date: string;
    duration_seconds: number;
};

function getCurrentUtcWeek() {
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));

    return {
        start: start.toISOString().slice(0, 10),
        end: today.toISOString().slice(0, 10),
    };
}

function useDesktopViewport() {
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const query = window.matchMedia("(min-width: 1024px)");
        const update = () => setIsDesktop(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    return isDesktop;
}

export function BrowseReadingPanel() {
    const authUser = useAuthUser();
    const { completedIds, getProgress, inProgressIds, isLoaded, user } = useReadingProgress();
    const isDesktop = useDesktopViewport();
    const isAuthenticatedDesktop = isDesktop && Boolean(authUser);
    const isReady = isAuthenticatedDesktop && isLoaded && user?.id === authUser?.id;
    const resumeIds = inProgressIds.slice(0, 3);
    const { data: resumeItems = [], isPending: resumePending } = useBatchContentItems(resumeIds, {
        enabled: isReady,
    });
    const resumeItem = resumeItems[0] ?? null;
    const week = getCurrentUtcWeek();

    const { data: activityDays, isPending: activityPending } = useQuery({
        queryKey: ["browse-reading-days", authUser?.id ?? null, week.start, week.end],
        enabled: isAuthenticatedDesktop,
        queryFn: async (): Promise<ActivityDay[]> => {
            const params = new URLSearchParams({ start: week.start, end: week.end });
            const response = await fetch(`/api/activity/history?${params}`);
            if (!response.ok) throw new Error("Could not load reading activity");
            return (await response.json()) as ActivityDay[];
        },
        staleTime: 30_000,
        refetchOnMount: "always",
    });

    const daysReadThisWeek = new Set(
        activityDays?.filter((day) => day.duration_seconds > 0).map((day) => day.activity_date) ?? [],
    ).size;
    if (!isAuthenticatedDesktop) {
        return null;
    }

    const hasLocalReading = isReady && (completedIds.length > 0 || inProgressIds.length > 0);
    const isLoading = !isReady || activityPending;
    if (!isLoading && !hasLocalReading && daysReadThisWeek === 0) return null;

    const resumeProgress = resumeItem ? getProgress(resumeItem.id) : null;
    const totalSegments = resumeProgress?.totalSegments ?? 0;
    const progressPercent = totalSegments > 0
        ? Math.min(100, Math.round((resumeProgress?.completed.length ?? 0) / totalSegments * 100))
        : null;
    const showResumeCard = Boolean(resumeItem) || (resumeIds.length > 0 && resumePending);

    return (
        <div className="hidden px-6 lg:block lg:px-16" data-testid="browse-reading-panel">
            <div className={`grid gap-4 ${showResumeCard ? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" : "grid-cols-1"}`}>
                <section aria-labelledby="browse-reading-title" aria-busy={isLoading} className="flex min-h-36 flex-col justify-between rounded-2xl border border-border bg-card/70 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.15)] xl:p-6">
                    <div className="flex items-start justify-between gap-4">
                        <h2 id="browse-reading-title" className="font-display text-lg font-semibold text-foreground">Your reading</h2>
                        {isReady ? (
                            <Link href="/profile" className="focus-ring touch-target-44 inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                                View progress <ArrowRight className="size-4" aria-hidden="true" />
                            </Link>
                        ) : <span className="h-4 w-24 animate-pulse rounded bg-secondary/70" aria-hidden="true" />}
                    </div>
                    {activityPending || !isReady ? (
                        <div className="mt-5 flex items-center gap-2" role="status" aria-label="Loading reading activity">
                            <span className="h-9 w-8 animate-pulse rounded bg-secondary/70" aria-hidden="true" />
                            <span className="h-4 w-40 animate-pulse rounded bg-secondary/70" aria-hidden="true" />
                        </div>
                    ) : (
                        <p className="mt-5 flex items-baseline gap-2 text-foreground">
                            <span className="font-display text-4xl font-semibold tabular-nums">
                                {activityDays ? daysReadThisWeek : "–"}
                            </span>
                            <span className="text-sm leading-5 text-muted-foreground">
                                reading {daysReadThisWeek === 1 ? "day" : "days"} this week
                            </span>
                        </p>
                    )}
                </section>

                {showResumeCard ? (
                    <section aria-labelledby="browse-resume-title" className="min-h-36 rounded-2xl border border-border bg-card/70 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.15)] xl:p-6">
                        <h2 id="browse-resume-title" className="font-display text-lg font-semibold text-foreground">Continue reading</h2>
                        {resumeItem ? (
                            <div className="mt-3 flex min-w-0 items-center gap-4">
                                <div className="relative aspect-[2/3] w-14 shrink-0 overflow-hidden rounded-md bg-secondary xl:w-16">
                                    {resumeItem.cover_image_url ? (
                                        <ResilientImage
                                            src={resumeItem.cover_image_url}
                                            alt=""
                                            fill
                                            sizes="64px"
                                            surface="content-card"
                                            className="object-cover"
                                            fallback={<BookOpen className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />}
                                        />
                                    ) : <BookOpen className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-display text-base font-semibold text-foreground xl:text-lg" title={resumeItem.title}>{resumeItem.title}</p>
                                    {progressPercent !== null ? (
                                        <>
                                            <div role="progressbar" aria-label={`Reading progress for ${resumeItem.title}`} aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                                                <div className="h-full rounded-full bg-primary/75" style={{ width: `${progressPercent}%` }} />
                                            </div>
                                            <p className="mt-2 text-xs text-muted-foreground">{progressPercent}% complete</p>
                                        </>
                                    ) : <p className="mt-2 text-xs text-muted-foreground">Pick up where you left off</p>}
                                </div>
                                <Link href={buildReadPath(resumeItem)} className="focus-ring touch-target-44 inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 xl:px-5">
                                    Continue reading <ArrowRight className="size-4" aria-hidden="true" />
                                </Link>
                            </div>
                        ) : (
                            <div className="mt-3 h-20 animate-pulse rounded-lg bg-secondary/50" aria-hidden="true" />
                        )}
                    </section>
                ) : null}
            </div>
        </div>
    );
}
