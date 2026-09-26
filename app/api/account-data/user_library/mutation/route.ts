import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { commitLibraryMutationForAccount } from "@/lib/server/account-data-snapshots";
import { LibraryMutationConflictError } from "@/lib/user-library-mutation-contract";

export const runtime = "nodejs";

type MutationRequest = {
    expectedAccountId?: unknown;
    baseRevision?: unknown;
    resetEpoch?: unknown;
    contentId?: unknown;
    isBookmarked?: unknown;
    progress?: unknown;
    lastInteractedAt?: unknown;
    deleteIfEmpty?: unknown;
};

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return apiError("UNAUTHORIZED", "Sign in to update your library.", 401, requestId);

        let body: MutationRequest;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON payload.", 400, requestId);
        }
        if (
            !body || typeof body !== "object"
            || typeof body.expectedAccountId !== "string" || !body.expectedAccountId
            || typeof body.baseRevision !== "number" || !Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0
            || typeof body.resetEpoch !== "number" || !Number.isSafeInteger(body.resetEpoch) || body.resetEpoch < 0
            || typeof body.contentId !== "string" || !isUuid(body.contentId)
            || typeof body.isBookmarked !== "boolean"
            || typeof body.deleteIfEmpty !== "boolean"
            || typeof body.lastInteractedAt !== "string" || !Number.isFinite(Date.parse(body.lastInteractedAt))
            || (body.progress !== null && (typeof body.progress !== "object" || Array.isArray(body.progress)))
        ) {
            return apiError("VALIDATION_ERROR", "This library change is invalid.", 400, requestId);
        }

        if (body.expectedAccountId !== user.id) {
            return NextResponse.json({ error: {
                code: "LIBRARY_CONFLICT",
                message: "Your account changed. Refresh your library before trying again.",
                request_id: requestId,
            } }, { status: 409, headers: { "Cache-Control": "no-store" } });
        }

        const data = await commitLibraryMutationForAccount(user.id, {
            baseRevision: body.baseRevision,
            resetEpoch: body.resetEpoch,
            contentId: body.contentId,
            isBookmarked: body.isBookmarked,
            progress: body.progress ?? null,
            lastInteractedAt: body.lastInteractedAt,
            deleteIfEmpty: body.deleteIfEmpty,
        });
        return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        if (error instanceof LibraryMutationConflictError) {
            return NextResponse.json({ error: {
                code: "LIBRARY_CONFLICT",
                message: "Your library changed. Refresh it before trying again.",
                request_id: requestId,
                current: error.current,
            } }, { status: 409, headers: { "Cache-Control": "no-store" } });
        }
        logApiError({ requestId, route: "POST /api/account-data/user_library/mutation", message: "Could not commit authenticated library mutation", error });
        return apiError("INTERNAL_ERROR", "Could not update your library.", 503, requestId);
    }
}
