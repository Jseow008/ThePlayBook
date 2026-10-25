import "server-only";
import { APICallError, JSONParseError, NoObjectGeneratedError, NoOutputGeneratedError, TypeValidationError } from "ai";

const providerCodes = ["rate_limit_exceeded", "insufficient_quota", "model_not_found", "invalid_api_key",
    "authentication_error", "invalid_request_error", "overloaded_error", "permission_error", "context_length_exceeded"] as const;
const finishReasons = ["stop", "length", "content-filter", "tool-calls", "error", "other", "unknown"] as const;

export type SelectionFailureDiagnostics = {
    category: "provider_api" | "invalid_response" | "invalid_selection" | "unknown";
    duration_ms: number;
    status_code?: number;
    retryable?: boolean;
    provider_code?: typeof providerCodes[number];
    finish_reason?: typeof finishReasons[number];
};

/** Never retain an exception, message, URL, header, prompt, response body or model output. */
export function selectionFailureDiagnostics(error: unknown, durationMs: number): SelectionFailureDiagnostics {
    const base: SelectionFailureDiagnostics = { category: "unknown",
        duration_ms: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0 };
    try {
        if (APICallError.isInstance(error)) {
            const result: SelectionFailureDiagnostics = { ...base, category: "provider_api" };
            if (Number.isInteger(error.statusCode) && error.statusCode! >= 100 && error.statusCode! <= 599) result.status_code = error.statusCode;
            if (typeof error.isRetryable === "boolean") result.retryable = error.isRetryable;
            const data = error.data as { error?: { code?: unknown; type?: unknown } } | undefined;
            const code = data?.error?.code ?? data?.error?.type;
            if (providerCodes.some((allowed) => allowed === code)) result.provider_code = code as typeof providerCodes[number];
            return result;
        }
        if (NoObjectGeneratedError.isInstance(error)) {
            const result: SelectionFailureDiagnostics = { ...base, category: "invalid_response" };
            if (finishReasons.some((allowed) => allowed === error.finishReason)) result.finish_reason = error.finishReason as typeof finishReasons[number];
            return result;
        }
        if (NoOutputGeneratedError.isInstance(error) || JSONParseError.isInstance(error) || TypeValidationError.isInstance(error)) {
            return { ...base, category: "invalid_response" };
        }
    } catch { /* Diagnostics must not mask the original failure, including hostile getters. */ }
    return base;
}
