import { NextRequest, NextResponse } from "next/server";
import { processPersonalEvidenceIndex } from "@/lib/server/personal-evidence-indexer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
        return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, { status: 401 });
    }
    try {
        const result = await processPersonalEvidenceIndex({ signal: request.signal });
        const unavailable = result.deferred > 0 || result.failed > 0;
        return NextResponse.json({ success: !unavailable, data: result }, {
            status: unavailable ? 503 : 200,
            headers: { "Cache-Control": "no-store", ...(result.retryAfterSeconds ? { "Retry-After": String(result.retryAfterSeconds) } : {}) },
        });
    } catch {
        // Do not log provider errors: their payloads can contain personal source text.
        return NextResponse.json({ error: { code: "INDEX_UNAVAILABLE", message: "Personal index processing failed" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}
