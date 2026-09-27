import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
    static slidingWindow = vi.fn(); limit = limit;
} }));
vi.mock("@/lib/server/security-telemetry", () => ({ recordSecuritySignal: vi.fn() }));
import { aiRateLimit } from "@/lib/server/ai-rate-limit";
import { rateLimitFailureResponse } from "@/lib/server/rate-limit";
const request = new NextRequest("https://example.test/api/chat", { headers: { "x-vercel-forwarded-for": "192.0.2.1" } });
beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    limit.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
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
