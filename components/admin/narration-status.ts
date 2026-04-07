import type { NarrationJobStatus } from "@/lib/narration-job";

const NARRATION_STATUS_LOCALE = "en-US";
const NARRATION_STATUS_TIME_ZONE = "Asia/Singapore";
const narrationTimestampFormatter = new Intl.DateTimeFormat(NARRATION_STATUS_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: NARRATION_STATUS_TIME_ZONE,
});

type NarrationStatusPresentation = {
    badgeLabel: string;
    badgeClassName: string;
    detail: string;
    detailClassName: string;
};

type NarrationStatusPresentationInput = {
    status: NarrationJobStatus;
    statusText: string;
    audioUrl: string;
    requestedAt?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    error?: string | null;
};

function formatNarrationTimestamp(value?: string | null) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const parts = narrationTimestampFormatter.formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;

    if (!month || !day || !hour || !minute) {
        return null;
    }

    const hours24 = Number.parseInt(hour, 10);
    if (Number.isNaN(hours24)) {
        return null;
    }

    const displayHour = hours24 % 12 || 12;
    const meridiem = hours24 >= 12 ? "PM" : "AM";

    return `${month} ${day} at ${displayHour}:${minute} ${meridiem}`;
}

export function getNarrationStatusPresentation({
    status,
    statusText,
    audioUrl,
    requestedAt,
    startedAt,
    completedAt,
    error,
}: NarrationStatusPresentationInput): NarrationStatusPresentation {
    const normalizedStatusText = statusText.trim().toLowerCase();
    const formattedRequestedAt = formatNarrationTimestamp(requestedAt);
    const formattedStartedAt = formatNarrationTimestamp(startedAt);
    const formattedCompletedAt = formatNarrationTimestamp(completedAt);

    if (normalizedStatusText.includes("temporarily rate limited")) {
        return {
            badgeLabel: "Retrying",
            badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
            detail: "Status checks are being throttled briefly while narration keeps running.",
            detailClassName: "text-amber-600",
        };
    }

    if (normalizedStatusText.includes("temporarily unavailable")) {
        return {
            badgeLabel: "Retrying",
            badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
            detail: "Status checks are temporarily unavailable, but the background job is still being retried.",
            detailClassName: "text-amber-600",
        };
    }

    if (statusText.startsWith("Error:") || status === "failed") {
        return {
            badgeLabel: "Failed",
            badgeClassName: "border-red-200 bg-red-50 text-red-700",
            detail: error || statusText.replace(/^Error:\s*/, "") || "Narration generation failed. Try again.",
            detailClassName: "text-red-600",
        };
    }

    if (status === "processing") {
        return {
            badgeLabel: "Generating",
            badgeClassName: "border-blue-200 bg-blue-50 text-blue-700",
            detail: formattedStartedAt
                ? `Started ${formattedStartedAt}. The audio file will appear automatically when it finishes.`
                : "Narration is generating in the background now.",
            detailClassName: "text-blue-600",
        };
    }

    if (status === "queued") {
        return {
            badgeLabel: "Queued",
            badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
            detail: formattedRequestedAt
                ? `Queued ${formattedRequestedAt}. Background processing will pick it up automatically.`
                : "Queued for background generation.",
            detailClassName: "text-amber-600",
        };
    }

    if (status === "stale" && audioUrl) {
        return {
            badgeLabel: "Out of date",
            badgeClassName: "border-amber-200 bg-amber-50 text-amber-700",
            detail: formattedCompletedAt
                ? `Current audio was last generated ${formattedCompletedAt}. Regenerate it to match the latest deep-mode content.`
                : "Current audio is still playable, but it no longer matches the latest deep-mode content.",
            detailClassName: "text-amber-600",
        };
    }

    if (audioUrl) {
        return {
            badgeLabel: "Ready",
            badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
            detail: formattedCompletedAt
                ? `Generated ${formattedCompletedAt} and saved to this content item.`
                : "Narration is ready and saved to this content item.",
            detailClassName: "text-emerald-600",
        };
    }

    return {
        badgeLabel: "No voice",
        badgeClassName: "border-zinc-200 bg-zinc-50 text-zinc-600",
        detail: "No narration has been generated yet.",
        detailClassName: "text-zinc-500",
    };
}
