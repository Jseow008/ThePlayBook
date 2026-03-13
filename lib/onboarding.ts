import type { Json } from "@/types/database";

export const APP_ONBOARDING_TOUR_KEY = "app-tour";
export const APP_ONBOARDING_VERSION = "v1";
export const APP_ONBOARDING_REPLAY_VALUE = "app-v1";
export const APP_ONBOARDING_QUERY_PARAM = "tour";
export const GUEST_ONBOARDING_VERSION = "v1";
export const GUEST_ONBOARDING_STORAGE_KEY = `flux_guest_onboarding_${GUEST_ONBOARDING_VERSION}`;

export type OnboardingStatus = "dismissed" | "completed";

export interface OnboardingStateEntry {
    status: OnboardingStatus;
    updated_at: string;
    version: string;
}

export interface OnboardingSlide {
    body: string;
    desktopImageSrc?: string;
    eyebrow: string;
    imageAlt: string;
    imageSrc: string;
    title: string;
}

export const APP_ONBOARDING_SLIDES: OnboardingSlide[] = [
    {
        eyebrow: "Browse",
        title: "Find your next read.",
        body: "Scan the home feed, open something promising, and start with ideas that already feel worth your time.",
        imageSrc: "/images/hero-section.webp",
        imageAlt: "Flux browse home feed",
    },
    {
        eyebrow: "Preview",
        title: "Preview the thesis first.",
        body: "See the main idea before you commit so you know what the piece is really trying to teach.",
        imageSrc: "/images/reading-experience-info-view.webp",
        imageAlt: "Preview screen showing the main idea and thesis",
    },
    {
        eyebrow: "Read",
        title: "Read in clean sections.",
        body: "Move through a focused reader built to make long ideas easier to follow and easier to retain.",
        imageSrc: "/images/reading-experience-reader-view.webp",
        imageAlt: "Reader view with structured sections",
    },
    {
        eyebrow: "Highlight",
        title: "Save what matters.",
        body: "Highlight the lines and add notes to keep the most useful parts easy to revisit later.",
        imageSrc: "/images/highlighting-and-annotation.webp",
        imageAlt: "Highlighted passages and notes inside the reader",
    },
    {
        eyebrow: "Notes",
        title: "Use notes as memory.",
        body: "Revisit your highlights and commentary when you want the strongest ideas back in one place.",
        imageSrc: "/images/notes.webp",
        imageAlt: "View with saved highlights and notes",
    },
    {
        eyebrow: "Ask",
        title: "Ask anything.",
        body: "Discuss in-depth, compare ideas, and get answers after each read or in your notes.",
        imageSrc: "/images/ai-chat.webp",
        imageAlt: "Ask My Library chat interface",
    },
];

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

export function readGuestOnboardingEntry(storageValue: string | null): OnboardingStateEntry | null {
    if (!storageValue) return null;

    try {
        const parsed = JSON.parse(storageValue) as unknown;
        return isOnboardingStateEntry(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function hasSeenGuestOnboarding(storageValue: string | null) {
    const entry = readGuestOnboardingEntry(storageValue);
    return (
        entry?.version === GUEST_ONBOARDING_VERSION
        && (entry.status === "dismissed" || entry.status === "completed")
    );
}

export function createGuestOnboardingEntry(status: OnboardingStatus): OnboardingStateEntry {
    return {
        status,
        updated_at: new Date().toISOString(),
        version: GUEST_ONBOARDING_VERSION,
    };
}
