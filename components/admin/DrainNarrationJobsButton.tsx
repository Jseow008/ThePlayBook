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
        batchSize?: number;
    };
    error?: {
        message?: string;
    };
};

function formatJobCount(count: number) {
    return `${count} job${count === 1 ? "" : "s"}`;
}

export function DrainNarrationJobsButton() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [queueSummary, setQueueSummary] = useState<NarrationQueueSummary | null>(null);
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
                        <div>{retryingCount} {retryingCount === 1 ? "job is" : "jobs are"} eligible for this recovery run</div>
                    </>
                ) : (
                    <span>Narration recovery status is unavailable right now.</span>
                )}
            </div>

            <button
                type="button"
                onClick={handleDrain}
                disabled={isProcessing}
                className="focus-ring mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <RefreshCw className={`size-4 ${isProcessing ? "animate-spin" : ""}`} />
                {isProcessing
                    ? `Retrying ${retryingCount > 0 ? formatJobCount(retryingCount) : "jobs"}...`
                    : "Run Recovery"}
            </button>

            {statusText && (
                <div className={`mt-3 text-xs font-medium ${statusText.startsWith("Error:") ? "text-red-500" : "text-emerald-500"}`}>
                    {statusText}
                </div>
            )}
        </div>
    );
}
