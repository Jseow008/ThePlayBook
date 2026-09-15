import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { getLiveLibraryPage } from "@/lib/server/account-data-snapshots";

type CursorPayload = { updatedAt: string; contentId: string };

function cursorSecret() {
    const secret = process.env.ACCOUNT_DATA_CURSOR_SECRET;
    if (!secret) throw new Error("Missing ACCOUNT_DATA_CURSOR_SECRET.");
    return secret;
}

function encodeCursor(accountId: string, value: CursorPayload) {
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    const signature = createHmac("sha256", cursorSecret()).update(`live-library:${accountId}:${payload}`).digest("base64url");
    return `${payload}.${signature}`;
}

function decodeCursor(accountId: string, cursor: string | null): CursorPayload | null {
    if (!cursor) return null;
    const [payload, signature] = cursor.split(".");
    if (!payload || !signature) throw new Error("Invalid cursor.");
    const expected = createHmac("sha256", cursorSecret()).update(`live-library:${accountId}:${payload}`).digest("base64url");
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) throw new Error("Invalid cursor.");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CursorPayload;
    if (!decoded.updatedAt || !decoded.contentId || !Number.isFinite(Date.parse(decoded.updatedAt))) throw new Error("Invalid cursor.");
    return decoded;
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return apiError("UNAUTHORIZED", "Sign in to read your library.", 401, requestId);
        const requestedLimit = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "100", 10);
        const limit = Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 200 ? requestedLimit : 100;
        let after: CursorPayload | null;
        try {
            after = decodeCursor(user.id, request.nextUrl.searchParams.get("cursor"));
        } catch {
            return apiError("VALIDATION_ERROR", "This library cursor is invalid. Start again.", 400, requestId);
        }
        const page = await getLiveLibraryPage(user.id, after, limit);
        const finalRow = page.rows.at(-1);
        return NextResponse.json({
            data: page.rows,
            pageInfo: {
                hasNextPage: page.hasNextPage,
                endCursor: finalRow ? encodeCursor(user.id, { updatedAt: finalRow.library_updated_at, contentId: finalRow.content_id }) : null,
            },
        }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        logApiError({ requestId, route: "GET /api/account-data/user_library", message: "Could not list the authenticated library", error });
        return apiError("INTERNAL_ERROR", "Could not read your library.", 503, requestId);
    }
}
