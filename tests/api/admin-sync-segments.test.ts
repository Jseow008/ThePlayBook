import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
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
        expect(json.command).toBe("npm run embeddings:sync-segments");
        expect(json.dry_run_command).toBe("npm run embeddings:sync-segments -- --dry-run");
    });

    it("requires admin access for POST", async () => {
        (verifyAdminSession as any).mockResolvedValueOnce(false);

        const req = new NextRequest(new URL("http://localhost/api/admin/embeddings/sync-segments"), {
            method: "POST",
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it("returns a local-run instruction on POST", async () => {
        const req = new NextRequest(new URL("http://localhost/api/admin/embeddings/sync-segments"), {
            method: "POST",
        });

        const res = await POST(req);
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
});
