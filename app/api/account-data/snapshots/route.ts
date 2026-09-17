import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { ACCOUNT_DATA_SNAPSHOT_COLLECTIONS, type AccountDataSnapshotCollection } from "@/lib/account-data-snapshot-collections";
import { createAccountDataSnapshot, AccountDataSnapshotError } from "@/lib/server/account-data-snapshots";
import { rateLimitFailureResponseWithTelemetry, strictPublicRateLimit } from "@/lib/server/rate-limit";
import { getVerifiedAccountDataSession } from "@/lib/server/account-data-snapshot-auth";

const CreateSnapshotSchema = z.object({
    idempotencyKey: z.string().uuid().optional(),
    collections: z.array(z.enum(ACCOUNT_DATA_SNAPSHOT_COLLECTIONS)).min(1).max(ACCOUNT_DATA_SNAPSHOT_COLLECTIONS.length).optional(),
});

function isCompleteAccountExport(collections: readonly AccountDataSnapshotCollection[] | undefined) {
    if (!collections || collections.length !== ACCOUNT_DATA_SNAPSHOT_COLLECTIONS.length) return false;
    const requested = new Set(collections);
    return requested.size === ACCOUNT_DATA_SNAPSHOT_COLLECTIONS.length
        && ACCOUNT_DATA_SNAPSHOT_COLLECTIONS.every((collection) => requested.has(collection));
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    try {
        const session = await getVerifiedAccountDataSession();
        if (!session) return apiError("UNAUTHORIZED", "Sign in to synchronize your library.", 401, requestId);

        const body = await request.json().catch(() => ({}));
        const parsed = CreateSnapshotSchema.safeParse(body);
        if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid snapshot request.", 400, requestId);

        // Background hydration is intentionally frequent enough to recover a
        // user's library. A full privacy export is more expensive, but must
        // not be blocked because hydration consumed that separate allowance.
        const completeExport = isCompleteAccountExport(parsed.data.collections);
        const limit = await strictPublicRateLimit(request, {
            limit: completeExport ? 2 : 6,
            windowMs: 60 * 60 * 1000,
            key: completeExport ? "account-data-export-snapshot" : "account-data-snapshot",
            identifier: session.accountId,
            routeLabel: completeExport ? "account-data-export-snapshot" : "account-data-snapshot",
        });
        if (!limit.success) {
            return rateLimitFailureResponseWithTelemetry({
                request,
                requestId,
                result: limit,
                route: "POST /api/account-data/snapshots",
                category: "public",
                userId: session.accountId,
                authState: "authenticated",
                message: completeExport
                    ? "Too many export requests. Please wait before trying again."
                    : "Too many snapshot requests. Please wait before trying again.",
            });
        }

        const result = await createAccountDataSnapshot(
            session.accountId,
            parsed.data.idempotencyKey ?? randomUUID(),
            parsed.data.collections,
            completeExport ? { resumeSessionId: session.sessionId } : undefined,
        );
        if (result.state === "building") {
            return NextResponse.json({ state: result.state, snapshotId: result.snapshotId }, { status: 202 });
        }
        if (result.state === "failed") {
            return apiError("INTERNAL_ERROR", "Could not create a complete library snapshot.", 503, requestId, {
                snapshot_id: result.snapshotId,
                snapshot_error: result.code,
            });
        }
        return NextResponse.json({ state: result.state, manifest: result.manifest }, {
            status: 201,
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        if (error instanceof AccountDataSnapshotError) {
            const status = error.code === "CONFIGURATION" ? 503 : error.code === "IDEMPOTENCY_KEY_REUSED" ? 409 : 500;
            return apiError(error.code === "IDEMPOTENCY_KEY_REUSED" ? "CONFLICT" : "INTERNAL_ERROR", error.message, status, requestId, {
                snapshot_error: error.code,
            });
        }
        logApiError({ requestId, route: "POST /api/account-data/snapshots", message: "Unexpected snapshot creation failure", error });
        return apiError("INTERNAL_ERROR", "Could not create a complete library snapshot.", 500, requestId);
    }
}
