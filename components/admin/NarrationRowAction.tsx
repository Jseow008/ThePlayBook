"use client";

import { type NarrationJobStatus } from "@/lib/narration-job";
import { useNarrationGeneration } from "./useNarrationGeneration";
import { getNarrationStatusPresentation } from "./narration-status";

interface NarrationRowActionProps {
    contentId: string;
    contentStatus: "draft" | "verified";
    audioUrl: string;
    initialStatus?: NarrationJobStatus;
    initialError?: string | null;
    initialRequestedAt?: string | null;
    initialStartedAt?: string | null;
    initialCompletedAt?: string | null;
}

export function NarrationRowAction({
    contentId,
    contentStatus,
    audioUrl,
    initialStatus = "idle",
    initialError = null,
    initialRequestedAt = null,
    initialStartedAt = null,
    initialCompletedAt = null,
}: NarrationRowActionProps) {
    const {
        buttonBusy,
        currentAudioUrl,
        jobStatus,
        queueNarration,
        statusText,
        requestedAt,
        startedAt,
        completedAt,
    } = useNarrationGeneration({
        contentId,
        audioUrl,
        initialStatus,
        initialError,
        initialRequestedAt,
        initialStartedAt,
        initialCompletedAt,
    });

    if (contentStatus !== "verified") {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled
                    className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-400"
                >
                    Generate AI Voice
                </button>
                <span className="text-xs text-amber-600">Publish first to enable voice.</span>
            </div>
        );
    }

    const compactStatus = getNarrationStatusPresentation({
        status: jobStatus,
        statusText,
        audioUrl: currentAudioUrl,
        requestedAt,
        startedAt,
        completedAt,
        error: initialError,
    });
    const buttonLabel = buttonBusy
        ? jobStatus === "processing"
            ? "Generating..."
            : "Queued"
        : currentAudioUrl
            ? "Regenerate Voice"
            : "Generate AI Voice";

    return (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${compactStatus.badgeClassName}`}>
                    {compactStatus.badgeLabel}
                </span>
                <span className={`text-xs ${compactStatus.detailClassName}`}>
                    {compactStatus.detail}
                </span>
            </div>
            <div className="mt-2">
                <button
                    type="button"
                    onClick={queueNarration}
                    disabled={buttonBusy}
                    className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {buttonLabel}
                </button>
            </div>
        </div>
    );
}
