import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    bestEffortRateLimit,
    RateLimitBackendUnavailableError,
    rateLimit,
} from "../server/rate-limit";
import { NextRequest } from "next/server";

describe("rateLimit", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    function restoreEnv() {
        process.env.NODE_ENV = originalNodeEnv;

        if (originalRedisUrl === undefined) {
            delete process.env.UPSTASH_REDIS_REST_URL;
        } else {
            process.env.UPSTASH_REDIS_REST_URL = originalRedisUrl;
        }

        if (originalRedisToken === undefined) {
            delete process.env.UPSTASH_REDIS_REST_TOKEN;
        } else {
            process.env.UPSTASH_REDIS_REST_TOKEN = originalRedisToken;
        }
    }

    beforeEach(() => {
        vi.useFakeTimers();
        restoreEnv();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        restoreEnv();
    });

    function createMockRequest(ip: string, path: string = "/api/test") {
        return {
            headers: new Map([["x-forwarded-for", ip]]),
            nextUrl: { pathname: path }
        } as unknown as NextRequest;
    }

    function createMockRequestWithHeaders(headers: Array<[string, string]>, path: string = "/api/test") {
        return {
            headers: new Map(headers),
            nextUrl: { pathname: path },
        } as unknown as NextRequest;
    }

    it("allows requests under the limit", async () => {
        const req = createMockRequest("1.1.1.1");
        const options = { limit: 2, windowMs: 1000 };

        expect((await rateLimit(req, options)).success).toBe(true);
        expect((await rateLimit(req, options)).success).toBe(true);
    });

    it("blocks requests over the limit", async () => {
        const req = createMockRequest("2.2.2.2");
        const options = { limit: 2, windowMs: 1000 };

        await rateLimit(req, options);
        await rateLimit(req, options);

        const result = await rateLimit(req, options);
        expect(result.success).toBe(false);
        expect(result.retryAfterMs).toBeGreaterThan(0);
        expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
    });

    it("allows requests after the window expires", async () => {
        const req = createMockRequest("3.3.3.3");
        const options = { limit: 1, windowMs: 1000 };

        expect((await rateLimit(req, options)).success).toBe(true);
        expect((await rateLimit(req, options)).success).toBe(false);

        vi.advanceTimersByTime(1001);

        expect((await rateLimit(req, options)).success).toBe(true);
    });

    it("tracks different IPs separately", async () => {
        const req1 = createMockRequest("4.4.4.4");
        const req2 = createMockRequest("5.5.5.5");
        const options = { limit: 1, windowMs: 1000 };

        expect((await rateLimit(req1, options)).success).toBe(true);
        expect((await rateLimit(req1, options)).success).toBe(false);
        expect((await rateLimit(req2, options)).success).toBe(true);
    });

    it("falls back to anonymous when IP headers are invalid", async () => {
        const req = createMockRequestWithHeaders([["x-forwarded-for", "spoofed-value"]]);
        const options = { limit: 1, windowMs: 1000 };

        expect((await rateLimit(req, options)).success).toBe(true);
        expect((await rateLimit(req, options)).success).toBe(false);
    });

    it("supports namespaced keys for independent buckets", async () => {
        const req = createMockRequest("8.8.8.8");

        expect((await rateLimit(req, { limit: 1, windowMs: 1000, key: "chat" })).success).toBe(true);
        expect((await rateLimit(req, { limit: 1, windowMs: 1000, key: "chat" })).success).toBe(false);

        // Different key should be independent
        expect((await rateLimit(req, { limit: 1, windowMs: 1000, key: "highlights" })).success).toBe(true);
    });

    it("supports explicit identifiers that bypass shared IP bucketing", async () => {
        const req = createMockRequest("9.9.9.9");
        const options = { limit: 1, windowMs: 1000, key: "chat", identifier: "user-1" };

        expect((await rateLimit(req, options)).success).toBe(true);
        expect((await rateLimit(req, options)).success).toBe(false);
        expect((await rateLimit(req, { ...options, identifier: "user-2" })).success).toBe(true);
    });

    it("still uses IP bucketing for guests when no explicit identifier is provided", async () => {
        const req = createMockRequest("10.10.10.10");

        expect((await rateLimit(req, { limit: 1, windowMs: 1000, key: "author-chat:guest" })).success).toBe(true);
        expect((await rateLimit(req, { limit: 1, windowMs: 1000, key: "author-chat:guest" })).success).toBe(false);
    });

    it("throws in production when shared Redis rate limiting is not configured", async () => {
        process.env.NODE_ENV = "production";
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const req = createMockRequest("11.11.11.11");

        await expect(rateLimit(req, { limit: 1, windowMs: 1000 })).rejects.toBeInstanceOf(
            RateLimitBackendUnavailableError
        );
    });

    it("allows low-risk routes to degrade safely when the shared limiter is unavailable", async () => {
        process.env.NODE_ENV = "production";
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const req = createMockRequest("12.12.12.12", "/api/recommendations");

        await expect(bestEffortRateLimit(req, {
            limit: 1,
            windowMs: 1000,
            routeLabel: "/api/recommendations",
        })).resolves.toEqual({ success: true });

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining("/api/recommendations"),
            expect.any(RateLimitBackendUnavailableError)
        );
    });
});
