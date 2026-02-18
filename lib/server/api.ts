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
    requestId: string
) {
    return NextResponse.json(
        {
            error: {
                code,
                message,
                request_id: requestId,
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
