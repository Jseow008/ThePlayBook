"use client";

import { Sparkles } from "lucide-react";
import { type NarrationJobStatus } from "@/lib/narration-job";
import { useNarrationGeneration } from "./useNarrationGeneration";

interface NarrationRowActionProps {
    contentId: string;
    contentStatus: "draft" | "verified";
    audioUrl: string;
    initialStatus?: NarrationJobStatus;
    initialError?: string | null;
}

function getCompactStatus(status: NarrationJobStatus, currentAudioUrl: string, statusText: string) {
    if (statusText.startsWith("Error:")) {
        return {
            label: statusText.replace(/^Error:\s*/, ""),
            tone: "text-red-600",
        };
    }

    if (statusText.toLowerCase().includes("temporarily rate limited")) {
        return {
            label: "Status checks throttled; retrying.",
            tone: "text-amber-600",
        };
    }

    if (statusText.toLowerCase().includes("temporarily unavailable")) {
        return {
            label: "Status checks unavailable; retrying.",
            tone: "text-amber-600",
        };
    }

    if (status === "processing") {
        return {
            label: "Generating voice",
            tone: "text-blue-600",
        };
    }

    if (status === "queued") {
        return {
            label: "Voice queued",
            tone: "text-amber-600",
        };
    }

    if (status === "stale" && currentAudioUrl) {
        return {
            label: "Voice out of date",
            tone: "text-amber-600",
        };
    }

    if (status === "ready" || currentAudioUrl) {
        return {
            label: "Voice ready",
            tone: "text-emerald-600",
        };
    }

    return {
        label: "No voice yet",
        tone: "text-zinc-500",
    };
}

export function NarrationRowAction({
    contentId,
    contentStatus,
    audioUrl,
    initialStatus = "idle",
    initialError = null,
}: NarrationRowActionProps) {
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
    });

    if (contentStatus !== "verified") {
        return (
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-400"
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate AI Voice
                </button>
                <span className="text-xs text-amber-600">Publish first to enable voice.</span>
            </div>
        );
    }

    const compactStatus = getCompactStatus(jobStatus, currentAudioUrl, statusText);
    const buttonLabel = buttonBusy
        ? jobStatus === "processing"
            ? "Generating..."
            : "Queued"
        : currentAudioUrl
            ? "Regenerate Voice"
            : "Generate AI Voice";

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={queueNarration}
                disabled={buttonBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
                <Sparkles className="h-3.5 w-3.5" />
                {buttonLabel}
            </button>
            <span className={`text-xs font-medium ${compactStatus.tone}`}>
                {compactStatus.label}
            </span>
        </div>
    );
}
