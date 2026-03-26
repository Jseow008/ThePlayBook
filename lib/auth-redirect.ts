export function normalizeNextPath(
    candidate: string | null | undefined,
    fallback = "/"
) {
    if (!candidate) {
        return fallback;
    }

    const trimmed = candidate.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
        return fallback;
    }

    try {
        const url = new URL(trimmed, "http://localhost");

        if (url.origin !== "http://localhost") {
            return fallback;
        }

        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return fallback;
    }
}
