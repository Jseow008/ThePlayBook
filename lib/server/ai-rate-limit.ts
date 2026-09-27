import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";

/** Canonicalize one address; reject lists, ports, zone IDs, and malformed values. */
function normalizeIp(value: string | null): string | null {
    if (!value || value.length > 45 || value.includes("%")) return null;
    const version = isIP(value);
    if (version === 4) return value;
    if (version !== 6) return null;
    const canonical = new URL(`http://[${value}]`).hostname.slice(1, -1);
    const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(canonical);
    if (!mapped) return canonical;
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

/** Vercel overwrites this header at ingress. Never trust arbitrary forwarding headers. */
export function aiNetworkIdentifier(request: NextRequest): string | null {
    const hosted = process.env.VERCEL === "1";
    // A production server on another host needs a reviewed ingress contract first.
    if (!hosted && process.env.NODE_ENV === "production") return null;
    const ip = normalizeIp(request.headers.get(hosted ? "x-vercel-forwarded-for" : "x-forwarded-for"));
    if (!ip) return hosted || process.env.NODE_ENV === "production" ? null : "local-unknown";
    // Pseudonymous bucket identifier, not a claim that IP hashes are anonymous.
    return createHash("sha256").update(ip).digest("hex");
}

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
