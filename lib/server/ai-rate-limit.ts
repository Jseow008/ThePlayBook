import "server-only";
import type { NextRequest } from "next/server";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";
import { trustedNetworkIdentifier as aiNetworkIdentifier } from "@/lib/server/rate-limit-identity";

export { aiNetworkIdentifier };

/** All interactive AI routes use one identity policy before quota/provider work. */
export async function aiRateLimit(request: NextRequest, verifiedUserId?: string) {
    const identifier = aiNetworkIdentifier(request);
    if (!identifier) return { success: false, unavailable: true, retryAfterMs: 60_000 };

    // Shared network protection limits account rotation and guest abuse. A rejected
    // request still consumes this attempt; this is not provider usage accounting.
    const network = await strictPublicRateLimit(request, {
        limit: 60, windowMs: 60_000, scope: "ai", key: "network:v1",
        identifier, routeLabel: request.nextUrl.pathname,
    });
    if (!network.success) return network;

    return strictPublicRateLimit(request, verifiedUserId ? {
        limit: 10, windowMs: 60_000, key: "account:v1", identifier: verifiedUserId,
        routeLabel: request.nextUrl.pathname,
    } : {
        limit: 3, windowMs: 600_000, key: "guest:v1", identifier,
        routeLabel: request.nextUrl.pathname,
    });
}
