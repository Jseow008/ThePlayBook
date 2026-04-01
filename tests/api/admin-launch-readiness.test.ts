import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/launch-readiness/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    bestEffortRateLimit: vi.fn(),
}));

describe("Admin launch readiness API", () => {
    const originalEnv = { ...process.env };

    const buildAdminClient = (params: { audioBucketPresent?: boolean; audioBucketPublic?: boolean } = {}) => {
        const {
            audioBucketPresent = true,
            audioBucketPublic = true,
        } = params;

        return {
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                is: vi.fn().mockResolvedValue({
                                    data: [
                                        { id: "verified-ready", status: "verified", embedding: "[1,2,3]" },
                                        { id: "verified-stale", status: "verified", embedding: "[4,5,6]" },
                                    ],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                if (table === "segment") {
                    return {
                        select: vi.fn().mockReturnValue({
                            is: vi.fn().mockReturnValue({
                                in: vi.fn().mockResolvedValue({
                                    data: [
                                        { id: "segment-1", item_id: "verified-ready", markdown_body: "Ready segment" },
                                        { id: "segment-2", item_id: "verified-stale", markdown_body: "Needs embedding" },
                                    ],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                if (table === "segment_embedding_gemini") {
                    return {
                        select: vi.fn().mockReturnValue({
                            in: vi.fn().mockResolvedValue({
                                data: [
                                    { content_item_id: "verified-ready", segment_id: "segment-1" },
                                    { content_item_id: "verified-stale", segment_id: "segment-2" },
                                ],
                                error: null,
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn((fn: string) => {
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
            NEXT_PUBLIC_SITE_URL: "https://flux.example",
            NEXT_PUBLIC_APP_URL: "https://app.flux.example",
            ANTHROPIC_API_KEY: "anthropic-key",
            GEMINI_API_KEY: "gemini-key",
            UPSTASH_REDIS_REST_URL: "https://upstash.example",
            UPSTASH_REDIS_REST_TOKEN: "upstash-token",
            ERROR_REPORTING_WEBHOOK_URL: "https://monitoring.example/ingest",
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
