"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useReadingProgress, type ReadingProgressData } from "@/hooks/useReadingProgress";
import { combineReadingProgress, readGuestProgress } from "@/lib/guest-progress-resume";

export function GuestProgressChoice({ contentId, segmentIds }: {
    contentId: string;
    segmentIds: string[];
}) {
    const { user, isLoaded, hydrationStatus, getProgress, saveReadingProgress } = useReadingProgress();
    const [guestProgress, setGuestProgress] = useState<ReadingProgressData | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const accountProgress = getProgress(contentId);
    const userId = user?.id;

    useEffect(() => {
        if (!userId || !isLoaded || hydrationStatus !== "ready") return;
        const guest = readGuestProgress(localStorage, contentId, segmentIds);
        setGuestProgress(guest);
        try {
            const dismissalKey = `netflux_guest_progress_choice:v1:${userId}:${contentId}`;
            setDismissed(Boolean(guest) && sessionStorage.getItem(dismissalKey) === guest?.lastReadAt);
        } catch {
            setDismissed(false);
        }
    }, [contentId, hydrationStatus, isLoaded, segmentIds, userId]);

    if (!user || !isLoaded || hydrationStatus !== "ready" || !guestProgress || dismissed
        || guestProgress.itemId !== contentId || guestProgress.totalSegments !== segmentIds.length) return null;

    const guestCount = guestProgress.completed.length;
    const accountCompleted = new Set(accountProgress?.completed ?? []);
    const accountCount = segmentIds.filter((id) => accountCompleted.has(id)).length;
    if (!guestProgress.completed.some((id) => !accountCompleted.has(id))) return null;

    const useBrowserProgress = () => {
        try {
            saveReadingProgress(contentId, combineReadingProgress(guestProgress, accountProgress, segmentIds));
            setDismissed(true);
        } catch {
            toast.error("Could not save this reading progress. Please try again.");
        }
    };

    const keepAccountProgress = () => {
        try {
            sessionStorage.setItem(`netflux_guest_progress_choice:v1:${user.id}:${contentId}`, guestProgress.lastReadAt);
        } catch {
            // Keep this decision for the current view when browser storage is unavailable.
        }
        setDismissed(true);
    };

    return (
        <section className="mb-6 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 sm:p-5" aria-labelledby="guest-progress-choice-title">
            <h2 id="guest-progress-choice-title" className="text-base font-semibold text-foreground">
                Continue with your browser progress?
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                You completed {guestCount} of {segmentIds.length} sections before signing in. Your account shows {accountCount}.
                Adding browser progress keeps sections already completed in your account.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={useBrowserProgress} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
                    Add browser progress
                </button>
                <button type="button" onClick={keepAccountProgress} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/50">
                    Keep account progress for now
                </button>
            </div>
        </section>
    );
}
