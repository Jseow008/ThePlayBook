import { NextRequest } from "next/server";

interface RateLimitOptions {
    /** Max requests allowed in the window */
    limit: number;
    /** Window duration in milliseconds */
    windowMs: number;
    /** Optional extra key namespace (e.g. user id, action name) */
    key?: string;
}

interface RateLimitResult {
    success: boolean;
    /** Milliseconds until the client can retry (only set when success=false) */
    retryAfterMs?: number;
}

// Module-level store: Map<ip, timestamps[]>
// Works correctly on single-instance deployments (Vercel Fluid Compute / serverless).
const store = new Map<string, number[]>();

const IP_V4_REGEX = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IP_V6_REGEX = /^[a-fA-F0-9:]+$/;

function isValidIp(value: string): boolean {
    if (!value || value.length > 64) return false;
    return IP_V4_REGEX.test(value) || IP_V6_REGEX.test(value);
}

function getClientIdentifier(req: NextRequest): string {
    const candidates = [
        req.headers.get("cf-connecting-ip"),
        req.headers.get("x-real-ip"),
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    ];

    for (const candidate of candidates) {
        if (candidate && isValidIp(candidate)) {
            return candidate;
        }
    }

    return "anonymous";
}

/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Usage:
 *   const result = rateLimit(req, { limit: 10, windowMs: 60_000 });
 *   if (!result.success) {
 *       return NextResponse.json({ error: "Too Many Requests" }, {
 *           status: 429,
 *           headers: { "Retry-After": String(Math.ceil((result.retryAfterMs ?? 60_000) / 1000)) },
 *       });
 *   }
 */
export function rateLimit(req: NextRequest, options: RateLimitOptions): RateLimitResult {
    const { limit, windowMs, key } = options;
    const clientId = getClientIdentifier(req);

    const rateKey = `${req.nextUrl.pathname}::${key ?? "global"}::${clientId}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get existing timestamps for this key, pruning expired ones
    const timestamps = (store.get(rateKey) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
        // Oldest timestamp + windowMs = when the earliest slot frees up
        const retryAfterMs = timestamps[0] + windowMs - now;
        return { success: false, retryAfterMs };
    }

    // Record this request
    timestamps.push(now);
    store.set(rateKey, timestamps);

    // Periodically clean up old keys to prevent memory leaks
    if (store.size > 10_000) {
        for (const [k, ts] of store.entries()) {
            if (ts.every((t) => t <= windowStart)) {
                store.delete(k);
            }
        }
    }

    return { success: true };
}
