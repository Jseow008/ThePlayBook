import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { getNarrationQueueStatus, NARRATION_PROCESS_BATCH_SIZE } from "@/lib/server/narration-processor";

export const runtime = "nodejs";

export async function GET() {
    const requestId = getRequestId();

    if (!(await verifyAdminSession())) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    try {
        const status = await getNarrationQueueStatus();
        return NextResponse.json({
            success: true,
            data: {
                summary: {
                    queuedCount: status.queuedCount,
                    processingCount: status.processingCount,
                },
                processingJobs: status.processingJobs,
                staleProcessingJobs: status.staleProcessingJobs,
                batchSize: NARRATION_PROCESS_BATCH_SIZE,
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/narration/status",
            message: "Failed to load narration queue status",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to load narration queue status", 500, requestId);
    }
}
