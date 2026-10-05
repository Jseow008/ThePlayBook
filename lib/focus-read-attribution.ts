import type { FocusOpeningVariant, FocusSelectionSource } from "@/components/focus/focus-opening-experiment";

export const FOCUS_MEASUREMENT_VERSION = 2 as const;

const KEY = "focus-read-attribution-v2";
const PREVIEW_KEY = "focus-preview-attribution-v2";
const MAX_AGE_MS = 30_000;
const PREVIEW_MAX_AGE_MS = 30 * 60_000;

export type FocusActionContext = {
    measurement_version: typeof FOCUS_MEASUREMENT_VERSION;
    focus_visit_id: string;
    content_id: string;
    variant: FocusOpeningVariant;
    entry_kind: "fresh" | "restored";
    selection_source: FocusSelectionSource | "unknown";
    personalization_ready: boolean;
    device_class: "mobile" | "desktop";
    position: number;
};

export function markFocusPreviewIntent(context: FocusActionContext) {
    try {
        window.sessionStorage.removeItem(KEY);
        window.sessionStorage.setItem(PREVIEW_KEY, JSON.stringify({ ...context, at: Date.now() }));
    } catch {
        // Preview navigation remains usable when storage is unavailable.
    }
}

export function promoteFocusPreviewReadIntent(contentId: string) {
    try {
        const raw = window.sessionStorage.getItem(PREVIEW_KEY);
        window.sessionStorage.removeItem(PREVIEW_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as FocusActionContext & { at: number };
        if (parsed.content_id !== contentId || Date.now() - parsed.at > PREVIEW_MAX_AGE_MS) return;
        const { at: _at, ...context } = parsed;
        void _at;
        markFocusReadIntent(context);
    } catch {
        // Reading remains usable when attribution is unavailable.
    }
}

export function markFocusReadIntent(context: FocusActionContext) {
    try {
        window.sessionStorage.removeItem(PREVIEW_KEY);
        window.sessionStorage.setItem(KEY, JSON.stringify({ ...context, at: Date.now() }));
    } catch {
        // Navigation remains usable when storage is unavailable.
    }
}

export function consumeConfirmedFocusRead(contentId: string): FocusActionContext | null {
    try {
        const raw = window.sessionStorage.getItem(KEY);
        if (!raw) return null;
        window.sessionStorage.removeItem(KEY);
        const parsed = JSON.parse(raw) as FocusActionContext & { at: number };
        if (parsed.content_id !== contentId || Date.now() - parsed.at > MAX_AGE_MS) return null;
        const { at: _at, ...context } = parsed;
        void _at;
        return context;
    } catch {
        // Attribution must never interrupt reading.
        return null;
    }
}
