"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type SyncSummary = {
    verified_items: number;
    content_embedding_ready_items: number;
    missing_content_embeddings: number;
};

type SyncEmbeddingsResponse = {
    summary?: SyncSummary;
    results?: {
        processed: number;
        success: number;
        failed: number;
    };
    error?: {
        message?: string;
    };
};

export function SyncEmbeddingsButton() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [statusText, setStatusText] = useState("");
    const [statusTone, setStatusTone] = useState<"error" | "warning" | "info" | "success">("info");
    const [summary, setSummary] = useState<SyncSummary | null>(null);

    const loadSummary = async (isManualRefresh = false) => {
        try {
            if (isManualRefresh) {
                setIsRefreshing(true);
            } else {
                setIsLoadingSummary(true);
            }

            const res = await fetch("/api/admin/embeddings/sync", {
                method: "GET",
            });
            const data = await res.json() as SyncEmbeddingsResponse;

            if (!res.ok) {
                throw new Error(data.error?.message || "Failed to load embedding readiness");
            }
            if (!data.summary) {
                throw new Error("Embedding readiness is unavailable");
            }

            setSummary(data.summary);
            if (isManualRefresh) {
                setStatusText("Embedding readiness refreshed.");
                setStatusTone("success");
            }
            return data.summary;
        } catch (error: any) {
            setStatusText("Error: " + error.message);
            setStatusTone("error");
            return null;
        } finally {
            setIsLoadingSummary(false);
            setIsRefreshing(false);
        }
    };

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            setStatusText("Syncing...");
            setStatusTone("info");

            const res = await fetch("/api/admin/embeddings/sync", {
                method: "POST",
            });

            const data = await res.json() as SyncEmbeddingsResponse;

            if (!res.ok) {
                const errorMessage = data?.error?.message || data?.error || "Failed to sync embeddings";
                throw new Error(typeof errorMessage === "string" ? errorMessage : "Failed to sync embeddings");
            }

            const latestSummary = await loadSummary();
            if (!latestSummary) return;

            const results = data.results;
            if (results?.failed) {
                setStatusText(`Synced ${results.success} of ${results.processed} items; ${results.failed} failed. ${latestSummary.missing_content_embeddings} still need content embeddings.`);
                setStatusTone("warning");
            } else if (latestSummary.missing_content_embeddings > 0) {
                setStatusText(`Synced ${results?.success ?? 0} items. ${latestSummary.missing_content_embeddings} still need content embeddings; run another batch.`);
                setStatusTone("info");
            } else {
                setStatusText("All content embeddings are up to date.");
                setStatusTone("success");
            }
        } catch (error: any) {
            console.error("Sync error:", error);
            setStatusText("Error: " + error.message);
            setStatusTone("error");
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        void loadSummary();
    }, []);

    return (
        <div className="w-full min-w-0 rounded-xl border border-border bg-card px-4 py-3 text-left shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                        Sync Content Embeddings
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Verified content needs a fresh metadata embedding before AI retrieval is considered ready. Each run processes up to 25 items.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => void loadSummary(true)}
                    disabled={isRefreshing || isLoadingSummary || isSyncing}
                    className="focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCw className={`size-3.5 ${isRefreshing || isLoadingSummary ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            <div className="mt-3 space-y-2 text-[11px] leading-5 text-zinc-500">
                {isLoadingSummary ? (
                    <span>Loading embedding readiness...</span>
                ) : summary ? (
                    <>
                        <div>{summary.verified_items} verified items tracked</div>
                        <div>{summary.content_embedding_ready_items} items already have content embeddings</div>
                        <div>{summary.missing_content_embeddings} verified items still need content embeddings</div>
                    </>
                ) : (
                    <span>No content embedding readiness is available yet.</span>
                )}
            </div>

            <button
                onClick={handleSync}
                disabled={isSyncing}
                className="focus-ring mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing Embeddings..." : "Run Content Sync"}
            </button>

            {statusText && (
                <span role="status" className={`mt-3 block text-xs font-medium ${statusTone === "error" ? "text-red-500" : statusTone === "warning" ? "text-amber-600" : statusTone === "success" ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {statusText}
                </span>
            )}
        </div>
    );
}
