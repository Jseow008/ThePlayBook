"use client";

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

export function BrowseReadingPanel() {
    const authUser = useAuthUser();
    const { getProgress, hydrationStatus, hydrationIssue, snapshotBuilding, inProgressIds, isLoaded, retryHydration, user } = useReadingProgress();
    const isAuthenticated = Boolean(authUser);
    const isReady = isAuthenticated && isLoaded && user?.id === authUser?.id;
    const resumeIds = inProgressIds.slice(0, 3);
    const { data: resumeItems = [], isError: resumeError, isPending: resumePending, isPlaceholderData: resumeIsPlaceholder, refetch: refetchResume } = useBatchContentItems(resumeIds, {
        enabled: isReady,
    });
    const preferredResumeItem = resumeItems.find((item) => item.id === resumeIds[0]) ?? null;
    const fallbackResumeItem = !resumePending && !resumeIsPlaceholder && !resumeError
        ? resumeIds.slice(1).map((id) => resumeItems.find((item) => item.id === id)).find((item) => item !== undefined) ?? null
        : null;
    const resumeItem = isReady ? preferredResumeItem ?? fallbackResumeItem : null;
    const week = getCurrentUtcWeek();

    const { data: activityDays, isError: activityError, isPending: activityPending, refetch: refetchActivity } = useQuery({
        queryKey: ["browse-reading-days", authUser?.id ?? null, week.start, week.end],
        enabled: isAuthenticated,
        queryFn: async (): Promise<ActivityDay[]> => {
            const params = new URLSearchParams({ start: week.start, end: week.end });
            const response = await fetch(`/api/activity/history?${params}`);
            if (!response.ok) throw new Error("Could not load reading activity");
            return (await response.json()) as ActivityDay[];
        },
        staleTime: 30_000,
        refetchOnMount: "always",
        retry: 1,
    });

    const daysReadThisWeek = new Set(
        activityDays?.filter((day) => day.duration_seconds > 0).map((day) => day.activity_date) ?? [],
    ).size;
    if (!isAuthenticated) {
        return null;
    }

    const progressError = hydrationStatus === "error";
    const rateLimited = hydrationIssue?.kind === "rate_limited";
    const recoveryMessage = rateLimited && hydrationIssue.retryAt
        ? `We'll retry after ${new Date(hydrationIssue.retryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
        : hydrationIssue?.kind === "configuration" ? "Library sync needs service attention."
            : hydrationIssue?.kind === "preparing" ? "Your library is still preparing."
                : "Could not check current reading progress.";
    const progressPending = !isReady && !progressError;
    const resumeProgress = resumeItem ? getProgress(resumeItem.id) : null;
    const totalSegments = resumeProgress?.totalSegments ?? 0;
    const progressPercent = totalSegments > 0
        ? Math.min(100, Math.round((resumeProgress?.completed.length ?? 0) / totalSegments * 100))
        : null;
    const showResumeCard = Boolean(resumeItem) || (resumeIds.length > 0 && (resumePending || resumeIsPlaceholder || resumeError || progressPending || progressError));

    return (
        <div className="px-4 md:hidden lg:block lg:px-16" data-testid="browse-reading-panel">
            <div className={`grid gap-2 lg:gap-4 ${showResumeCard ? "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]" : "grid-cols-1"}`}>
                <section aria-labelledby="browse-reading-title" aria-busy={activityPending} className="flex min-h-24 flex-col justify-between rounded-2xl border border-border bg-card/70 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)] lg:min-h-48 lg:p-5 xl:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-2 lg:gap-4">
                        <h2 id="browse-reading-title" className="font-display text-base font-semibold text-foreground lg:text-lg">Your reading</h2>
                        <Link href="/profile" className="focus-ring touch-target-44 inline-flex shrink-0 items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                            View progress <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                    </div>
                    {activityPending ? (
                        <div className="flex items-center gap-2 lg:mt-5" role="status" aria-label="Loading reading activity">
                            <span className="h-8 w-8 animate-pulse rounded bg-secondary/70 lg:h-9" aria-hidden="true" />
                            <span className="h-4 w-36 animate-pulse rounded bg-secondary/70 lg:w-40" aria-hidden="true" />
                        </div>
                    ) : activityError && !activityDays ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground lg:mt-5 lg:gap-3" role="alert">
                            <span>Reading activity is unavailable.</span>
                            <button type="button" onClick={() => void refetchActivity()} className="focus-ring touch-target-44 rounded-sm font-medium text-foreground hover:underline">Retry</button>
                        </div>
                    ) : daysReadThisWeek > 0 ? (
                        <p className="flex items-baseline gap-2 text-foreground lg:mt-5">
                            <span className="font-display text-3xl font-semibold tabular-nums lg:text-4xl">
                                {daysReadThisWeek}
                            </span>
                            <span className="text-sm leading-5 text-muted-foreground">
                                reading {daysReadThisWeek === 1 ? "day" : "days"} this week
                            </span>
                        </p>
                    ) : <p className="text-sm text-muted-foreground lg:mt-5">No reading days yet this week</p>}
                    {activityError && activityDays ? (
                        <p className="mt-1 text-xs text-muted-foreground">Could not refresh activity. <button type="button" onClick={() => void refetchActivity()} className="focus-ring rounded-sm font-medium text-foreground hover:underline">Retry</button></p>
                    ) : null}
                    {progressError && resumeIds.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground" role="alert">{recoveryMessage} {!rateLimited && <button type="button" onClick={retryHydration} className="focus-ring rounded-sm font-medium text-foreground hover:underline">Retry</button>}</p>
                    ) : snapshotBuilding && resumeIds.length === 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground" role="status">Preparing your library…</p>
                    ) : null}
                </section>

                {showResumeCard ? (
                    <section aria-labelledby="browse-resume-title" className="min-h-32 rounded-2xl border border-border bg-card/70 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.15)] lg:min-h-48 lg:p-5 xl:p-6">
                        <div className="flex items-center justify-between gap-2">
                            <h2 id="browse-resume-title" className="font-display text-base font-semibold text-foreground lg:text-lg">Continue reading</h2>
                            {resumeItem ? (
                                <Link href={buildReadPath(resumeItem)} aria-label={`Continue reading ${resumeItem.title}`} className="focus-ring touch-target-44 inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground lg:hidden">
                                    <span className="hidden min-[360px]:inline">Continue reading</span> <ArrowRight className="size-4" aria-hidden="true" />
                                </Link>
                            ) : null}
                        </div>
                        {progressError && !resumeItem ? (
                            <div className="mt-3 flex min-h-20 items-center gap-3 text-sm text-muted-foreground" role="alert">
                                <span>{recoveryMessage}</span>
                                {!rateLimited && <button type="button" onClick={retryHydration} className="focus-ring touch-target-44 rounded-sm font-medium text-foreground hover:underline">Retry</button>}
                            </div>
                        ) : resumeItem ? (
                            <div className="flex min-w-0 items-start gap-3 lg:mt-3 lg:flex-wrap lg:items-center lg:gap-4">
                                <div className="relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-md bg-secondary lg:w-14 xl:w-16">
                                    {resumeItem.cover_image_url ? (
                                        <ResilientImage
                                            src={resumeItem.cover_image_url}
                                            alt=""
                                            fill
                                            sizes="(max-width: 767px) 40px, 64px"
                                            surface="content-card"
                                            className="object-cover"
                                            fallback={<BookOpen className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />}
                                        />
                                    ) : <BookOpen className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="line-clamp-2 break-words font-display text-sm font-semibold leading-5 text-foreground lg:line-clamp-none lg:truncate lg:text-base lg:leading-normal xl:text-lg" title={resumeItem.title}>{resumeItem.title}</p>
                                    {progressPercent !== null ? (
                                        <>
                                            <div role="progressbar" aria-label={`Reading progress for ${resumeItem.title}`} aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary lg:mt-3">
                                                <div className="h-full rounded-full bg-primary/75" style={{ width: `${progressPercent}%` }} />
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground lg:mt-2">{progressPercent}% complete{progressError ? " · Last known progress" : ""}</p>
                                        </>
                                    ) : <p className="mt-2 text-xs text-muted-foreground">{progressError ? "Last known progress" : "Pick up where you left off"}</p>}
                                    {progressError && <p className="mt-1 text-xs text-muted-foreground" role="status">{recoveryMessage} {!rateLimited && <button type="button" onClick={retryHydration} className="focus-ring rounded-sm font-medium text-foreground hover:underline">Retry</button>}</p>}
                                </div>
                                <Link href={buildReadPath(resumeItem)} className="focus-ring touch-target-44 ml-auto hidden shrink-0 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 lg:inline-flex xl:px-5">
                                    Continue reading <ArrowRight className="size-4" aria-hidden="true" />
                                </Link>
                            </div>
                        ) : resumeError ? (
                            <div className="mt-3 flex min-h-20 items-center gap-3 text-sm text-muted-foreground" role="alert">
                                <span>Continue reading is unavailable.</span>
                                <button type="button" onClick={() => void refetchResume()} className="focus-ring touch-target-44 rounded-sm font-medium text-foreground hover:underline">Retry</button>
                            </div>
                        ) : snapshotBuilding ? (
                            <p className="mt-3 text-sm text-muted-foreground" role="status">Preparing your library…</p>
                        ) : (
                            <div className="mt-3 h-20 animate-pulse rounded-lg bg-secondary/50" aria-hidden="true" />
                        )}
                    </section>
                ) : null}
            </div>
        </div>
    );
}
