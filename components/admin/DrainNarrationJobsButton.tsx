"use client";

import { useState } from "react";
import { RefreshCw, Waves } from "lucide-react";

type DrainNarrationResponse = {
    data?: {
        processed?: boolean;
        processedCount?: number;
        discardedCount?: number;
    };
    error?: {
        message?: string;
    };
};

export function DrainNarrationJobsButton() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState("");

    const handleDrain = async () => {
        try {
            setIsProcessing(true);
            setStatusText("Retrying queued narration jobs...");

            const res = await fetch("/api/admin/narration/process", {
                method: "POST",
            });
            const data = await res.json() as DrainNarrationResponse;

            if (!res.ok) {
                throw new Error(data.error?.message || "Failed to retry queued narration jobs.");
            }

            const processedCount = data.data?.processedCount ?? 0;
            const discardedCount = data.data?.discardedCount ?? 0;

            if (processedCount > 0) {
                const discardedSuffix = discardedCount > 0
                    ? ` ${discardedCount} job${discardedCount === 1 ? "" : "s"} were skipped because they no longer needed recovery.`
                    : "";
                setStatusText(`Processed ${processedCount} queued narration job${processedCount === 1 ? "" : "s"}.${discardedSuffix}`);
                return;
            }

            if (discardedCount > 0) {
                setStatusText(`No queued narration jobs needed processing. ${discardedCount} stale recovery attempt${discardedCount === 1 ? " was" : "s were"} skipped safely.`);
                return;
            }

            setStatusText("No queued narration jobs found.");
        } catch (error: any) {
            setStatusText(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-w-[18rem] max-w-sm rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm">
            <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <Waves className="mt-0.5 size-4 text-primary" />
                <span>Retry Narration Jobs</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
                Manually drain queued narration jobs when one appears stuck on Hobby. This runs the same recovery worker used by the background processor.
            </p>

            <button
                type="button"
                onClick={handleDrain}
                disabled={isProcessing}
                className="focus-ring mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <RefreshCw className={`size-4 ${isProcessing ? "animate-spin" : ""}`} />
                {isProcessing ? "Retrying Jobs..." : "Run Recovery"}
            </button>

            {statusText && (
                <div className={`mt-3 text-xs font-medium ${statusText.startsWith("Error:") ? "text-red-500" : "text-emerald-500"}`}>
                    {statusText}
                </div>
            )}
        </div>
    );
}
