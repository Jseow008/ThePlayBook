import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { createLibrarySnapshot, AccountDataSnapshotError } from "@/lib/server/account-data-snapshots";
import { rateLimitFailureResponseWithTelemetry, strictPublicRateLimit } from "@/lib/server/rate-limit";

const CreateSnapshotSchema = z.object({
    idempotencyKey: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return apiError("UNAUTHORIZED", "Sign in to synchronize your library.", 401, requestId);

        const limit = await strictPublicRateLimit(request, {
            limit: 6,
            windowMs: 60 * 60 * 1000,
            key: "account-data-snapshot",
            identifier: user.id,
            routeLabel: "account-data-snapshot",
        });
        if (!limit.success) {
            return rateLimitFailureResponseWithTelemetry({
                request,
                requestId,
                result: limit,
                route: "POST /api/account-data/snapshots",
                category: "public",
                userId: user.id,
                authState: "authenticated",
                message: "Too many snapshot requests. Please wait before trying again.",
            });
        }

        const body = await request.json().catch(() => ({}));
        const parsed = CreateSnapshotSchema.safeParse(body);
        if (!parsed.success) return apiError("VALIDATION_ERROR", "Invalid snapshot request.", 400, requestId);

        const result = await createLibrarySnapshot(user.id, parsed.data.idempotencyKey ?? randomUUID());
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
