import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
    static slidingWindow = vi.fn(); limit = limit;
} }));
vi.mock("@/lib/server/security-telemetry", () => ({ recordSecuritySignal: vi.fn() }));
import { aiRateLimit } from "@/lib/server/ai-rate-limit";
import { rateLimit, rateLimitFailureResponse } from "@/lib/server/rate-limit";
import { POST as subscribe } from "@/app/api/email-subscriptions/route";
const request = new NextRequest("https://example.test/api/chat", { headers: { "x-vercel-forwarded-for": "192.0.2.1" } });
beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    limit.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("keeps the subscription endpoint rate-limited when a caller changes CF-Connecting-IP", async () => {
    const attempts = new Map<string, number>();
    limit.mockImplementation(async (key: string) => {
        const count = (attempts.get(key) ?? 0) + 1;
        attempts.set(key, count);
        return { success: count <= 8, reset: Date.now() + 60_000 };
    });
    const submit = (cfIp: string, trustedIp = "192.0.2.1") => subscribe(new NextRequest(
        "https://example.test/api/email-subscriptions", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-vercel-forwarded-for": trustedIp,
                "x-real-ip": "192.0.2.1",
                "x-forwarded-for": "192.0.2.1",
                "cf-connecting-ip": cfIp,
            },
            body: "{",
        }
    ));

    for (let i = 0; i < 8; i++) {
        const response = await submit("198.51.100.1");
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "INVALID_JSON" } });
    }
    expect((await submit("198.51.100.1")).status).toBe(429);
    const rotated = await submit("198.51.100.2");
    expect(rotated.status).toBe(429);
    expect(await rotated.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect((await submit("198.51.100.2", "192.0.2.2")).status).toBe(400);
    expect([...attempts.keys()]).toHaveLength(2);
});

it("uses one bounded bucket when trusted ingress is absent or invalid", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    const options = { limit: 1, windowMs: 60_000 };
    const first = new NextRequest("https://example.test/api/test", {
        headers: { "cf-connecting-ip": "198.51.100.1", "x-forwarded-for": "192.0.2.1" },
    });
    const second = new NextRequest(first.url, {
        headers: {
            "x-vercel-forwarded-for": "192.0.2.1, 192.0.2.2",
            "x-real-ip": "192.0.2.2",
            "cf-connecting-ip": "198.51.100.2",
        },
    });
    await rateLimit(first, options);
    await rateLimit(second, options);
    expect(limit.mock.calls.map(([key]) => key)).toEqual([
        "/api/test::global::anonymous",
        "/api/test::global::anonymous",
    ]);
});

it("preserves explicit account keys regardless of network headers", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    const options = { limit: 30, windowMs: 60_000, key: "account" };
    const changedNetwork = new NextRequest(request.url, {
        headers: { "x-vercel-forwarded-for": "192.0.2.2", "cf-connecting-ip": "198.51.100.2" },
    });
    await rateLimit(request, { ...options, identifier: "account-a" });
    await rateLimit(changedNetwork, { ...options, identifier: "account-a" });
    await rateLimit(changedNetwork, { ...options, identifier: "account-b" });
    expect(limit.mock.calls.map(([key]) => key)).toEqual([
        "/api/chat::account::account-a",
        "/api/chat::account::account-a",
        "/api/chat::account::account-b",
    ]);
});

it("rejects Upstash's successful timeout rather than admitting provider work", async () => {
    limit.mockResolvedValue({ success: true, reason: "timeout", reset: Date.now() + 1000 });
    const result = await aiRateLimit(request, "account-a");
    expect(result).toEqual({ success: false, unavailable: true, retryAfterMs: 60_000 });
    expect(limit).toHaveBeenCalledTimes(1);
    const response = rateLimitFailureResponse(result);
    expect(response.status).toBe(503); expect(response.headers.get("retry-after")).toBe("60");
});
it("uses separate shared network and account-only Redis keys", async () => {
    limit.mockResolvedValue({ success: true, reset: Date.now() + 1000 });
    expect((await aiRateLimit(request, "account-a")).success).toBe(true);
    expect(limit.mock.calls[0][0]).toMatch(/^ai::network:v1::[a-f0-9]{64}$/);
    expect(limit.mock.calls[1][0]).toBe("/api/chat::account:v1::account-a");
});
it("fails closed if account counting fails after network admission", async () => {
    limit.mockResolvedValueOnce({ success: true, reset: Date.now() + 1000 }).mockRejectedValueOnce(new Error("unavailable"));
    expect((await aiRateLimit(request, "account-a"))).toMatchObject({ success: false, unavailable: true });
});
it("never suggests a zero-second retry", () => {
    expect(rateLimitFailureResponse({ success: false, retryAfterMs: 0 }).headers.get("retry-after")).toBe("1");
});
