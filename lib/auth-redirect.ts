export const DEFAULT_LOGIN_REDIRECT_PATH = "/browse";
export const REFLECTION_RESUME_PARAM = "resumeReflection";

export function isPublicSummaryPath(pathname: string) {
    return /^\/(?:read\/[^/]+(?:\/[^/]+)?|preview\/[^/]+)\/?$/.test(pathname);
}

function normalizePath(
    candidate: string | null | undefined,
    fallback: string
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

export function normalizeNextPath(
    candidate: string | null | undefined,
    fallback = "/"
) {
    return normalizePath(candidate, fallback);
}

export function normalizeLoginNextPath(
    candidate: string | null | undefined,
    fallback = DEFAULT_LOGIN_REDIRECT_PATH
) {
    const normalized = normalizePath(candidate, fallback);

    try {
        const url = new URL(normalized, "http://localhost");
        const { pathname } = url;

        if (
            pathname === "/"
            || pathname === "/login"
            || pathname === "/auth"
            || pathname.startsWith("/auth/")
        ) {
            return fallback;
        }

        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return fallback;
    }
}

export function buildLoginHref(nextPath: string | null | undefined) {
    const normalizedNext = normalizeLoginNextPath(nextPath);
    const searchParams = new URLSearchParams({
        next: normalizedNext,
    });

    return `/login?${searchParams.toString()}`;
}

export function getLoginBackPath(nextPath: string) {
    const url = new URL(normalizeLoginNextPath(nextPath), "http://localhost");
    if (!isPublicSummaryPath(url.pathname)) {
        return DEFAULT_LOGIN_REDIRECT_PATH;
    }

    if (url.searchParams.has(REFLECTION_RESUME_PARAM)) {
        url.searchParams.delete(REFLECTION_RESUME_PARAM);
    }
    return `${url.pathname}${url.search}${url.hash}`;
}
