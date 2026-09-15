import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { reconcileExpiredAccountDataSnapshots } from "@/lib/server/account-data-snapshots";

export const runtime = "nodejs";

function hasValidCronSecret(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();
    if (!hasValidCronSecret(request)) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        const result = await reconcileExpiredAccountDataSnapshots();
        return NextResponse.json({ success: true, data: result }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({
            requestId,
            route: "GET /api/admin/account-data-snapshots/process",
            message: "Could not reconcile expired account-data snapshots",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not reconcile expired account-data snapshots.", 503, requestId);
    }
}
