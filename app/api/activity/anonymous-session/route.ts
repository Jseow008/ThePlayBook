import { NextRequest, NextResponse } from "next/server";
import { createAnonymousActivitySession } from "@/lib/server/anonymous-activity-token";
import { rateLimit } from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
    const rl = await rateLimit(request, {
        limit: 12,
        windowMs: 60_000,
        key: "anonymous-activity-session",
    });

    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
            }
        );
    }

    const session = createAnonymousActivitySession();

    return NextResponse.json({
        visitor_id: session.visitorId,
        visitor_token: session.visitorToken,
        expires_at: session.expiresAt,
    });
}
