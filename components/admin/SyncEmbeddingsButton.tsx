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
                const errorMessage = data?.error?.message || data?.error || "Failed to sync embeddings";
                throw new Error(typeof errorMessage === 'string' ? errorMessage : "Failed to sync embeddings");
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
        <div className="flex flex-col items-end gap-1 relative">
            <button
                onClick={handleSync}
                disabled={isSyncing}
                className="focus-ring inline-flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-100 font-medium rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing Embeddings..." : "Sync Embedding"}
            </button>
            {statusText && (
                <span className="absolute top-full mt-2 text-xs font-medium text-emerald-500 animate-in fade-in slide-in-from-top-1 whitespace-nowrap z-10">
                    {statusText}
                </span>
            )}
        </div>
    );
}
