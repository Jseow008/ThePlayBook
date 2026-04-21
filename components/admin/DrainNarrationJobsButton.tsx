"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Waves } from "lucide-react";

type NarrationQueueSummary = {
    queuedCount: number;
    processingCount: number;
};

type DrainNarrationResponse = {
    data?: {
        processed?: boolean;
        processedCount?: number;
        discardedCount?: number;
        batchSize?: number;
        queueSummaryBefore?: NarrationQueueSummary;
        queueSummaryAfter?: NarrationQueueSummary;
    };
    error?: {
        message?: string;
    };
};

type NarrationStatusResponse = {
    data?: {
        summary?: NarrationQueueSummary;
        processingJobs?: NarrationProcessingJob[];
        staleProcessingJobs?: NarrationProcessingJob[];
        batchSize?: number;
    };
    error?: {
        message?: string;
    };
};

type NarrationProcessingJob = {
    id: string;
    title: string;
    author: string | null;
    requestedAt: string | null;
    startedAt: string | null;
    ageMs: number;
    isStale: boolean;
};

type ResetNarrationResponse = {
    data?: {
        resetCount?: number;
        jobs?: NarrationProcessingJob[];
    };
    error?: {
        message?: string;
    };
};

function formatJobCount(count: number) {
    return `${count} job${count === 1 ? "" : "s"}`;
}

function formatJobAge(ageMs: number) {
    const totalMinutes = Math.max(1, Math.round(ageMs / 60_000));
    if (totalMinutes < 60) {
        return `${totalMinutes}m`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function DrainNarrationJobsButton() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [queueSummary, setQueueSummary] = useState<NarrationQueueSummary | null>(null);
    const [processingJobs, setProcessingJobs] = useState<NarrationProcessingJob[]>([]);
    const [staleProcessingJobs, setStaleProcessingJobs] = useState<NarrationProcessingJob[]>([]);
    const [batchSize, setBatchSize] = useState(0);
    const [statusText, setStatusText] = useState("");

    const loadSummary = async () => {
        try {
            setIsLoadingSummary(true);
            const res = await fetch("/api/admin/narration/status", {
                method: "GET",
            });
            const data = await res.json() as NarrationStatusResponse;

            if (!res.ok) {
                throw new Error(data.error?.message || "Failed to load narration queue status.");
            }

            setQueueSummary(data.data?.summary ?? null);
            setProcessingJobs(data.data?.processingJobs ?? []);
            setStaleProcessingJobs(data.data?.staleProcessingJobs ?? []);
            setBatchSize(data.data?.batchSize ?? 0);
        } catch (error: any) {
            setStatusText(`Error: ${error.message}`);
        } finally {
            setIsLoadingSummary(false);
        }
    };

    const handleDrain = async () => {
        try {
            setIsProcessing(true);
            const queuedCount = queueSummary?.queuedCount ?? 0;
            const currentBatchSize = batchSize || 0;
            const retryingCount = currentBatchSize > 0 ? Math.min(queuedCount, currentBatchSize) : queuedCount;

            setStatusText(
                retryingCount > 0
                    ? `Retrying ${formatJobCount(retryingCount)} from the queue...`
                    : "Retrying queued narration jobs..."
            );

            const res = await fetch("/api/admin/narration/process", {
                method: "POST",
            });
            const data = await res.json() as DrainNarrationResponse;

            if (!res.ok) {
                throw new Error(data.error?.message || "Failed to retry queued narration jobs.");
            }

            const processedCount = data.data?.processedCount ?? 0;
            const discardedCount = data.data?.discardedCount ?? 0;
            const summaryAfter = data.data?.queueSummaryAfter ?? null;
            const summaryBefore = data.data?.queueSummaryBefore ?? null;

            setQueueSummary(summaryAfter);
            if (typeof data.data?.batchSize === "number") {
                setBatchSize(data.data.batchSize);
            }

            if (processedCount > 0) {
                const discardedSuffix = discardedCount > 0
                    ? ` ${discardedCount} job${discardedCount === 1 ? "" : "s"} were skipped because they no longer needed recovery.`
                    : "";
                const remainingQueued = summaryAfter?.queuedCount ?? Math.max((summaryBefore?.queuedCount ?? processedCount) - processedCount, 0);
                const processingSuffix = (summaryAfter?.processingCount ?? 0) > 0
                    ? ` ${summaryAfter?.processingCount} ${summaryAfter?.processingCount === 1 ? "job is" : "jobs are"} still processing.`
                    : "";
                setStatusText(
                    `Processed ${processedCount} queued narration job${processedCount === 1 ? "" : "s"}. ${remainingQueued} ${remainingQueued === 1 ? "job remains" : "jobs remain"} queued.${processingSuffix}${discardedSuffix}`
                );
                return;
            }

            if (discardedCount > 0) {
                const remainingQueued = summaryAfter?.queuedCount ?? 0;
                setStatusText(
                    `No queued narration jobs needed processing. ${discardedCount} stale recovery attempt${discardedCount === 1 ? " was" : "s were"} skipped safely. ${remainingQueued} ${remainingQueued === 1 ? "job remains" : "jobs remain"} queued.`
                );
                return;
            }

            setStatusText("No queued narration jobs found.");
        } catch (error: any) {
            setStatusText(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleResetStaleJobs = async () => {
        try {
            setIsResetting(true);
            setStatusText(
                staleProcessingJobs.length > 0
                    ? `Resetting ${formatJobCount(staleProcessingJobs.length)} that exceeded the processing safety window...`
                    : "Resetting stale narration jobs..."
            );

            const res = await fetch("/api/admin/narration/reset", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    jobIds: staleProcessingJobs.map((job) => job.id),
                }),
            });
            const data = await res.json() as ResetNarrationResponse;

            if (!res.ok) {
                throw new Error(data.error?.message || "Failed to reset stale narration jobs.");
            }

            const resetCount = data.data?.resetCount ?? 0;
            const resetTitles = (data.data?.jobs ?? []).map((job) => job.title).filter(Boolean);
            await loadSummary();

            if (resetCount > 0) {
                setStatusText(
                    `Reset ${resetCount} stale narration job${resetCount === 1 ? "" : "s"}: ${resetTitles.join(", ")}.`
                );
                return;
            }

            setStatusText("No stale narration jobs required a reset.");
        } catch (error: any) {
            setStatusText(`Error: ${error.message}`);
        } finally {
            setIsResetting(false);
        }
    };

    useEffect(() => {
        void loadSummary();

        const intervalId = window.setInterval(() => {
            void loadSummary();
        }, 15000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    const queuedCount = queueSummary?.queuedCount ?? 0;
    const processingCount = queueSummary?.processingCount ?? 0;
    const retryingCount = batchSize > 0 ? Math.min(queuedCount, batchSize) : queuedCount;
    const isBusy = isProcessing || isResetting;

    return (
        <div className="min-w-[18rem] max-w-sm rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm">
            <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <Waves className="mt-0.5 size-4 text-primary" />
                <span>Retry Narration Jobs</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
                Manually drain queued narration jobs when one appears stuck on Hobby. This runs the same recovery worker used by the background processor.
            </p>

            <div className="mt-3 space-y-1 text-[11px] leading-5 text-zinc-500">
                {isLoadingSummary ? (
                    <span>Loading narration recovery status...</span>
                ) : queueSummary ? (
                    <>
                        <div>{queuedCount} queued for recovery</div>
                        <div>{processingCount} currently processing in the background</div>
                        {processingJobs.length > 0 ? (
                            <div className="pt-1">
                                <div className="font-medium text-foreground">Currently processing</div>
                                <div className="mt-1 space-y-1">
                                    {processingJobs.map((job) => (
                                        <div key={job.id}>
                                            <span className={job.isStale ? "text-amber-600" : "text-zinc-500"}>
                                                {job.title}
                                                {job.author ? ` by ${job.author}` : ""}
                                                {job.startedAt ? ` • ${formatJobAge(job.ageMs)}` : ""}
                                                {job.isStale ? " • stale" : ""}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <div>{retryingCount} {retryingCount === 1 ? "job is" : "jobs are"} eligible for this recovery run</div>
                    </>
                ) : (
                    <span>Narration recovery status is unavailable right now.</span>
                )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={handleDrain}
                    disabled={isBusy}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw className={`size-4 ${isProcessing ? "animate-spin" : ""}`} />
                    {isProcessing
                        ? `Retrying ${retryingCount > 0 ? formatJobCount(retryingCount) : "jobs"}...`
                        : "Run Recovery"}
                </button>

                <button
                    type="button"
                    onClick={handleResetStaleJobs}
                    disabled={isBusy || staleProcessingJobs.length === 0}
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw className={`size-4 ${isResetting ? "animate-spin" : ""}`} />
                    {isResetting ? "Resetting Stale Jobs..." : "Reset Stale Processing"}
                </button>
            </div>

            {statusText && (
                <div className={`mt-3 text-xs font-medium ${statusText.startsWith("Error:") ? "text-red-500" : "text-emerald-500"}`}>
                    {statusText}
                </div>
            )}
        </div>
    );
}
