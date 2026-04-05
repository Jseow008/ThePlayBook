"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type NarrationJobState, type NarrationJobStatus } from "@/lib/narration-job";

interface NarrationRouteResponse {
    data?: {
        job?: NarrationJobState;
        message?: string;
    };
    error?: {
        message?: string;
    };
}

interface UseNarrationGenerationOptions {
    contentId: string;
    audioUrl: string;
    initialStatus?: NarrationJobStatus;
    initialError?: string | null;
    onGenerated?: (url: string) => void;
    onStatusChange?: (status: NarrationJobStatus, error: string | null) => void;
    pollIntervalMs?: number;
}

export const FALLBACK_GENERATION_ERROR = "AI narration could not be completed right now. Please try again.";
export const FALLBACK_NETWORK_ERROR = "Could not reach the narration service. Please try again.";
export const STATUS_RATE_LIMIT_MESSAGE = "AI narration is still generating. Status checks are temporarily rate limited; retrying shortly.";
export const STATUS_FETCH_RETRY_MESSAGE = "AI narration is still generating. Status checks are temporarily unavailable; retrying shortly.";
export const STALE_NARRATION_MESSAGE = "AI narration is out of date. Regenerate it to match the latest deep-mode content.";
const DEFAULT_POLL_INTERVAL_MS = 5_000;

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

export function useNarrationGeneration({
    contentId,
    audioUrl,
    initialStatus = "idle",
    initialError = null,
    onGenerated = () => {},
    onStatusChange = () => {},
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseNarrationGenerationOptions) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [jobStatus, setJobStatus] = useState<NarrationJobStatus>(initialStatus);
    const [statusText, setStatusText] = useState(initialError ? `Error: ${initialError}` : "");
    const [currentAudioUrl, setCurrentAudioUrl] = useState(audioUrl);
    const pollingRef = useRef<number | null>(null);
    const pollRunIdRef = useRef(0);
    const latestAudioUrlRef = useRef(audioUrl);

    useEffect(() => {
        latestAudioUrlRef.current = audioUrl;
        setCurrentAudioUrl(audioUrl);
    }, [audioUrl]);

    useEffect(() => {
        setJobStatus(initialStatus);
        if (initialError) {
            setStatusText(`Error: ${initialError}`);
            return;
        }

        if (initialStatus === "queued" || initialStatus === "processing") {
            setStatusText(getQueuedMessage(initialStatus));
            return;
        }

        if (initialStatus === "stale" && currentAudioUrl) {
            setStatusText(STALE_NARRATION_MESSAGE);
            return;
        }

        if (initialStatus === "ready" && currentAudioUrl) {
            setStatusText("AI narration is ready and saved to this content item.");
            return;
        }

        setStatusText("");
    }, [currentAudioUrl, initialError, initialStatus]);

    useEffect(() => {
        if (jobStatus !== "queued" && jobStatus !== "processing") {
            if (pollingRef.current !== null) {
                window.clearTimeout(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }

        let cancelled = false;
        const pollRunId = pollRunIdRef.current + 1;
        pollRunIdRef.current = pollRunId;

        const scheduleNextPoll = () => {
            if (cancelled) {
                return;
            }

            pollingRef.current = window.setTimeout(() => {
                void poll();
            }, pollIntervalMs);
        };

        const poll = async () => {
            try {
                const response = await fetch(`/api/admin/content/${contentId}/narration`, {
                    method: "GET",
                    cache: "no-store",
                });
                const data = await parseNarrationResponse(response);

                if (cancelled || pollRunId !== pollRunIdRef.current) {
                    return;
                }

                if (response.status === 429) {
                    setStatusText(STATUS_RATE_LIMIT_MESSAGE);
                    scheduleNextPoll();
                    return;
                }

                if (!response.ok || !data?.data?.job) {
                    if (!response.ok && response.status < 500) {
                        throw new Error(data?.error?.message || FALLBACK_GENERATION_ERROR);
                    }

                    setStatusText(STATUS_FETCH_RETRY_MESSAGE);
                    scheduleNextPoll();
                    return;
                }

                const nextJob = data.data.job;
                setJobStatus(nextJob.status);
                onStatusChange(nextJob.status, nextJob.error);

                if (nextJob.status === "ready") {
                    if (nextJob.audio_url) {
                        setCurrentAudioUrl(nextJob.audio_url);
                    }

                    if (nextJob.audio_url && nextJob.audio_url !== latestAudioUrlRef.current) {
                        latestAudioUrlRef.current = nextJob.audio_url;
                        onGenerated(nextJob.audio_url);
                    }

                    setStatusText("AI narration is ready and saved to this content item.");
                    return;
                }

                if (nextJob.status === "failed") {
                    setStatusText(`Error: ${nextJob.error || FALLBACK_GENERATION_ERROR}`);
                    return;
                }

                if (nextJob.status === "stale") {
                    setStatusText(STALE_NARRATION_MESSAGE);
                    return;
                }

                setStatusText(getQueuedMessage(nextJob.status));
                scheduleNextPoll();
            } catch (error) {
                if (cancelled || pollRunId !== pollRunIdRef.current) {
                    return;
                }

                const message = getClientSafeErrorMessage(error);
                if (message === FALLBACK_NETWORK_ERROR || message === FALLBACK_GENERATION_ERROR) {
                    setStatusText(STATUS_FETCH_RETRY_MESSAGE);
                    scheduleNextPoll();
                    return;
                }

                setStatusText(`Error: ${message}`);
                setJobStatus("failed");
                onStatusChange("failed", message);
            }
        };

        void poll();

        return () => {
            cancelled = true;
            if (pollingRef.current !== null) {
                window.clearTimeout(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [contentId, jobStatus, onGenerated, onStatusChange, pollIntervalMs]);

    const queueNarration = useCallback(async () => {
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
        } catch (error) {
            const message = getClientSafeErrorMessage(error);
            setStatusText(`Error: ${message}`);
            setJobStatus("failed");
            onStatusChange("failed", message);
        } finally {
            setIsSubmitting(false);
        }
    }, [contentId, isSubmitting, jobStatus, onStatusChange]);

    return {
        currentAudioUrl,
        isSubmitting,
        jobStatus,
        queueNarration,
        statusText,
        buttonBusy: isSubmitting || jobStatus === "queued" || jobStatus === "processing",
    };
}
