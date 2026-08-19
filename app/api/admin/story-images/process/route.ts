import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import {
    expireStaleStoryImageJobs,
    getStoryImageQueueSummary,
    processStoryImageJobs,
    STORY_IMAGE_PROCESS_BATCH_SIZE,
} from "@/lib/server/story-image-processor";

export const runtime = "nodejs";
export const maxDuration = 300;

function hasValidCronSecret(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    return Boolean(cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`);
}

async function authorizeProcessorRequest(request: NextRequest, allowAdminSession: boolean) {
    if (hasValidCronSecret(request)) return true;
    return allowAdminSession ? verifyAdminSession() : false;
}

async function processQueue(requestId: string) {
    await expireStaleStoryImageJobs();
    const summaryBefore = await getStoryImageQueueSummary();
    const result = await processStoryImageJobs(requestId, STORY_IMAGE_PROCESS_BATCH_SIZE);
    const summaryAfter = await getStoryImageQueueSummary();
    return NextResponse.json({
        success: true,
        data: {
            ...result,
            batchSize: STORY_IMAGE_PROCESS_BATCH_SIZE,
            queueSummaryBefore: summaryBefore,
            queueSummaryAfter: summaryAfter,
        },
    });
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();
    if (!await authorizeProcessorRequest(request, false)) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        return await processQueue(requestId);
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/story-images/process",
            message: "Failed to process story image queue",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to process story image queue", 500, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000, key: "story-image-process" });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    if (!await authorizeProcessorRequest(request, true)) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        return await processQueue(requestId);
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/story-images/process",
            message: "Failed to process story image queue",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to process story image queue", 500, requestId);
    }
}
