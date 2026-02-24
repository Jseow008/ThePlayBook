import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "../server/rate-limit";
import { NextRequest } from "next/server";

describe("rateLimit", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
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

    it("allows requests under the limit", () => {
        const req = createMockRequest("1.1.1.1");
        const options = { limit: 2, windowMs: 1000 };

        expect(rateLimit(req, options).success).toBe(true);
        expect(rateLimit(req, options).success).toBe(true);
    });

    it("blocks requests over the limit", () => {
        const req = createMockRequest("2.2.2.2");
        const options = { limit: 2, windowMs: 1000 };

        rateLimit(req, options);
        rateLimit(req, options);

        const result = rateLimit(req, options);
        expect(result.success).toBe(false);
        expect(result.retryAfterMs).toBeGreaterThan(0);
        expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
    });

    it("allows requests after the window expires", () => {
        const req = createMockRequest("3.3.3.3");
        const options = { limit: 1, windowMs: 1000 };

        expect(rateLimit(req, options).success).toBe(true);
        expect(rateLimit(req, options).success).toBe(false);

        vi.advanceTimersByTime(1001);

        expect(rateLimit(req, options).success).toBe(true);
    });

    it("tracks different IPs separately", () => {
        const req1 = createMockRequest("4.4.4.4");
        const req2 = createMockRequest("5.5.5.5");
        const options = { limit: 1, windowMs: 1000 };

        expect(rateLimit(req1, options).success).toBe(true);
        expect(rateLimit(req1, options).success).toBe(false);
        expect(rateLimit(req2, options).success).toBe(true);
    });

    it("falls back to anonymous when IP headers are invalid", () => {
        const req = createMockRequestWithHeaders([["x-forwarded-for", "spoofed-value"]]);
        const options = { limit: 1, windowMs: 1000 };

        expect(rateLimit(req, options).success).toBe(true);
        expect(rateLimit(req, options).success).toBe(false);
    });

    it("supports namespaced keys for independent buckets", () => {
        const req = createMockRequest("8.8.8.8");

        expect(rateLimit(req, { limit: 1, windowMs: 1000, key: "chat" }).success).toBe(true);
        expect(rateLimit(req, { limit: 1, windowMs: 1000, key: "chat" }).success).toBe(false);

        // Different key should be independent
        expect(rateLimit(req, { limit: 1, windowMs: 1000, key: "highlights" }).success).toBe(true);
    });
});
