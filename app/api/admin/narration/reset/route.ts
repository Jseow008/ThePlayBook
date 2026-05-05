import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { resetStaleNarrationProcessingJobs } from "@/lib/server/narration-processing-state";

export const runtime = "nodejs";

const ResetNarrationJobsSchema = z.object({
    jobIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000, key: "reset" });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    if (!(await verifyAdminSession())) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    let body: z.infer<typeof ResetNarrationJobsSchema> = {};
    try {
        const json = await request.json();
        const parsed = ResetNarrationJobsSchema.safeParse(json);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid stale narration reset request.", 400, requestId);
        }

        body = parsed.data;
    } catch {
        body = {};
    }

    try {
        const result = await resetStaleNarrationProcessingJobs(requestId, body.jobIds);
        return NextResponse.json({
            success: true,
            data: result,
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/narration/reset",
            message: "Failed to reset stale narration jobs",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to reset stale narration jobs", 500, requestId);
    }
}
