export type ClientErrorBoundarySource = "app-error-boundary" | "global-error-boundary";

interface ReportClientExceptionInput {
    boundary: ClientErrorBoundarySource;
    error: Error & { digest?: string };
    pathname?: string | null;
    href?: string | null;
}

interface ClientErrorReportPayload {
    boundary: ClientErrorBoundarySource;
    digest: string | null;
    message: string;
    name: string;
    pathname: string | null;
    href: string | null;
    stack: string | null;
}

const CLIENT_ERROR_ENDPOINT = "/api/monitor/exceptions";

function buildClientErrorPayload(input: ReportClientExceptionInput): ClientErrorReportPayload {
    const location = typeof window !== "undefined" ? window.location : null;

    return {
        boundary: input.boundary,
        digest: input.error.digest ?? null,
        message: input.error.message,
        name: input.error.name,
        pathname: input.pathname ?? location?.pathname ?? null,
        href: input.href ?? location?.href ?? null,
        stack: input.error.stack ?? null,
    };
}

export async function reportClientException(input: ReportClientExceptionInput): Promise<void> {
    const payload = buildClientErrorPayload(input);
    const body = JSON.stringify(payload);

    try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            const queued = navigator.sendBeacon(CLIENT_ERROR_ENDPOINT, body);
            if (queued) {
                return;
            }
        }

        await fetch(CLIENT_ERROR_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body,
            keepalive: true,
        });
    } catch {
        // Preserve the fallback UI even if reporting fails.
    }
}
