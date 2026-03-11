import type { Json } from "@/types/database";

export const APP_ONBOARDING_TOUR_KEY = "app-tour";
export const APP_ONBOARDING_VERSION = "v1";
export const APP_ONBOARDING_REPLAY_VALUE = "app-v1";
export const APP_ONBOARDING_QUERY_PARAM = "tour";

export type OnboardingStatus = "dismissed" | "completed";

export interface OnboardingStateEntry {
    status: OnboardingStatus;
    updated_at: string;
    version: string;
}

function isOnboardingStateEntry(value: unknown): value is OnboardingStateEntry {
    if (!value || typeof value !== "object") return false;

    const candidate = value as Record<string, unknown>;

    return (
        typeof candidate.version === "string"
        && typeof candidate.updated_at === "string"
        && (candidate.status === "dismissed" || candidate.status === "completed")
    );
}

export function readOnboardingEntry(
    onboardingState: Json | null | undefined,
    tourKey: string
): OnboardingStateEntry | null {
    if (!onboardingState || typeof onboardingState !== "object" || Array.isArray(onboardingState)) {
        return null;
    }

    const candidate = (onboardingState as Record<string, unknown>)[tourKey];
    return isOnboardingStateEntry(candidate) ? candidate : null;
}

export function hasSeenOnboardingVersion(
    onboardingState: Json | null | undefined,
    tourKey: string,
    version: string
) {
    const entry = readOnboardingEntry(onboardingState, tourKey);
    return entry?.version === version && (entry.status === "dismissed" || entry.status === "completed");
}
