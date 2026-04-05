"use client";

import { Loader2, Sparkles } from "lucide-react";
import { type NarrationJobStatus, isNarrationTerminalStatus } from "@/lib/narration-job";
import { useNarrationGeneration } from "./useNarrationGeneration";

interface GenerateNarrationButtonProps {
    contentId: string;
    audioUrl: string;
    initialStatus?: NarrationJobStatus;
    initialError?: string | null;
    disabled?: boolean;
    onGenerated: (url: string) => void;
    onStatusChange?: (status: NarrationJobStatus, error: string | null) => void;
}

export function GenerateNarrationButton({
    contentId,
    audioUrl,
    initialStatus = "idle",
    initialError = null,
    disabled = false,
    onGenerated,
    onStatusChange = () => {},
}: GenerateNarrationButtonProps) {
    const {
        buttonBusy,
        currentAudioUrl,
        jobStatus,
        queueNarration,
        statusText,
    } = useNarrationGeneration({
        contentId,
        audioUrl,
        initialStatus,
        initialError,
        onGenerated,
        onStatusChange,
    });

    const buttonLabel = buttonBusy
        ? jobStatus === "processing"
            ? "Generating..."
            : "Queued"
        : currentAudioUrl ? "Regenerate AI Narration" : "Generate AI Narration";

    return (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                        <Sparkles className="size-4 text-zinc-700" />
                        <span>AI narration</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Queue one AI narration audio file from the published summary, upload it to Supabase audio storage,
                        and save the resulting URL to this content item automatically.
                    </p>
                    {currentAudioUrl && isNarrationTerminalStatus(jobStatus) && (
                        <p className="mt-2 text-xs font-medium text-zinc-600">
                            A narration file already exists. Generating again will replace the stored audio file once the new job finishes.
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={queueNarration}
                    disabled={disabled || buttonBusy}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Loader2 className={`size-4 ${buttonBusy ? "animate-spin" : "hidden"}`} />
                    {!buttonBusy && <Sparkles className="size-4" />}
                    {buttonLabel}
                </button>
            </div>

            {statusText && (
                <p className={`mt-3 text-xs font-medium ${statusText.startsWith("Error:") ? "text-red-600" : "text-emerald-600"}`}>
                    {statusText}
                </p>
            )}
        </div>
    );
}
