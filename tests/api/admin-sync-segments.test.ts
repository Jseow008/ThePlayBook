import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { GET, POST } from "@/app/api/admin/embeddings/sync-segments/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

describe("Admin segment embedding sync API", () => {
    const rpcMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();

        (verifyAdminSession as any).mockResolvedValue(true);
        (getAdminClient as any).mockReturnValue({
            rpc: rpcMock,
            from: vi.fn(),
        });
    });

    it("requires admin access for GET coverage", async () => {
        (verifyAdminSession as any).mockResolvedValueOnce(false);

        const res = await GET();
        expect(res.status).toBe(401);
    });

    it("returns Gemini retrieval coverage on GET", async () => {
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_gemini_segment_embedding_coverage") {
                return Promise.resolve({
                    data: [{
                        total_library_content_items: 53,
                        embedded_content_items: 40,
                        missing_segments: 12,
                        estimated_remaining_characters: 4_200,
                    }],
                    error: null,
                });
            }

            if (fn === "get_admin_ai_readiness_summary") {
                return Promise.resolve({
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
            }

            throw new Error(`Unexpected rpc: ${fn}`);
        });

        const res = await GET();
        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.summary).toEqual({
            total_library_content_items: 53,
            embedded_content_items: 40,
            missing_segments: 12,
            estimated_remaining_characters: 4_200,
        });
        expect(json.ai_readiness).toEqual({
            verified_items: 496,
            ai_ready_items: 126,
            ai_stale_items: 370,
            stale_content_embeddings: 99,
            stale_segment_embeddings: 369,
            items_without_published_segments: 0,
        });
        expect(json.command).toBe("npm run embeddings:sync-segments");
        expect(json.dry_run_command).toBe("npm run embeddings:sync-segments -- --dry-run");
        expect(json.workflow.content_embedding_sync.path).toBe("/api/admin/embeddings/sync");
        expect(json.workflow.segment_embedding_sync.command).toBe("npm run embeddings:sync-segments");
        expect(rpcMock).toHaveBeenCalledWith("get_admin_ai_readiness_summary");
        expect((getAdminClient as any).mock.results[0].value.from).not.toHaveBeenCalled();
    });

    it("requires admin access for POST", async () => {
        (verifyAdminSession as any).mockResolvedValueOnce(false);

        const res = await POST();
        expect(res.status).toBe(401);
    });

    it("returns a local-run instruction on POST", async () => {
        const res = await POST();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET");

        const json = await res.json();
        expect(json.error.code).toBe("METHOD_NOT_ALLOWED");
        expect(json.error.message).toContain("runs locally");
        expect(json.command).toBe("npm run embeddings:sync-segments");
    });

    it("keeps soft-deleted and blank segments out of the coverage migration", () => {
        const migration = readFileSync(
            join(process.cwd(), "supabase/migrations/20260315154753_update_gemini_segment_sync_guards.sql"),
            "utf8"
        );

        expect(migration).toContain("s.deleted_at IS NULL");
        expect(migration).toContain("NULLIF(BTRIM(s.markdown_body), '') IS NOT NULL");
    });

    it("preserves Gemini segment embeddings when admin saves unchanged segment bodies", () => {
        const migration = readFileSync(
            join(process.cwd(), "supabase/migrations/20260425090000_preserve_gemini_segment_embeddings_on_admin_save.sql"),
            "utf8"
        );

        expect(migration).toContain("CREATE TEMP TABLE preserved_gemini_segment_embeddings");
        expect(migration).toContain("FROM public.segment_embedding_gemini seg");
        expect(migration).toContain("DELETE FROM public.segment WHERE item_id = p_content_id");
        expect(migration).toContain("INSERT INTO public.segment_embedding_gemini");
        expect(migration).toContain("ci.status = 'verified'");
        expect(migration).toContain("BTRIM(s.markdown_body) IS NOT DISTINCT FROM preserved.markdown_body");
        expect(migration).toContain("ON CONFLICT (segment_id) DO UPDATE");
    });
});
