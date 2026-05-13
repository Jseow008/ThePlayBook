const ERROR_REPORTING_TIMEOUT_MS = 2_000;

export type ErrorReportSource =
    | "api"
    | "app-error-boundary"
    | "global-error-boundary"
    | "client-error-route";

interface ErrorReportInput {
    source: ErrorReportSource;
    message: string;
    error?: unknown;
    requestId?: string;
    route?: string | null;
    userId?: string;
    digest?: string | null;
    pathname?: string | null;
    url?: string | null;
    context?: Record<string, unknown>;
    skipConsoleLog?: boolean;
}

interface ErrorReportPayload {
    app: "netflux";
    environment: string;
    timestamp: string;
    source: ErrorReportSource;
    message: string;
    request_id: string | null;
    route: string | null;
    user_id: string | null;
    digest: string | null;
    pathname: string | null;
    url: string | null;
    context: Record<string, unknown>;
    error: Record<string, unknown>;
}

interface ReportExceptionResult {
    configured: boolean;
    delivered: boolean;
}

function normalizeUnknown(value: unknown): unknown {
    if (value === undefined || value === null) {
        return value ?? null;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => normalizeUnknown(entry));
    }

    if (value instanceof Error) {
        return normalizeError(value);
    }

    if (typeof value === "object") {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            return String(value);
        }
    }

    return String(value);
}

function normalizeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack ?? null,
            cause: error.cause !== undefined ? normalizeUnknown(error.cause) : null,
        };
    }

    if (typeof error === "string") {
        return {
            name: "NonErrorThrow",
            message: error,
            stack: null,
        };
    }

    return {
        name: "NonErrorThrow",
        message: "Captured non-Error exception.",
        stack: null,
        value: normalizeUnknown(error),
    };
}

function normalizeContext(context?: Record<string, unknown>): Record<string, unknown> {
    if (!context) {
        return {};
    }

    try {
        return JSON.parse(JSON.stringify(context, (_key, value) => normalizeUnknown(value)));
    } catch {
        return {
            serialization_error: "Failed to serialize error-report context.",
        };
    }
}

function getEnvironmentLabel(): string {
    return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
}

function getWebhookUrl(env: NodeJS.ProcessEnv = process.env): string | null {
    const value = env.ERROR_REPORTING_WEBHOOK_URL?.trim();
    return value && value.length > 0 ? value : null;
}

function getWebhookHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return "invalid-url";
    }
}

export function buildErrorReportPayload(input: ErrorReportInput): ErrorReportPayload {
    return {
        app: "netflux",
        environment: getEnvironmentLabel(),
        timestamp: new Date().toISOString(),
        source: input.source,
        message: input.message,
        request_id: input.requestId ?? null,
        route: input.route ?? null,
        user_id: input.userId ?? null,
        digest: input.digest ?? null,
        pathname: input.pathname ?? null,
        url: input.url ?? null,
        context: normalizeContext(input.context),
        error: normalizeError(input.error),
    };
}

export function isErrorReportingConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
    return getWebhookUrl(env) !== null;
}

export async function reportException(input: ErrorReportInput): Promise<ReportExceptionResult> {
    const payload = buildErrorReportPayload(input);
    const webhookUrl = getWebhookUrl();

    if (!input.skipConsoleLog) {
        console.error(
            {
                monitor: "exception-report",
                source: payload.source,
                request_id: payload.request_id,
                route: payload.route,
                user_id: payload.user_id,
                digest: payload.digest,
                message: payload.message,
            },
            payload.error
        );
    }

    if (!webhookUrl) {
        return { configured: false, delivered: false };
    }

    try {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (process.env.ERROR_REPORTING_BEARER_TOKEN) {
            headers.Authorization = `Bearer ${process.env.ERROR_REPORTING_BEARER_TOKEN}`;
        }

        const response = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            cache: "no-store",
            signal: AbortSignal.timeout(ERROR_REPORTING_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.error({
                monitor: "exception-report",
                webhook_host: getWebhookHost(webhookUrl),
                status: response.status,
                message: "Exception reporting webhook rejected the event.",
            });
            return { configured: true, delivered: false };
        }

        return { configured: true, delivered: true };
    } catch (error) {
        console.error(
            {
                monitor: "exception-report",
                webhook_host: getWebhookHost(webhookUrl),
                message: "Exception reporting webhook delivery failed.",
            },
            normalizeError(error)
        );
        return { configured: true, delivered: false };
    }
}
