export type NarrationJobStatus = "idle" | "queued" | "processing" | "ready" | "failed" | "stale";

export interface NarrationJobState {
    status: NarrationJobStatus;
    error: string | null;
    requested_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    audio_url: string | null;
}

export interface NarrationJobRowLike {
    audio_url?: string | null;
    narration_status?: string | null;
    narration_error?: string | null;
    narration_requested_at?: string | null;
    narration_started_at?: string | null;
    narration_completed_at?: string | null;
}

export const NARRATION_TERMINAL_STATUSES: NarrationJobStatus[] = ["idle", "ready", "failed", "stale"];

export function isNarrationTerminalStatus(status: NarrationJobStatus) {
    return NARRATION_TERMINAL_STATUSES.includes(status);
}

export function normalizeNarrationJobStatus(value: string | null | undefined, audioUrl?: string | null): NarrationJobStatus {
    if (!audioUrl && (value === "ready" || value === "stale")) {
        return "idle";
    }

    if (value === "queued" || value === "processing" || value === "ready" || value === "failed" || value === "idle" || value === "stale") {
        return value;
    }

    if (audioUrl) {
        return "ready";
    }

    return "idle";
}

export function getNarrationJobState(row: NarrationJobRowLike): NarrationJobState {
    return {
        status: normalizeNarrationJobStatus(row.narration_status, row.audio_url),
        error: row.narration_error ?? null,
        requested_at: row.narration_requested_at ?? null,
        started_at: row.narration_started_at ?? null,
        completed_at: row.narration_completed_at ?? null,
        audio_url: row.audio_url ?? null,
    };
}
