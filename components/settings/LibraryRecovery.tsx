"use client";
import { useState } from "react";
import Link from "next/link";
import { useReadingProgress } from "@/hooks/useReadingProgress";

export function LibraryRecovery() {
    const { user, recovery, hydrationStatus, retryPending, retryHydration, discardIntent,
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
                {attention ? "Needs attention" : recovery.pending ? `${recovery.pending} changes pending on this device`
                    : hydrationStatus === "ready" ? "Synced" : hydrationStatus === "error" ? "Could not verify your library" : "Checking your library…"}
            </p>
        </div>
        {(recovery.pending > 0 || attention) && <p className="text-sm text-muted-foreground">Pending changes retry when you reconnect. Conflicts need review; refreshing never resubmits them. Discarding a local change does not undo a server write.</p>}
        <div className="flex flex-wrap gap-2">
            {recovery.pending > 0 && <button className={buttonClass} disabled={busy} onClick={() => void run(retryPending)}>Retry pending changes</button>}
            {(attention || hydrationStatus === "error") && <button className={buttonClass} disabled={busy || hydrationStatus === "hydrating"} onClick={retryHydration}>Refresh library</button>}
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
            <Link className="text-sm underline" href={`/preview/${encodeURIComponent(entry.itemId)}`}>View item</Link>
            <p className="text-sm text-muted-foreground">Refresh and compare your current library before applying this as a new change.</p>
            <div className="flex flex-wrap gap-2">
                {!entry.skipped && <button className={buttonClass} disabled={busy || !entry.canReapply} onClick={() => void run(() => reapplyIntent(entry.id))}>Apply as a new change</button>}
                <button className={buttonClass} disabled={busy} onClick={() => discard(entry.id, () => discardIntent(entry.id))}>{confirmDiscard === entry.id ? "Confirm discard" : "Discard local change"}</button>
            </div>
        </div>)}
    </div>;
}
