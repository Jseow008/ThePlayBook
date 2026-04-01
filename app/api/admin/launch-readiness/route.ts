import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { getLaunchReadinessReport } from "@/lib/server/launch-readiness";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: Request) {
    const requestId = getRequestId();

    try {
        const rl = await bestEffortRateLimit(request as any, {
            limit: 20,
            windowMs: 60_000,
            routeLabel: "/api/admin/launch-readiness",
        });
        if (!rl.success) {
            return NextResponse.json(
                { error: { code: "RATE_LIMITED", message: "Too many requests." } },
                { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
            );
        }

        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
        }

        const report = await getLaunchReadinessReport();
        return NextResponse.json(report, { status: report.status === "ready" ? 200 : 503 });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/launch-readiness",
            message: "Failed to load launch readiness",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to load launch readiness", 500, requestId);
    }
}
