import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
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
        process.env = {
            ...originalEnv,
            NODE_ENV: "production",
            NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
            NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
            SUPABASE_SERVICE_KEY: "service-key",
            NEXT_PUBLIC_SITE_URL: "https://flux.example",
            NEXT_PUBLIC_APP_URL: "https://app.flux.example",
            ANTHROPIC_API_KEY: "anthropic-key",
            GEMINI_API_KEY: "gemini-key",
            UPSTASH_REDIS_REST_URL: "https://upstash.example",
            UPSTASH_REDIS_REST_TOKEN: "upstash-token",
            ERROR_REPORTING_WEBHOOK_URL: "https://monitoring.example/ingest",
        };
        mockLimit.mockResolvedValue({ error: null });
        (createPublicServerClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: mockFrom,
});
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("returns ok when database and critical runtime dependencies are ready", async () => {
        const response = await GET();
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

    it("returns degraded when production readiness is incomplete", async () => {
        delete process.env.SUPABASE_SERVICE_KEY;
        delete process.env.GEMINI_API_KEY;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        delete process.env.ERROR_REPORTING_WEBHOOK_URL;
        mockLimit.mockResolvedValueOnce({ error: { message: "db-down" } });

        const response = await GET();
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
        expect(json.issues).toContain("Production exception monitoring requires ERROR_REPORTING_WEBHOOK_URL.");
        expect(json.issues).toContain("Database connectivity check failed.");
    });

    it("does not crash when Supabase public env is missing", async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        const response = await GET();
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
