"use client";
import { useState } from "react";
import Link from "next/link";
import { useReadingProgress } from "@/hooks/useReadingProgress";

export function LibraryRecovery() {
    const { user, recovery, hydrationStatus, hydrationIssue, snapshotBuilding, retryPending, retryHydration, discardIntent,
        reapplyIntent, importGuestLibrary, retryJournalStorage, discardUnreadableIntents } = useReadingProgress();
    const [busy, setBusy] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        try { await action(); } finally { setBusy(false); }
    };
    const discard = (id: string, action: () => void) => {
        if (confirmDiscard !== id) { setConfirmDiscard(id); return; }
        action(); setConfirmDiscard(null);
    };
    const buttonClass = "rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed";
    if (!user) return null;
    const attention = recovery.attention.length > 0 || recovery.storageError;
    return <div className="p-4 space-y-3">
        <div>
            <p className="font-medium text-foreground">Library sync</p>
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                {attention ? "Needs review" : recovery.pending ? `${recovery.pending} changes pending on this device`
                    : hydrationStatus === "error" ? "Sync unavailable" : hydrationStatus === "ready" ? "Synced"
                        : snapshotBuilding ? "Preparing your library…" : "Checking your library…"}
            </p>
        </div>
        {hydrationStatus === "error" && <p className="text-sm text-muted-foreground">{hydrationIssue?.kind === "rate_limited" && hydrationIssue.retryAt
            ? `Library requests are limited. Sync will retry after ${new Date(hydrationIssue.retryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
            : hydrationIssue?.kind === "configuration" ? "Library sync needs service attention. Your changes remain on this device."
                : hydrationIssue?.kind === "preparing" ? "Your library is still preparing. Your changes remain on this device."
                    : "Your library could not be verified. Changes on this device are not confirmed saved. Refresh your library to try again."}</p>}
        {(recovery.pending > 0 || attention) && <p className="text-sm text-muted-foreground">Pending changes retry when you reconnect. Conflicts need review; refreshing never resubmits them. Discarding a local change does not undo a server write.</p>}
        <div className="flex flex-wrap gap-2">
            {recovery.pending > 0 && <button className={buttonClass} disabled={busy} onClick={() => void run(retryPending)}>Retry pending changes</button>}
            {(attention || hydrationStatus === "error") && <button className={buttonClass} disabled={busy || hydrationStatus === "hydrating" || hydrationIssue?.kind === "rate_limited"} onClick={retryHydration}>Refresh library</button>}
            {recovery.importableGuestCount > 0 && <button className={buttonClass} disabled={busy || hydrationStatus !== "ready"} onClick={() => void run(importGuestLibrary)}>Import {Math.min(200, recovery.importableGuestCount)} guest items</button>}
        </div>
        {recovery.guestCount > 0 && <p className="text-sm text-muted-foreground">Import this browser’s guest bookmarks and reading progress into your signed-in account. Imports run in batches of up to 200 items. Existing account items are kept; conflicts stay here for review.</p>}
        {recovery.storageError && <div className="space-y-2">
            <p className="text-sm text-destructive">Some changes could not be stored or read on this device. They are not confirmed synced.</p>
            <div className="flex flex-wrap gap-2">
                <button className={buttonClass} onClick={retryJournalStorage}>Retry device storage</button>
                <button className={buttonClass} onClick={() => discard("unreadable", discardUnreadableIntents)}>{confirmDiscard === "unreadable" ? "Confirm discard unreadable changes" : "Discard unreadable changes"}</button>
            </div>
        </div>}
        {recovery.attention.map(entry => <div className="rounded-lg border border-border p-3 space-y-2" key={entry.id}>
            <p className="text-sm">{entry.guest ? "Guest import" : entry.isBookmarked ? "Save to Library" : "Library change"} needs review{entry.skipped ? ": the account already has this item." : "."}</p>
            <p className="text-xs text-muted-foreground">Change from {entry.createdAt.replace("T", " ").slice(0, 16)} UTC</p>
            <Link className="text-sm underline" href={`/preview/${encodeURIComponent(entry.itemId)}`}>View item</Link>
            <p className="text-sm text-muted-foreground">Your device: {entry.isBookmarked ? "in My List" : "not in My List"}; {entry.localHasProgress ? `${entry.localCompleted} sections complete${entry.localIsCompleted ? " (item complete)" : ""}` : "no reading progress"}.</p>
            {entry.canReapply
                ? <p className="text-sm text-muted-foreground">Library at last check: {entry.serverIsBookmarked ? "in My List" : "not in My List"}; {entry.serverHasProgress ? `${entry.serverCompleted} sections complete${entry.serverIsCompleted ? " (item complete)" : ""}` : "no reading progress"}. Applying your device change can restore progress or a bookmark removed elsewhere.</p>
                : <p className="text-sm text-muted-foreground">Refresh to see the current library before applying this change.</p>}
            {!entry.canReapply && hydrationStatus === "ready" && !entry.skipped && <p className="text-sm text-muted-foreground">Refresh and resolve any newer changes before applying this one.</p>}
            <div className="flex flex-wrap gap-2">
                {!entry.skipped && <button className={buttonClass} disabled={busy || !entry.canReapply} onClick={() => void run(() => reapplyIntent(entry.id))}>Apply as a new change</button>}
                <button className={buttonClass} disabled={busy} onClick={() => discard(entry.id, () => discardIntent(entry.id))}>{confirmDiscard === entry.id ? "Confirm discard" : "Discard local change"}</button>
            </div>
        </div>)}
    </div>;
}
