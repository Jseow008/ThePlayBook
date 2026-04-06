import { normalizeNextPath } from "@/lib/auth-redirect";

export function normalizeAdminReturnTo(
    candidate: string | null | undefined,
    fallback = "/admin/content"
) {
    const normalized = normalizeNextPath(candidate, fallback);

    if (normalized === "/admin" || normalized.startsWith("/admin/")) {
        return normalized;
    }

    return fallback;
}

export function withNarrationWarning(destination: string, narrationWarning: string) {
    const normalizedDestination = normalizeAdminReturnTo(destination, "/admin/content");
    const url = new URL(normalizedDestination, "http://localhost");

    if (narrationWarning) {
        url.searchParams.set("narration_warning", narrationWarning);
    } else {
        url.searchParams.delete("narration_warning");
    }

    return `${url.pathname}${url.search}${url.hash}`;
}
