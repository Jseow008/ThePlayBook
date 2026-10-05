import type { FocusOpeningVariant, FocusSelectionSource } from "@/components/focus/focus-opening-experiment";

const KEY = "focus-read-attribution-v1";
const MAX_AGE_MS = 30_000;

export type FocusActionContext = {
    focus_visit_id: string;
    content_id: string;
    variant: FocusOpeningVariant;
    entry_kind: "fresh" | "restored";
    selection_source: FocusSelectionSource | "unknown";
    personalization_ready: boolean;
    device_class: "mobile" | "desktop";
    position: number;
};

export function markFocusReadIntent(context: FocusActionContext) {
    try {
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
