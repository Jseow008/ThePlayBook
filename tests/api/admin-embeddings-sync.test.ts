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
        const rpc = vi.fn().mockResolvedValue({
            data: [{
                verified_items: 496,
                ai_ready_items: 126,
                ai_stale_items: 370,
                stale_content_embeddings: 99,
                stale_segment_embeddings: 369,
                items_without_published_segments: 0,
            }],
            error: null,
        });
        const from = vi.fn();
        (getAdminClient as any).mockReturnValue({ rpc, from });

        const res = await GET();
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.summary).toEqual({
            verified_items: 496,
            content_embedding_ready_items: 397,
            missing_content_embeddings: 99,
        });
        expect(json.ai_readiness).toEqual({
            verified_items: 496,
            ai_ready_items: 126,
            ai_stale_items: 370,
            stale_content_embeddings: 99,
            stale_segment_embeddings: 369,
            items_without_published_segments: 0,
        });
        expect(json.sync_action).toEqual({
            method: "POST",
            path: "/api/admin/embeddings/sync",
        });
        expect(json.workflow.content_embedding_sync.path).toBe("/api/admin/embeddings/sync");
        expect(json.workflow.segment_embedding_sync.command).toBe("npm run embeddings:sync-segments");
        expect(rpc).toHaveBeenCalledExactlyOnceWith("get_admin_ai_readiness_summary");
        expect(from).not.toHaveBeenCalled();
    });
});
