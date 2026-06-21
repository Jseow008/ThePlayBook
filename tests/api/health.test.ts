import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, resetHealthCheckCacheForTests } from "@/app/api/health/route";
import { createPublicServerClient } from "@/lib/supabase/public-server";

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: vi.fn(),
}));

describe("Health API", () => {
    const originalEnv = { ...process.env };
    const mockLimit = vi.fn();
    const mockSelect = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ select: mockSelect }));

    beforeEach(() => {
        vi.clearAllMocks();
        resetHealthCheckCacheForTests();
        process.env = {
            ...originalEnv,
            NODE_ENV: "production",
            NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
            SUPABASE_SERVICE_KEY: "service-key",
            NEXT_PUBLIC_SITE_URL: "https://netflux.example",
            NEXT_PUBLIC_APP_URL: "https://app.netflux.example",
            ANTHROPIC_API_KEY: "anthropic-key",
            GEMINI_API_KEY: "gemini-key",
            UPSTASH_REDIS_REST_URL: "https://upstash.example",
            UPSTASH_REDIS_REST_TOKEN: "upstash-token",
            NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
            HEALTH_CHECK_SECRET: "health-secret",
        };
        mockLimit.mockResolvedValue({ error: null });
        (createPublicServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: mockFrom,
        });
    });

    afterEach(() => {
        resetHealthCheckCacheForTests();
        process.env = { ...originalEnv };
    });

    function buildRequest(headers: HeadersInit = {}) {
        return new Request("https://app.netflux.example/api/health", {
            headers,
        });
    }

    function buildAuthorizedRequest(headers: HeadersInit = {}) {
        return buildRequest({
            authorization: "Bearer health-secret",
            ...headers,
        });
    }

    it("returns only coarse health status to anonymous callers", async () => {
        const response = await GET(buildRequest());
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json).toEqual({
            status: "ok",
            timestamp: expect.any(String),
        });
        expect(json.environment).toBeUndefined();
        expect(json.database).toBeUndefined();
        expect(json.readiness).toBeUndefined();
        expect(json.issues).toBeUndefined();
        expect(createPublicServerClient).not.toHaveBeenCalled();
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns detailed readiness when authorized with the health secret", async () => {
        const response = await GET(buildAuthorizedRequest());
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.status).toBe("ok");
        expect(json.database).toBe("reachable");
        expect(json.readiness).toEqual({
            supabase_public: "ready",
            supabase_admin: "ready",
            site_url: "ready",
            app_url: "ready",
            ai_generation: "ready",
            ai_retrieval: "ready",
            rate_limiting: "ready",
            error_reporting: "ready",
        });
        expect(json.issues).toEqual([]);
        expect(mockFrom).toHaveBeenCalledWith("content_item");
    });

    it("accepts x-health-check-secret for deployment monitoring", async () => {
        const response = await GET(buildRequest({
            "x-health-check-secret": "health-secret",
        }));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.status).toBe("ok");
        expect(json.database).toBe("reachable");
        expect(json.readiness.supabase_public).toBe("ready");
    });

    it("accepts a valid bearer secret even if an invalid health header is present", async () => {
        const response = await GET(buildAuthorizedRequest({
            "x-health-check-secret": "wrong-secret",
        }));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.database).toBe("reachable");
    });

    it("caches authorized database readiness checks briefly", async () => {
        const firstResponse = await GET(buildAuthorizedRequest());
        const secondResponse = await GET(buildAuthorizedRequest());

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(createPublicServerClient).toHaveBeenCalledTimes(1);
        expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it("collapses concurrent authorized database readiness checks into one query", async () => {
        let resolveDatabaseCheck!: (value: { error: null }) => void;
        mockLimit.mockReturnValueOnce(new Promise<{ error: null }>((resolve) => {
            resolveDatabaseCheck = resolve;
        }));

        const firstResponsePromise = GET(buildAuthorizedRequest());
        const secondResponsePromise = GET(buildAuthorizedRequest());

        await vi.waitFor(() => {
            expect(resolveDatabaseCheck).toBeTypeOf("function");
        });
        resolveDatabaseCheck({ error: null });

        const [firstResponse, secondResponse] = await Promise.all([
            firstResponsePromise,
            secondResponsePromise,
        ]);

        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(createPublicServerClient).toHaveBeenCalledTimes(1);
        expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it("fails authorized database readiness fast and aborts the query when the probe times out", async () => {
        vi.useFakeTimers();
        let capturedSignal!: AbortSignal;
        const abortSignal = vi.fn((signal: AbortSignal) => {
            capturedSignal = signal;
            return new Promise<{ error: null }>(() => undefined);
        });
        mockLimit.mockReturnValueOnce({ abortSignal });

        try {
            const responsePromise = GET(buildAuthorizedRequest());
            await vi.waitFor(() => {
                expect(abortSignal).toHaveBeenCalled();
            });
            await vi.advanceTimersByTimeAsync(2_500);

            const response = await responsePromise;
            const json = await response.json();

            expect(response.status).toBe(503);
            expect(json.database).toBe("unreachable");
            expect(json.issues).toContain("Database connectivity check timed out.");
            expect(capturedSignal.aborted).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("returns degraded when production readiness is incomplete", async () => {
        delete process.env.SUPABASE_SERVICE_KEY;
        delete process.env.GEMINI_API_KEY;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        delete process.env.NEXT_PUBLIC_SENTRY_DSN;
        mockLimit.mockResolvedValueOnce({ error: { message: "db-down" } });

        const response = await GET(buildAuthorizedRequest());
        const json = await response.json();

        expect(response.status).toBe(503);
        expect(json.status).toBe("degraded");
        expect(json.database).toBe("unreachable");
        expect(json.readiness.supabase_admin).toBe("missing");
        expect(json.readiness.ai_retrieval).toBe("missing");
        expect(json.readiness.rate_limiting).toBe("missing");
        expect(json.readiness.error_reporting).toBe("missing");
        expect(json.issues).toContain("Supabase admin client configuration is incomplete.");
        expect(json.issues).toContain("Ask My Library retrieval requires GEMINI_API_KEY.");
        expect(json.issues).toContain("Production rate limiting requires Upstash Redis configuration.");
        expect(json.issues).toContain("Production exception monitoring requires NEXT_PUBLIC_SENTRY_DSN.");
        expect(json.issues).toContain("Database connectivity check failed.");
    });

    it("hides detailed degraded readiness from anonymous callers", async () => {
        delete process.env.GEMINI_API_KEY;

        const response = await GET(buildRequest());
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json).toEqual({
            status: "ok",
            timestamp: expect.any(String),
        });
        expect(createPublicServerClient).not.toHaveBeenCalled();
    });

    it("does not crash when Supabase public env is missing", async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        const response = await GET(buildAuthorizedRequest());
        const json = await response.json();

        expect(response.status).toBe(503);
        expect(json.status).toBe("degraded");
        expect(json.database).toBe("unreachable");
        expect(json.readiness.supabase_public).toBe("missing");
        expect(json.issues).toContain("Supabase public client configuration is incomplete.");
        expect(json.issues).toContain("Database connectivity check skipped because Supabase public configuration is incomplete.");
        expect(createPublicServerClient).not.toHaveBeenCalled();
    });
});
