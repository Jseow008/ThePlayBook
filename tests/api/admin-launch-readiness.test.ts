import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/launch-readiness/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";
import { logApiError } from "@/lib/server/api";

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    bestEffortRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/server/api")>();
    return {
        ...actual,
        logApiError: vi.fn(),
    };
});

describe("Admin launch readiness API", () => {
    const originalEnv = { ...process.env };

    const buildAdminClient = (params: {
        aiReadinessError?: unknown;
        aiReadinessSummary?: {
            verified_items: number;
            ai_ready_items: number;
            ai_stale_items: number;
            stale_content_embeddings: number;
            stale_segment_embeddings: number;
            items_without_published_segments: number;
        };
        audioBucketPresent?: boolean;
        audioBucketPublic?: boolean;
    } = {}) => {
        const {
            aiReadinessError = null,
            aiReadinessSummary = {
                verified_items: 2,
                ai_ready_items: 2,
                ai_stale_items: 0,
                stale_content_embeddings: 0,
                stale_segment_embeddings: 0,
                items_without_published_segments: 0,
            },
            audioBucketPresent = true,
            audioBucketPublic = true,
        } = params;

        return {
            from: vi.fn((table: string) => {
                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn((fn: string) => {
                if (fn === "get_admin_ai_readiness_summary") {
                    return Promise.resolve({
                        data: aiReadinessError ? null : [aiReadinessSummary],
                        error: aiReadinessError,
                    });
                }

                if (fn === "get_gemini_segment_embedding_coverage") {
                    return Promise.resolve({
                        data: [{
                            total_library_content_items: 2,
                            embedded_content_items: 2,
                            missing_segments: 0,
                            estimated_remaining_characters: 0,
                        }],
                        error: null,
                    });
                }

                throw new Error(`Unexpected rpc ${fn}`);
            }),
            storage: {
                listBuckets: vi.fn().mockResolvedValue({
                    data: [
                        { name: "media", public: true },
                        ...(audioBucketPresent ? [{ name: "audio", public: audioBucketPublic }] : []),
                    ],
                    error: null,
                }),
            },
        };
    };

    beforeEach(() => {
        vi.clearAllMocks();
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
        };
        (verifyAdminSession as any).mockResolvedValue(true);
        (bestEffortRateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("requires admin access", async () => {
        (verifyAdminSession as any).mockResolvedValueOnce(false);

        const response = await GET(new NextRequest("http://localhost/api/admin/launch-readiness"));
        expect(response.status).toBe(401);
    });

    it("returns 429 when rate limited", async () => {
        (bestEffortRateLimit as any).mockResolvedValueOnce({ success: false, retryAfterMs: 1500 });

        const response = await GET(new NextRequest("http://localhost/api/admin/launch-readiness"));
        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBe("2");
    });

    it("returns ready launch readiness when runtime, AI, segment, and storage checks pass", async () => {
        (getAdminClient as any).mockReturnValue(buildAdminClient());

        const response = await GET(new NextRequest("http://localhost/api/admin/launch-readiness"));
        expect(response.status).toBe(200);

        const json = await response.json();
        expect(json.status).toBe("ready");
        expect(json.runtime.status).toBe("ready");
        expect(json.database.status).toBe("ready");
        expect(json.database.ai_readiness.status).toBe("ready");
        expect(json.database.ai_readiness.summary).toEqual({
            verified_items: 2,
            ai_ready_items: 2,
            ai_stale_items: 0,
            stale_content_embeddings: 0,
            stale_segment_embeddings: 0,
            items_without_published_segments: 0,
        });
        expect(json.database.segment_coverage.status).toBe("ready");
        expect(json.database.segment_coverage.summary).toEqual({
            total_library_content_items: 2,
            embedded_content_items: 2,
            missing_segments: 0,
            estimated_remaining_characters: 0,
        });
        expect(json.database.storage.status).toBe("ready");
        expect(json.database.storage.buckets.media).toEqual({
            present: true,
            public: true,
            status: "ready",
        });
        expect(json.database.storage.buckets.audio).toEqual({
            present: true,
            public: true,
            status: "ready",
        });
        expect(json.issues).toEqual([]);
    });

    it("returns degraded AI readiness from the summary RPC", async () => {
        const client = buildAdminClient({
            aiReadinessSummary: {
                verified_items: 3,
                ai_ready_items: 1,
                ai_stale_items: 2,
                stale_content_embeddings: 1,
                stale_segment_embeddings: 2,
                items_without_published_segments: 1,
            },
        });
        (getAdminClient as any).mockReturnValue(client);

        const response = await GET(new NextRequest("http://localhost/api/admin/launch-readiness"));
        expect(response.status).toBe(503);

        const json = await response.json();
        expect(client.rpc).toHaveBeenCalledWith("get_admin_ai_readiness_summary");
        expect(json.database.ai_readiness.status).toBe("degraded");
        expect(json.database.ai_readiness.summary).toEqual({
            verified_items: 3,
            ai_ready_items: 1,
            ai_stale_items: 2,
            stale_content_embeddings: 1,
            stale_segment_embeddings: 2,
            items_without_published_segments: 1,
        });
        expect(json.database.ai_readiness.issues).toContain("1 verified content item(s) are missing content embeddings.");
        expect(json.database.ai_readiness.issues).toContain("2 verified content item(s) are missing segment embeddings.");
        expect(json.database.ai_readiness.issues).toContain("1 verified content item(s) have no published segments.");
    });

    it("degrades gracefully when the AI readiness summary RPC fails", async () => {
        const client = buildAdminClient({
            aiReadinessError: { message: "permission denied for function get_admin_ai_readiness_summary" },
        });
        (getAdminClient as any).mockReturnValue(client);

        const response = await GET(new NextRequest("http://localhost/api/admin/launch-readiness"));
        expect(response.status).toBe(503);

        const json = await response.json();
        expect(client.rpc).toHaveBeenCalledWith("get_admin_ai_readiness_summary");
        expect(json.database.ai_readiness.status).toBe("degraded");
        expect(json.database.ai_readiness.summary).toBeNull();
        expect(json.database.ai_readiness.issues).toContain("Failed to load AI readiness details.");
        expect(json.issues).toContain("Failed to load AI readiness details.");
        expect(logApiError).toHaveBeenCalledWith(expect.objectContaining({
            route: "/api/admin/launch-readiness",
            message: "Failed to load AI readiness details",
            error: { message: "permission denied for function get_admin_ai_readiness_summary" },
        }));
    });

    it("returns degraded readiness when the audio bucket is missing", async () => {
        (getAdminClient as any).mockReturnValue(buildAdminClient({ audioBucketPresent: false }));

        const response = await GET(new NextRequest("http://localhost/api/admin/launch-readiness"));
        expect(response.status).toBe(503);

        const json = await response.json();
        expect(json.status).toBe("degraded");
        expect(json.database.status).toBe("degraded");
        expect(json.database.storage.status).toBe("degraded");
        expect(json.database.storage.buckets.audio).toEqual({
            present: false,
            public: null,
            status: "degraded",
        });
        expect(json.database.storage.issues).toContain('Supabase storage bucket "audio" is missing.');
        expect(json.issues).toContain('Supabase storage bucket "audio" is missing.');
    });
});
