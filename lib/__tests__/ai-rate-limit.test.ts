import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { aiNetworkIdentifier, aiRateLimit } from "@/lib/server/ai-rate-limit";

vi.mock("@/lib/server/security-telemetry", () => ({ recordSecuritySignal: vi.fn() }));

let sequence = 0;
function request(ip = "192.0.2.1", path = "/api/chat", extra: Record<string, string> = {}) {
    return new NextRequest(`https://example.test${path}`, { headers: { "x-vercel-forwarded-for": ip, ...extra } });
}
beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    sequence++;
});
afterEach(() => vi.unstubAllEnvs());

describe("AI ingress identity", () => {
    it("ignores forged forwarding headers on Vercel", () => {
        const original = aiNetworkIdentifier(request());
        expect(original).toMatch(/^[a-f0-9]{64}$/);
        expect(aiNetworkIdentifier(request("192.0.2.1", undefined, {
            "cf-connecting-ip": "198.51.100.1", "x-real-ip": "198.51.100.2",
            "x-forwarded-for": "198.51.100.3, 198.51.100.4",
        }))).toBe(original);
    });
    it.each(["", "999.0.0.1", "deadbeef", "192.0.2.1, 192.0.2.2", "192.0.2.1:80", "fe80::1%eth0", "192.0 .2.1"])("fails closed for invalid ingress %j", async (ip) => {
        expect(aiNetworkIdentifier(request(ip))).toBeNull();
        expect(await aiRateLimit(request(ip), "verified-user")).toEqual({ success: false, unavailable: true, retryAfterMs: 60_000 });
    });
    it("does not fall back when the trusted header is absent", () => {
        const req = request(); req.headers.delete("x-vercel-forwarded-for");
        req.headers.set("x-forwarded-for", "192.0.2.1");
        expect(aiNetworkIdentifier(req)).toBeNull();
    });
    it("normalizes equivalent IPv6 and IPv4-mapped addresses", () => {
        expect(aiNetworkIdentifier(request("2001:DB8:0:0:0:0:0:1"))).toBe(aiNetworkIdentifier(request("2001:db8::1")));
        expect(aiNetworkIdentifier(request("::ffff:c000:201"))).toBe(aiNetworkIdentifier(request("192.0.2.1")));
        expect(aiNetworkIdentifier(request("::ffff:192.0.2.1"))).toBe(aiNetworkIdentifier(request("192.0.2.1")));
    });
    it("refuses an unreviewed production ingress even with plausible headers", () => {
        vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "");
        expect(aiNetworkIdentifier(request())).toBeNull();
    });
    it("allows explicit local fixture addresses only outside production", () => {
        vi.stubEnv("VERCEL", "");
        expect(aiNetworkIdentifier(request("", undefined, { "x-forwarded-for": "192.0.2.1" }))).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe("shared AI burst policy using the real limiter", () => {
    it.each(["/api/chat", "/api/chat/notes", "/api/chat/author"])("limits the same account despite changing IP on %s", async (path) => {
        const account = `account-${sequence}`;
        for (let i = 1; i <= 10; i++) expect((await aiRateLimit(request(`198.51.${sequence}.${i}`, path), account)).success).toBe(true);
        const blocked = await aiRateLimit(request(`198.51.${sequence}.11`, path), account);
        expect(blocked.success).toBe(false); expect(blocked.retryAfterMs).toBeGreaterThan(0);
        expect((await aiRateLimit(request(`198.51.${sequence}.11`, path), `${account}-other`)).success).toBe(true);
    });
    it("keeps existing account limits per route", async () => {
        for (const path of ["/api/chat", "/api/chat/notes", "/api/chat/author"]) {
            for (let i = 0; i < 10; i++) expect((await aiRateLimit(request(`203.0.113.${sequence}`, path), `routes-${sequence}`)).success).toBe(true);
            expect((await aiRateLimit(request(`203.0.113.${sequence}`, path), `routes-${sequence}`)).success).toBe(false);
        }
    });
    it("shares network abuse counts across routes and accounts", async () => {
        const paths = ["/api/chat", "/api/chat/notes", "/api/chat/author"];
        const results = await Promise.all(Array.from({ length: 61 }, (_, i) => aiRateLimit(request(`192.0.2.${sequence}`, paths[i % 3]), `rotating-${sequence}-${i}`)));
        expect(results.filter(result => result.success)).toHaveLength(60);
        expect(results[60].success).toBe(false);
    });
    it("keeps the guest limit under forged headers and separates authenticated accounts", async () => {
        for (let i = 0; i < 3; i++) expect((await aiRateLimit(request(`192.0.2.${sequence}`, "/api/chat/author", { "cf-connecting-ip": `10.0.0.${i}` }))).success).toBe(true);
        const req = request(`192.0.2.${sequence}`, "/api/chat/author", { "x-forwarded-for": "203.0.113.99" });
        expect((await aiRateLimit(req)).success).toBe(false);
        expect((await aiRateLimit(req, `signed-in-${sequence}`)).success).toBe(true);
    });
    it("returns retryable unavailability without Redis in production", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await aiRateLimit(request(), "verified-user")).toEqual({ success: false, unavailable: true, retryAfterMs: 60_000 });
        log.mockRestore();
    });
});
