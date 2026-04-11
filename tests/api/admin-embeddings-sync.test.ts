import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/admin/embeddings/sync/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

describe("Admin content embedding sync readiness API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (verifyAdminSession as any).mockResolvedValue(true);
    });

    it("requires admin access for GET readiness", async () => {
        (verifyAdminSession as any).mockResolvedValueOnce(false);

        const res = await GET();
        expect(res.status).toBe(401);
    });

    it("returns content embedding readiness and operator workflow", async () => {
        (getAdminClient as any).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                is: vi.fn().mockResolvedValue({
                                    data: [
                                        { id: "verified-ready", status: "verified", embedding: "[1,2,3]" },
                                        { id: "verified-stale", status: "verified", embedding: null },
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
                                in: vi.fn().mockReturnValue({
                                    range: vi.fn().mockResolvedValue({
                                        data: [
                                            { id: "segment-1", item_id: "verified-ready", markdown_body: "Ready segment" },
                                            { id: "segment-2", item_id: "verified-stale", markdown_body: "Needs embedding" },
                                        ],
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }

                if (table === "segment_embedding_gemini") {
                    return {
                        select: vi.fn().mockReturnValue({
                            in: vi.fn().mockReturnValue({
                                range: vi.fn().mockResolvedValue({
                                    data: [{ content_item_id: "verified-ready", segment_id: "segment-1" }],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const res = await GET();
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.summary).toEqual({
            verified_items: 2,
            content_embedding_ready_items: 1,
            missing_content_embeddings: 1,
        });
        expect(json.ai_readiness).toEqual({
            verified_items: 2,
            ai_ready_items: 1,
            ai_stale_items: 1,
            stale_content_embeddings: 1,
            stale_segment_embeddings: 1,
            items_without_published_segments: 0,
        });
        expect(json.sync_action).toEqual({
            method: "POST",
            path: "/api/admin/embeddings/sync",
        });
        expect(json.workflow.content_embedding_sync.path).toBe("/api/admin/embeddings/sync");
        expect(json.workflow.segment_embedding_sync.command).toBe("npm run embeddings:sync-segments");
    });
});
