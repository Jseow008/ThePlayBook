"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function SyncEmbeddingsButton() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [statusText, setStatusText] = useState("");

    const handleSync = async () => {
        try {
            setIsSyncing(true);
            setStatusText("Syncing...");

            const res = await fetch("/api/admin/embeddings/sync", {
                method: "POST",
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to sync embeddings");
            }

            if (data.results && data.results.processed > 0) {
                setStatusText(`Synced ${data.results.success} items!`);
            } else {
                setStatusText("All items up to date");
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
        <div className="flex items-center gap-3">
            {statusText && (
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-500 animate-in fade-in slide-in-from-right-2">
                    {statusText}
                </span>
            )}
            <button
                onClick={handleSync}
                disabled={isSyncing}
                className="focus-ring inline-flex items-center justify-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing Embeddings..." : "Sync Missing Embeddings"}
            </button>
        </div>
    );
}
