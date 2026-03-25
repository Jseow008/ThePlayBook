import { NextResponse } from "next/server";

export type ApiErrorCode =
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "VALIDATION_ERROR"
    | "INVALID_JSON"
    | "NOT_FOUND"
    | "INTERNAL_ERROR";

export function getRequestId(): string {
    return crypto.randomUUID();
}

export function apiError(
    code: ApiErrorCode,
    message: string,
    status: number,
    requestId: string,
    details?: unknown
) {
    return NextResponse.json(
        {
            error: {
                code,
                message,
                request_id: requestId,
                ...(details !== undefined ? { details } : {}),
            },
        },
        { status }
    );
}

export function logApiError(params: {
    requestId: string;
    route: string;
    message: string;
    error: unknown;
    userId?: string;
}) {
    const base = {
        request_id: params.requestId,
        route: params.route,
        user_id: params.userId,
        message: params.message,
    };

    if (params.error instanceof Error) {
        console.error(base, {
            error_name: params.error.name,
            error_message: params.error.message,
        });
        return;
    }

    console.error(base, { error: params.error });
}

function getErrorCode(error: unknown): string | null {
    if (!error || typeof error !== "object" || !("code" in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
}

function getErrorStringProperty(error: unknown, key: string): string | null {
    if (!error || typeof error !== "object" || !(key in error)) {
        return null;
    }

    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" ? value : null;
}

export function isSupabaseNotFoundError(error: unknown): boolean {
    return getErrorCode(error) === "PGRST116";
}

export function isPostgresUniqueViolation(error: unknown): boolean {
    return getErrorCode(error) === "23505";
}

export function isUniqueConstraintViolation(error: unknown, constraint: string): boolean {
    if (!isPostgresUniqueViolation(error)) {
        return false;
    }

    return getErrorStringProperty(error, "constraint") === constraint
        || getErrorStringProperty(error, "constraint_name") === constraint;
}
