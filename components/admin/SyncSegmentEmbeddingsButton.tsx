"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

export function SyncSegmentEmbeddingsButton() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [statusText, setStatusText] = useState("");

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            setStatusText("Syncing Segments...");

            const res = await fetch("/api/admin/embeddings/sync-segments", {
                method: "POST",
            });

            const data = await res.json();

            if (!res.ok) {
                const errorMessage = data?.error?.message || data?.error || "Failed to sync segments";
                throw new Error(typeof errorMessage === 'string' ? errorMessage : "Failed to sync segment embeddings");
            }

            if (data.results && data.results.processed > 0) {
                setStatusText(`Synced ${data.results.success} segments!`);
            } else {
                setStatusText("All segments up to date");
            }

            // Clear success message after a few seconds
            setTimeout(() => {
                setStatusText("");
            }, 5000);

        } catch (error: any) {
            console.error("Sync error:", error);
            setStatusText("Error: " + error.message);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex flex-col items-end gap-1 relative">
            <button
                onClick={handleSync}
                disabled={isSyncing}
                className="focus-ring inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap border border-indigo-200 dark:border-indigo-800"
            >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing Segments..." : "Sync AI Segments"}
                <Sparkles className="w-3.5 h-3.5 ml-0.5 opacity-70" />
            </button>
            {statusText && (
                <span className="absolute top-full mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 animate-in fade-in slide-in-from-top-1 whitespace-nowrap z-10 bg-white dark:bg-zinc-900 px-2 py-1 flex rounded-md shadow-sm border border-zinc-200 dark:border-zinc-800">
                    {statusText}
                </span>
            )}
        </div>
    );
}
