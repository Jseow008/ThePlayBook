"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

type CoverageSummary = {
    total_library_content_items: number;
    embedded_content_items: number;
    missing_segments: number;
};

export function SyncSegmentEmbeddingsButton() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
    const [summary, setSummary] = useState<CoverageSummary | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadSummary = async () => {
            try {
                setIsLoadingSummary(true);
                const res = await fetch("/api/admin/embeddings/sync-segments", {
                    method: "GET",
                });
                const data = await res.json();

                if (!res.ok) {
                    const errorMessage = data?.error?.message || "Failed to load embedding coverage";
                    throw new Error(typeof errorMessage === "string" ? errorMessage : "Failed to load embedding coverage");
                }

                if (isMounted) {
                    setSummary(data.summary ?? null);
                }
            } catch (error: any) {
                if (isMounted) {
                    setStatus({ tone: "error", text: "Error: " + error.message });
                }
            } finally {
                if (isMounted) {
                    setIsLoadingSummary(false);
                }
            }
        };

        void loadSummary();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            setStatus(null);

            const res = await fetch("/api/admin/embeddings/sync-segments", {
                method: "POST",
            });

            const data = await res.json();

            if (!res.ok) {
                const errorMessage = data?.error?.message || data?.error || "Failed to sync segments";
                throw new Error(typeof errorMessage === 'string' ? errorMessage : "Failed to sync segment embeddings");
            }

            if (data.results && data.results.processed > 0) {
                const failureSuffix = data.results.failed > 0
                    ? ` ${data.results.failed} failed.`
                    : "";
                const moreSuffix = data.results.has_more_to_process
                    ? " More segments remain to be processed."
                    : "";

                setStatus({
                    tone: data.results.failed > 0 ? "error" : "success",
                    text: `Processed ${data.results.processed} segments. Synced ${data.results.success}.${failureSuffix}${moreSuffix}`,
                });
            } else {
                setStatus({ tone: "success", text: "All Gemini segment embeddings are up to date." });
            }

            if (data.summary) {
                setSummary(data.summary);
            }

            setTimeout(() => {
                setStatus(null);
            }, 5000);

        } catch (error: any) {
            console.error("Sync error:", error);
            setStatus({ tone: "error", text: "Error: " + error.message });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-2 relative">
            <button
                onClick={handleSync}
                disabled={isSyncing}
                className="focus-ring inline-flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-100 font-medium rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing Segments..." : "Sync AI Segments"}
            </button>
            <div className="max-w-sm text-right text-[11px] leading-5 text-zinc-500">
                {isLoadingSummary ? (
                    <span>Loading embedding coverage…</span>
                ) : summary ? (
                    <>
                        <div>{summary.total_library_content_items} library items referenced</div>
                        <div>{summary.embedded_content_items} content items have Gemini segment embeddings</div>
                        <div>{summary.missing_segments} verified segments still need Gemini embeddings</div>
                    </>
                ) : null}
            </div>
            {status && (
                <span
                    className={`absolute top-full mt-2 max-w-xs text-right text-xs font-medium animate-in fade-in slide-in-from-top-1 whitespace-normal z-10 ${
                        status.tone === "error" ? "text-red-500" : "text-emerald-500"
                    }`}
                >
                    {status.text}
                </span>
            )}
        </div>
    );
}
