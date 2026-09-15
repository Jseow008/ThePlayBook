import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import {
    AccountDataSnapshotError,
    getLibrarySnapshotPage,
    LIBRARY_SNAPSHOT_COLLECTION,
} from "@/lib/server/account-data-snapshots";

const ParamsSchema = z.object({
    snapshotId: z.string().uuid(),
    collection: z.literal(LIBRARY_SNAPSHOT_COLLECTION),
});

const CursorSchema = z.object({ ordinal: z.number().int().min(0) });

function cursorSecret() {
    const secret = process.env.ACCOUNT_DATA_CURSOR_SECRET;
    if (!secret) throw new AccountDataSnapshotError("CONFIGURATION", "Missing ACCOUNT_DATA_CURSOR_SECRET.");
    return secret;
}

function signCursor(accountId: string, snapshotId: string, ordinal: number) {
    const payload = Buffer.from(JSON.stringify({ ordinal })).toString("base64url");
    const signature = createHmac("sha256", cursorSecret())
        .update(`${accountId}:${snapshotId}:${payload}`)
        .digest("base64url");
    return `${payload}.${signature}`;
}

function decodeCursor(accountId: string, snapshotId: string, cursor: string | null) {
    if (!cursor) return 0;
    const [payload, suppliedSignature] = cursor.split(".");
    if (!payload || !suppliedSignature) throw new Error("Invalid cursor.");
    const expectedSignature = createHmac("sha256", cursorSecret())
        .update(`${accountId}:${snapshotId}:${payload}`)
        .digest("base64url");
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid cursor.");
    return CursorSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).ordinal;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ snapshotId: string; collection: string }> },
) {
    const requestId = getRequestId();
    try {
        const parsedParams = ParamsSchema.safeParse(await params);
        if (!parsedParams.success) return apiError("VALIDATION_ERROR", "Invalid snapshot path.", 400, requestId);

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return apiError("UNAUTHORIZED", "Sign in to synchronize your library.", 401, requestId);

        const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10);
        const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 200 ? requestedLimit : 100;
        let afterOrdinal: number;
        try {
            afterOrdinal = decodeCursor(user.id, parsedParams.data.snapshotId, request.nextUrl.searchParams.get("cursor"));
        } catch {
            return apiError("VALIDATION_ERROR", "This snapshot cursor is invalid. Start again.", 400, requestId, { snapshot_error: "CURSOR_INVALID" });
        }

        const page = await getLibrarySnapshotPage(user.id, parsedParams.data.snapshotId, afterOrdinal, limit);
        const endOrdinal = page.records.at(-1)?.ordinal;
        return NextResponse.json({
            data: page.records,
            manifest: page.manifest,
            pageInfo: {
                hasNextPage: page.hasNextPage,
                endCursor: endOrdinal === undefined ? null : signCursor(user.id, parsedParams.data.snapshotId, endOrdinal),
            },
        });
    } catch (error) {
        if (error instanceof AccountDataSnapshotError) {
            const status = error.code === "NOT_FOUND" ? 404 : error.code === "EXPIRED" ? 410 : 503;
            return apiError(error.code === "NOT_FOUND" || error.code === "EXPIRED" ? "NOT_FOUND" : "INTERNAL_ERROR", error.message, status, requestId, {
                snapshot_error: error.code,
            });
        }
        logApiError({ requestId, route: "GET /api/account-data/snapshots/[snapshotId]/[collection]", message: "Unexpected snapshot page failure", error });
        return apiError("INTERNAL_ERROR", "Could not read this library snapshot.", 500, requestId);
    }
}
