import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { AccountDataSnapshotError, getAccountDataSnapshotManifest } from "@/lib/server/account-data-snapshots";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";

const ParamsSchema = z.object({ snapshotId: z.string().uuid() });

/** Returns only an existing snapshot's verified manifest; never its payload. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ snapshotId: string }> }) {
    const requestId = getRequestId();
    try {
        const parsedParams = ParamsSchema.safeParse(await params);
        if (!parsedParams.success) return apiError("VALIDATION_ERROR", "Invalid export reference.", 400, requestId);

        const session = await getVerifiedAccountDataSession();
        if (!session) return apiError("UNAUTHORIZED", "Sign in to resume your export.", 401, requestId);

        const manifest = await getAccountDataSnapshotManifest(
            session.accountId,
            parsedParams.data.snapshotId,
            session.sessionId,
        );
        return NextResponse.json({ manifest }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        if (error instanceof AccountDataSnapshotError) {
            const status = error.code === "NOT_FOUND" ? 404 : error.code === "EXPIRED" || error.code === "INVALIDATED" ? 410 : 503;
            return apiError(error.code === "NOT_FOUND" || error.code === "EXPIRED" || error.code === "INVALIDATED" ? "NOT_FOUND" : "INTERNAL_ERROR", error.message, status, requestId, {
                snapshot_error: error.code,
            });
        }
        logApiError({ requestId, route: "GET /api/account-data/snapshots/[snapshotId]", message: "Unexpected export-resume lookup failure", error });
        return apiError("INTERNAL_ERROR", "Could not resume this export.", 500, requestId);
    }
}
