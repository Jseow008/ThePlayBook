import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import {
    buildProcessErrorResponseMessage,
    expireStaleNarrationProcessingJobs,
    getNarrationQueueSummary,
    NARRATION_PROCESS_BATCH_SIZE,
    processNarrationJobs,
} from "@/lib/server/narration-processor";

export const runtime = "nodejs";
export const maxDuration = 300;

function hasValidCronSecret(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
        return false;
    }

    return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function buildProcessErrorResponse(error: unknown, requestId: string) {
    const { message, status } = buildProcessErrorResponseMessage(error);
    return apiError("INTERNAL_ERROR", message, status, requestId);
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

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    const authorized = await authorizeProcessorRequest(request, false);
    if (!authorized) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        await expireStaleNarrationProcessingJobs(requestId);
        const summaryBefore = await getNarrationQueueSummary();
        const result = await processNarrationJobs(requestId, NARRATION_PROCESS_BATCH_SIZE);
        const summaryAfter = await getNarrationQueueSummary();
        return NextResponse.json({
            success: true,
            data: {
                ...result,
                batchSize: NARRATION_PROCESS_BATCH_SIZE,
                queueSummaryBefore: summaryBefore,
                queueSummaryAfter: summaryAfter,
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/narration/process",
            message: "Failed to process queued AI narration",
            error,
        });
        return buildProcessErrorResponse(error, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000, key: "process" });
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
        await expireStaleNarrationProcessingJobs(requestId);
        const summaryBefore = await getNarrationQueueSummary();
        const result = await processNarrationJobs(requestId, NARRATION_PROCESS_BATCH_SIZE);
        const summaryAfter = await getNarrationQueueSummary();
        return NextResponse.json({
            success: true,
            data: {
                ...result,
                batchSize: NARRATION_PROCESS_BATCH_SIZE,
                queueSummaryBefore: summaryBefore,
                queueSummaryAfter: summaryAfter,
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/narration/process",
            message: "Failed to process queued AI narration",
            error,
        });
        return buildProcessErrorResponse(error, requestId);
    }
}
