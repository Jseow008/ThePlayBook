import "server-only";

import * as Sentry from "@sentry/nextjs";

export type SecuritySignal =
    | "admin_auth_failure"
    | "invalid_unsubscribe_token"
    | "ai_rate_limit_exhausted"
    | "ai_quota_exhausted"
    | "ai_invalid_payload"
    | "rate_limit_exhausted"
    | "rate_limit_unavailable";

export type SecurityTelemetryCategory =
    | "admin"
    | "unsubscribe"
    | "ai"
    | "public"
    | "supabase_advisor";

type SecurityTelemetrySeverity = "warning" | "error";
type SafeTelemetryValue = string | number | boolean | null | undefined;

const DEFAULT_SENTRY_THROTTLE_MS = 5 * 60_000;
const sentryThrottle = new Map<string, number>();
const SAFE_METADATA_KEYS = new Set([
    "channel",
    "message_count",
    "total_chars",
    "payload_kind",
    "blocked_window",
    "limit",
    "used",
    "reset_after_seconds",
    "status",
]);

interface RecordSecuritySignalParams {
    signal: SecuritySignal;
    route: string;
    requestId?: string;
    request?: Request;
    method?: string;
    severity?: SecurityTelemetrySeverity;
    category: SecurityTelemetryCategory;
    userId?: string;
    authState?: "anonymous" | "authenticated" | "unknown";
    reason?: string;
    retryAfterMs?: number;
    metadata?: Record<string, SafeTelemetryValue>;
    sentryThrottleMs?: number;
}

function getMethod(params: Pick<RecordSecuritySignalParams, "method" | "request">) {
    return params.method ?? params.request?.method ?? "UNKNOWN";
}

function getAuthState(params: Pick<RecordSecuritySignalParams, "authState" | "userId">) {
    if (params.authState) {
        return params.authState;
    }

    return params.userId ? "authenticated" : "unknown";
}

function sanitizeMetadata(metadata: Record<string, SafeTelemetryValue> | undefined) {
    const safe: Record<string, SafeTelemetryValue> = {};

    for (const [key, value] of Object.entries(metadata ?? {})) {
        if (!SAFE_METADATA_KEYS.has(key)) {
            continue;
        }

        if (typeof value === "string") {
            safe[key] = value.slice(0, 120);
            continue;
        }

        safe[key] = value;
    }

    return safe;
}

function getThrottleKey(params: RecordSecuritySignalParams) {
    return [
        params.signal,
        params.route,
        params.category,
        params.userId ?? "anonymous",
    ].join(":");
}

function shouldCaptureSentry(params: RecordSecuritySignalParams) {
    const throttleMs = params.sentryThrottleMs ?? DEFAULT_SENTRY_THROTTLE_MS;
    if (throttleMs <= 0) {
        return true;
    }

    const now = Date.now();
    const key = getThrottleKey(params);
    const nextAllowedAt = sentryThrottle.get(key) ?? 0;

    if (nextAllowedAt > now) {
        return false;
    }

    sentryThrottle.set(key, now + throttleMs);

    if (sentryThrottle.size > 1_000) {
        for (const [entryKey, entryNextAllowedAt] of sentryThrottle.entries()) {
            if (entryNextAllowedAt <= now) {
                sentryThrottle.delete(entryKey);
            }
        }
    }

    return true;
}

export function recordSecuritySignal(params: RecordSecuritySignalParams) {
    const severity = params.severity ?? "warning";
    const safeMetadata = sanitizeMetadata(params.metadata);
    const authState = getAuthState(params);
    const method = getMethod(params);
    const event = {
        source: "security",
        security_signal: params.signal,
        category: params.category,
        route: params.route,
        method,
        request_id: params.requestId,
        user_id: params.userId,
        auth_state: authState,
        reason: params.reason,
        retry_after_ms: params.retryAfterMs,
        ...safeMetadata,
    };

    console.warn("[security]", event);

    if (!shouldCaptureSentry(params)) {
        return;
    }

    Sentry.withScope((scope) => {
        scope.setLevel(severity);
        scope.setTag("source", "security");
        scope.setTag("security_signal", params.signal);
        scope.setTag("security_category", params.category);
        scope.setTag("route", params.route);

        if (params.userId) {
            scope.setUser({ id: params.userId });
        }

        scope.setContext("security_signal", event);
        Sentry.captureMessage(`Security signal: ${params.signal}`);
    });
}

export function recordAdminAuthFailure(params: {
    request?: Request;
    requestId?: string;
    route?: string;
    reason: string;
    userId?: string;
}) {
    recordSecuritySignal({
        signal: "admin_auth_failure",
        category: "admin",
        route: params.route ?? "/admin",
        request: params.request,
        requestId: params.requestId,
        userId: params.userId,
        authState: params.userId ? "authenticated" : "anonymous",
        reason: params.reason,
    });
}

export function recordInvalidUnsubscribeToken(params: {
    request: Request;
    requestId: string;
    route: string;
    channel: "weekly_email" | "request_published";
    reason?: string;
}) {
    recordSecuritySignal({
        signal: "invalid_unsubscribe_token",
        category: "unsubscribe",
        route: params.route,
        request: params.request,
        requestId: params.requestId,
        authState: "anonymous",
        reason: params.reason ?? "malformed_token",
        metadata: {
            channel: params.channel,
        },
    });
}

export function recordAiRouteAbuse(params: {
    signal: "ai_invalid_payload" | "ai_quota_exhausted";
    request: Request;
    requestId: string;
    route: string;
    userId?: string;
    authState?: "anonymous" | "authenticated";
    reason: string;
    retryAfterMs?: number;
    metadata?: Record<string, SafeTelemetryValue>;
}) {
    recordSecuritySignal({
        signal: params.signal,
        category: "ai",
        route: params.route,
        request: params.request,
        requestId: params.requestId,
        userId: params.userId,
        authState: params.authState ?? (params.userId ? "authenticated" : "anonymous"),
        reason: params.reason,
        retryAfterMs: params.retryAfterMs,
        metadata: params.metadata,
    });
}

export function __resetSecurityTelemetryForTests() {
    sentryThrottle.clear();
}
