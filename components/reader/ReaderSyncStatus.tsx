"use client";

import { useState } from "react";
import Link from "next/link";
import { useReadingProgress } from "@/hooks/useReadingProgress";

export function ReaderSyncStatus({ itemId, hasProgress, saveQueued }: {
    itemId: string;
    hasProgress: boolean;
    saveQueued: boolean;
}) {
    const { recovery, getItemSyncStatus, retryHydration, reapplyIntent } = useReadingProgress();
    const [reviewOpen, setReviewOpen] = useState(false);
    const [applying, setApplying] = useState(false);
    const status = getItemSyncStatus(itemId);
    const change = recovery.attention.filter(entry => entry.itemId === itemId).at(-1);

    if (!hasProgress && !saveQueued && !change) return null;
    if (status === "guest") return <p className="mb-5 text-sm text-muted-foreground" role="status">Progress saved on this device</p>;

    const label = status === "storage_error" ? "Progress needs attention"
        : status === "unavailable" ? "Sync unavailable"
        : status === "needs_review" ? "Progress needs review"
            : status === "pending" || saveQueued ? "Progress pending" : "Progress saved to your library";

    return <div className="mb-5 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-foreground">{label}</span>
            {status === "unavailable" && <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={retryHydration}>Refresh library</button>}
            {status === "storage_error" && <Link className="underline underline-offset-2 hover:text-foreground" href="/settings">Open Library sync</Link>}
            {status === "needs_review" && change && <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setReviewOpen(open => !open)}>{reviewOpen ? "Hide review" : "Review change"}</button>}
        </div>
        {status === "unavailable" && <p className="mt-1 text-muted-foreground">Your change is on this device. Refresh your library before reviewing it.</p>}
        {status === "storage_error" && <p className="mt-1 text-muted-foreground">This device could not safely keep a change. Review Library sync in Settings.</p>}
        {(status === "pending" || saveQueued) && <p className="mt-1 text-muted-foreground">Your change is on this device while it syncs.</p>}
        {status === "needs_review" && reviewOpen && change && <div className="mt-3 space-y-2 border-t border-border pt-3">
            <p className="text-muted-foreground">Your device: {change.localCompleted} sections complete{change.localIsCompleted ? " (article complete)" : ""}. Library: {change.serverCompleted} sections complete{change.serverIsCompleted ? " (article complete)" : ""}.</p>
            <p className="text-muted-foreground">Review both versions before applying your device’s progress as a new change. This can restore sections removed elsewhere.</p>
            <button type="button" disabled={!change.canReapply || applying} className="rounded-lg border border-border px-3 py-2 font-medium text-foreground hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => {
                setApplying(true);
                void reapplyIntent(change.id).finally(() => setApplying(false));
            }}>Apply device progress</button>
            {!change.canReapply && <p className="text-muted-foreground">Refresh your library to compare the current version.</p>}
        </div>}
    </div>;
}
