import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import {
    CONTENT_REQUEST_NOTIFICATION_BATCH_SIZE,
    EmailConfigurationError,
    processQueuedContentRequestNotifications,
} from "@/lib/server/content-request-notifications";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

function hasValidCronSecret(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return false;
    }

    return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function authorizeProcessorRequest(request: NextRequest, allowAdminSession: boolean) {
    if (hasValidCronSecret(request)) {
        return true;
    }

    if (!allowAdminSession) {
        return false;
    }

    return verifyAdminSession();
}

function buildProcessingErrorResponse(error: unknown, requestId: string) {
    if (error instanceof EmailConfigurationError) {
        return apiError("INTERNAL_ERROR", error.message, 503, requestId);
    }

    return apiError("INTERNAL_ERROR", "Could not process request notifications.", 500, requestId);
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();
    const authorized = await authorizeProcessorRequest(request, false);

    if (!authorized) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        const result = await processQueuedContentRequestNotifications(CONTENT_REQUEST_NOTIFICATION_BATCH_SIZE);
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/request-notifications/process[GET]",
            message: "Failed to process queued request notifications",
            error,
        });
        return buildProcessingErrorResponse(error, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000, key: "request-notifications-process" });

    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    const authorized = await authorizeProcessorRequest(request, true);
    if (!authorized) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        const result = await processQueuedContentRequestNotifications(CONTENT_REQUEST_NOTIFICATION_BATCH_SIZE);
        return NextResponse.json({ success: true, data: result });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/request-notifications/process[POST]",
            message: "Failed to process queued request notifications",
            error,
        });
        return buildProcessingErrorResponse(error, requestId);
    }
}
