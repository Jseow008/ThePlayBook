"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { type NarrationJobState, type NarrationJobStatus, isNarrationTerminalStatus } from "@/lib/narration-job";

interface GenerateNarrationButtonProps {
    contentId: string;
    audioUrl: string;
    initialStatus?: NarrationJobStatus;
    initialError?: string | null;
    disabled?: boolean;
    onGenerated: (url: string) => void;
    onStatusChange?: (status: NarrationJobStatus, error: string | null) => void;
}

type NarrationRouteResponse = {
    data?: {
        job?: NarrationJobState;
        message?: string;
    };
    error?: {
        message?: string;
    };
};

const FALLBACK_GENERATION_ERROR = "AI narration could not be completed right now. Please try again.";
const FALLBACK_NETWORK_ERROR = "Could not reach the narration service. Please try again.";
const STATUS_RATE_LIMIT_MESSAGE = "AI narration is still generating. Status checks are temporarily rate limited; retrying shortly.";
const POLL_INTERVAL_MS = 5_000;

async function parseNarrationResponse(response: Response): Promise<NarrationRouteResponse | null> {
    try {
        return await response.json() as NarrationRouteResponse;
    } catch {
        return null;
    }
}

function getClientSafeErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
        return FALLBACK_GENERATION_ERROR;
    }

    const message = error.message.trim();
    if (!message) {
        return FALLBACK_GENERATION_ERROR;
    }

    const normalized = message.toLowerCase();
    if (
        normalized.includes("failed to fetch")
        || normalized.includes("networkerror")
        || normalized.includes("load failed")
        || normalized.includes("unexpected token")
    ) {
        return FALLBACK_NETWORK_ERROR;
    }

    return message;
}

function getQueuedMessage(status: NarrationJobStatus) {
    if (status === "processing") {
        return "AI narration is generating in the background...";
    }

    return "AI narration queued. Generation will continue in the background.";
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [jobStatus, setJobStatus] = useState<NarrationJobStatus>(initialStatus);
    const [statusText, setStatusText] = useState(initialError ? `Error: ${initialError}` : "");
    const pollingRef = useRef<number | null>(null);
    const latestAudioUrlRef = useRef(audioUrl);

    useEffect(() => {
        latestAudioUrlRef.current = audioUrl;
    }, [audioUrl]);

    useEffect(() => {
        setJobStatus(initialStatus);
        if (initialError) {
            setStatusText(`Error: ${initialError}`);
            return;
        }

        if (initialStatus === "queued" || initialStatus === "processing") {
            setStatusText(getQueuedMessage(initialStatus));
        }
    }, [initialError, initialStatus]);

    useEffect(() => {
        if (jobStatus !== "queued" && jobStatus !== "processing") {
            if (pollingRef.current !== null) {
                window.clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }

        const poll = async () => {
            try {
                const response = await fetch(`/api/admin/content/${contentId}/narration`, {
                    method: "GET",
                    cache: "no-store",
                });
                const data = await parseNarrationResponse(response);

                if (response.status === 429) {
                    setStatusText(STATUS_RATE_LIMIT_MESSAGE);
                    return;
                }

                if (!response.ok || !data?.data?.job) {
                    throw new Error(data?.error?.message || FALLBACK_GENERATION_ERROR);
                }

                const nextJob = data.data.job;
                setJobStatus(nextJob.status);
                onStatusChange(nextJob.status, nextJob.error);

                if (nextJob.status === "ready") {
                    if (nextJob.audio_url && nextJob.audio_url !== latestAudioUrlRef.current) {
                        onGenerated(nextJob.audio_url);
                    }
                    setStatusText("AI narration is ready and saved to this content item.");
                    return;
                }

                if (nextJob.status === "failed") {
                    setStatusText(`Error: ${nextJob.error || FALLBACK_GENERATION_ERROR}`);
                    return;
                }

                setStatusText(getQueuedMessage(nextJob.status));
            } catch (error) {
                const message = getClientSafeErrorMessage(error);
                setStatusText(`Error: ${message}`);
                setJobStatus("failed");
                onStatusChange("failed", message);
            }
        };

        void poll();
        pollingRef.current = window.setInterval(() => {
            void poll();
        }, POLL_INTERVAL_MS);

        return () => {
            if (pollingRef.current !== null) {
                window.clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [contentId, jobStatus, onGenerated, onStatusChange]);

    const handleGenerate = async () => {
        if (isSubmitting) {
            return;
        }

        if (jobStatus === "queued" || jobStatus === "processing") {
            setStatusText(
                jobStatus === "queued"
                    ? "AI narration is already queued."
                    : "AI narration is already generating in the background."
            );
            return;
        }

        try {
            setIsSubmitting(true);
            setStatusText("Queuing AI narration...");

            const response = await fetch(`/api/admin/content/${contentId}/narration`, {
                method: "POST",
            });
            const data = await parseNarrationResponse(response);

            if (!response.ok || !data?.data?.job) {
                throw new Error(data?.error?.message || FALLBACK_GENERATION_ERROR);
            }

            const queuedJob = data.data.job;
            setJobStatus(queuedJob.status);
            onStatusChange(queuedJob.status, queuedJob.error);
            setStatusText(data.data.message || getQueuedMessage(queuedJob.status));

            if (queuedJob.status === "queued") {
                void fetch("/api/admin/narration/process", {
                    method: "POST",
                });
            }
        } catch (error) {
            const message = getClientSafeErrorMessage(error);
            setStatusText(`Error: ${message}`);
            setJobStatus("failed");
            onStatusChange("failed", message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const buttonBusy = isSubmitting || jobStatus === "queued" || jobStatus === "processing";
    const buttonLabel = buttonBusy
        ? jobStatus === "processing"
            ? "Generating..."
            : "Queued"
        : audioUrl ? "Regenerate AI Narration" : "Generate AI Narration";

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
                    {audioUrl && isNarrationTerminalStatus(jobStatus) && (
                        <p className="mt-2 text-xs font-medium text-zinc-600">
                            A narration file already exists. Generating again will replace the stored audio file once the new job finishes.
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleGenerate}
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
