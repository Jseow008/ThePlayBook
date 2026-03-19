import { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitOptions {
    /** Max requests allowed in the window */
    limit: number;
    /** Window duration in milliseconds */
    windowMs: number;
    /** Optional extra key namespace (e.g. user id, action name) */
    key?: string;
    /** Optional explicit identifier override for the rate-limit bucket */
    identifier?: string;
}

interface RateLimitResult {
    success: boolean;
    /** Milliseconds until the client can retry (only set when success=false) */
    retryAfterMs?: number;
}

export class RateLimitBackendUnavailableError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = "RateLimitBackendUnavailableError";
        if (cause) {
            this.cause = cause;
        }
    }
}

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

function getRateLimitKey(req: NextRequest, options: RateLimitOptions): string {
    const identity = options.identifier ?? getClientIdentifier(req);
    return `${req.nextUrl.pathname}::${options.key ?? "global"}::${identity}`;
}

// Module-level fallback store
const store = new Map<string, number[]>();

function fallbackRateLimit(req: NextRequest, options: RateLimitOptions): RateLimitResult {
    const { limit, windowMs } = options;
    const rateKey = getRateLimitKey(req, options);
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (store.get(rateKey) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
        const retryAfterMs = timestamps[0] + windowMs - now;
        return { success: false, retryAfterMs };
    }

    timestamps.push(now);
    store.set(rateKey, timestamps);

    if (store.size > 10_000) {
        for (const [k, ts] of store.entries()) {
            if (ts.every((t) => t <= windowStart)) {
                store.delete(k);
            }
        }
    }

    return { success: true };
}

// Lazy load redis to avoid cold start issues
let redis: Redis | null = null;
const ratelimits = new Map<string, Ratelimit>(); // Cache for different limiters

function hasUpstashConfig() {
    return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function isProductionEnvironment() {
    return process.env.NODE_ENV === "production";
}

/**
 * Enterprise rate limiter using Upstash Redis.
 * Uses an in-memory sliding window only in non-production environments.
 */
export async function rateLimit(req: NextRequest, options: RateLimitOptions): Promise<RateLimitResult> {
    const { limit, windowMs } = options;
    const rateKey = getRateLimitKey(req, options);

    if (!hasUpstashConfig()) {
        if (isProductionEnvironment()) {
            throw new RateLimitBackendUnavailableError(
                "Upstash Redis must be configured for rate-limited routes in production."
            );
        }

        return fallbackRateLimit(req, options);
    }

    try {
        if (!redis) {
            redis = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });
        }

        const bucketKey = `${limit}:${windowMs}`;
        let limiter = ratelimits.get(bucketKey);

        if (!limiter) {
            limiter = new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
                analytics: true,
                prefix: "flux-ratelimit",
            });
            ratelimits.set(bucketKey, limiter);
        }

        const { success, reset } = await limiter.limit(rateKey);

        if (!success) {
            return {
                success,
                retryAfterMs: Math.max(0, reset - Date.now()),
            };
        }

        return { success: true };
    } catch (e) {
        if (isProductionEnvironment()) {
            throw new RateLimitBackendUnavailableError(
                "Upstash Redis is unavailable for a rate-limited route in production.",
                e
            );
        }

        console.warn("Failed to use Upstash rate limiter, falling back to in-memory", e);
        return fallbackRateLimit(req, options);
    }
}
