export const IMAGE_SURFACES = [
    "content-card",
    "hero-carousel",
    "content-preview",
    "reader-hero",
    "completion-card",
] as const;

export const IMAGE_FALLBACK_STAGES = [
    "direct_retry",
    "final_failure",
] as const;

export const IMAGE_SOURCE_TYPES = [
    "local",
    "remote",
] as const;

export type ImageSurface = (typeof IMAGE_SURFACES)[number];
export type ImageFallbackStage = (typeof IMAGE_FALLBACK_STAGES)[number];
export type ImageSourceType = (typeof IMAGE_SOURCE_TYPES)[number];

interface NormalizedImageSource {
    host: string | null;
    pathname: string;
    src_type: ImageSourceType;
}

const reportedFallbacks = new Set<string>();

function isLikelyPathname(pathname: string) {
    return pathname.startsWith("/");
}

export function normalizeImageSource(src: string): NormalizedImageSource | null {
    const sanitizedSrc = src.trim();
    if (!sanitizedSrc) {
        return null;
    }

    if (sanitizedSrc.startsWith("/")) {
        return {
            host: null,
            pathname: sanitizedSrc.split(/[?#]/, 1)[0] || "/",
            src_type: "local",
        };
    }

    try {
        const parsed = new URL(sanitizedSrc);
        return {
            host: parsed.host || null,
            pathname: parsed.pathname || "/",
            src_type: "remote",
        };
    } catch {
        const pathname = sanitizedSrc.split(/[?#]/, 1)[0];

        if (!pathname || !isLikelyPathname(pathname)) {
            return null;
        }

        return {
            host: null,
            pathname,
            src_type: "local",
        };
    }
}

export function reportImageFallback(params: {
    src: string;
    stage: ImageFallbackStage;
    surface: ImageSurface;
}) {
    if (typeof window === "undefined") {
        return;
    }

    const normalized = normalizeImageSource(params.src);
    if (!normalized) {
        return;
    }

    const fingerprint = [
        params.surface,
        params.stage,
        normalized.src_type,
        normalized.host ?? "self",
        normalized.pathname,
    ].join("::");

    if (reportedFallbacks.has(fingerprint)) {
        return;
    }

    reportedFallbacks.add(fingerprint);

    const payload = JSON.stringify({
        host: normalized.host,
        pathname: normalized.pathname,
        src_type: normalized.src_type,
        stage: params.stage,
        surface: params.surface,
    });

    const endpointPath = "/api/monitor/image-fallback";
    const endpointUrl =
        typeof window !== "undefined" && window.location.origin.startsWith("http")
            ? new URL(endpointPath, window.location.origin).toString()
            : "http://localhost/api/monitor/image-fallback";

    try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            const body = new Blob([payload], { type: "application/json" });
            navigator.sendBeacon(endpointPath, body);
            return;
        }

        void fetch(endpointUrl, {
            body: payload,
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            method: "POST",
        });
    } catch {
        // Swallow diagnostics failures so broken telemetry never blocks image recovery.
    }
}
