"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useReadingProgress, type ReadingProgressData } from "@/hooks/useReadingProgress";
import { combineReadingProgress, readGuestProgress } from "@/lib/guest-progress-resume";

export function GuestProgressChoice({ contentId, segmentIds, reflectionPending = false, onProgressChosen }: {
    contentId: string;
    segmentIds: string[];
    reflectionPending?: boolean;
    onProgressChosen?: (progress: ReadingProgressData | null) => void;
}) {
    const { user, isLoaded, hydrationStatus, getProgress, saveReadingProgress } = useReadingProgress();
    const [guestProgress, setGuestProgress] = useState<ReadingProgressData | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [highlighted, setHighlighted] = useState(false);
    const sectionRef = useRef<HTMLElement | null>(null);
    const presentedKeyRef = useRef<string | null>(null);
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

    const hasGuestProgress = Boolean(user && isLoaded && hydrationStatus === "ready" && guestProgress && !dismissed
        && guestProgress.itemId === contentId && guestProgress.totalSegments === segmentIds.length);
    const accountCompleted = new Set(accountProgress?.completed ?? []);
    const accountCount = segmentIds.filter((id) => accountCompleted.has(id)).length;
    const shouldShow = hasGuestProgress && Boolean(guestProgress?.completed.some((id) => !accountCompleted.has(id)));

    useEffect(() => {
        if (!shouldShow || reflectionPending || !userId || !guestProgress || !sectionRef.current) return;

        const presentationKey = `netflux_guest_progress_presented:v1:${userId}:${contentId}:${guestProgress.lastReadAt}`;
        if (presentedKeyRef.current === presentationKey) return;
        presentedKeyRef.current = presentationKey;

        try {
            if (sessionStorage.getItem(presentationKey)) return;
            sessionStorage.setItem(presentationKey, "1");
        } catch {
            // The current mount still shows the choice when browser storage is unavailable.
        }

        const section = sectionRef.current;
        const bounds = section.getBoundingClientRect();
        if ((bounds.top < 72 || bounds.bottom > window.innerHeight - 88)
            && typeof section.scrollIntoView === "function") {
            section.scrollIntoView({
                block: "nearest",
                behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            });
        }
        setHighlighted(true);
    }, [contentId, guestProgress, reflectionPending, shouldShow, userId]);

    useEffect(() => {
        if (!highlighted) return;
        const timeoutId = window.setTimeout(() => setHighlighted(false), 2200);
        return () => window.clearTimeout(timeoutId);
    }, [highlighted]);

    if (!shouldShow || !guestProgress || !user) return null;

    const guestCount = guestProgress.completed.length;

    const useBrowserProgress = () => {
        try {
            const combinedProgress = combineReadingProgress(guestProgress, accountProgress, segmentIds);
            saveReadingProgress(contentId, combinedProgress);
            setDismissed(true);
            onProgressChosen?.(combinedProgress);
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
        onProgressChosen?.(accountProgress);
    };

    return (
        <section
            ref={sectionRef}
            className={`mb-6 scroll-mt-20 scroll-mb-24 rounded-2xl border border-primary/40 bg-primary/[0.08] p-4 shadow-sm shadow-primary/10 motion-safe:transition-[border-color,box-shadow] motion-safe:duration-700 sm:p-5 ${highlighted ? "ring-2 ring-primary/35 shadow-lg shadow-primary/15" : ""}`}
            aria-labelledby="guest-progress-choice-title"
        >
            <h2 id="guest-progress-choice-title" className="text-base font-semibold text-foreground">
                Continue with your browser progress?
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                You completed {guestCount} of {segmentIds.length} sections before signing in. Your account shows {accountCount} of {segmentIds.length} sections.
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
