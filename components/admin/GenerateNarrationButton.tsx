"use client";

import { Loader2 } from "lucide-react";
import { formatNarrationCostEstimate } from "@/lib/narration-cost-format";
import type { NarrationCostEstimate } from "@/lib/narration-cost";
import { type NarrationJobStatus } from "@/lib/narration-job";
import { STALE_NARRATION_MESSAGE, useNarrationGeneration } from "./useNarrationGeneration";
import { getNarrationStatusPresentation } from "./narration-status";

interface GenerateNarrationButtonProps {
    contentId: string;
    audioUrl: string;
    estimate?: NarrationCostEstimate | null;
    initialStatus?: NarrationJobStatus;
    initialError?: string | null;
    initialRequestedAt?: string | null;
    initialStartedAt?: string | null;
    initialCompletedAt?: string | null;
    disabled?: boolean;
    pollIntervalMs?: number;
    onGenerated: (url: string) => void;
    onStatusChange?: (status: NarrationJobStatus, error: string | null) => void;
}

export function GenerateNarrationButton({
    contentId,
    audioUrl,
    estimate = null,
    initialStatus = "idle",
    initialError = null,
    initialRequestedAt = null,
    initialStartedAt = null,
    initialCompletedAt = null,
    disabled = false,
    pollIntervalMs,
    onGenerated,
    onStatusChange = () => {},
}: GenerateNarrationButtonProps) {
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
        onGenerated,
        onStatusChange,
        pollIntervalMs,
    });

    const buttonLabel = buttonBusy
        ? jobStatus === "processing"
            ? "Generating..."
            : "Queued"
        : currentAudioUrl ? "Regenerate Narration" : "Generate Narration";
    const narrationStatus = getNarrationStatusPresentation({
        status: jobStatus,
        statusText,
        audioUrl: currentAudioUrl,
        requestedAt,
        startedAt,
        completedAt,
        error: initialError,
    });
    const shouldShowStatusText = Boolean(statusText) && (
        statusText === STALE_NARRATION_MESSAGE
        || statusText.toLowerCase().includes("temporarily")
        || statusText.startsWith("Error:")
    );

    return (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">
                        Narration
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${narrationStatus.badgeClassName}`}>
                            {narrationStatus.badgeLabel}
                        </span>
                        <span className={`text-xs ${narrationStatus.detailClassName}`}>
                            {narrationStatus.detail}
                        </span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={queueNarration}
                    disabled={disabled || buttonBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Loader2 className={`size-4 ${buttonBusy ? "animate-spin" : "hidden"}`} />
                    {buttonLabel}
                </button>
            </div>

            {shouldShowStatusText && (
                <p className={`mt-3 text-xs font-medium ${statusText === STALE_NARRATION_MESSAGE || statusText.toLowerCase().includes("temporarily") ? "text-amber-600" : statusText.startsWith("Error:") ? "text-red-600" : "text-emerald-600"}`}>
                    {statusText}
                </p>
            )}

            {estimate && (
                <p className="mt-3 text-xs text-zinc-500">
                    {formatNarrationCostEstimate(estimate)}
                </p>
            )}
        </div>
    );
}
