import { POST } from "@/app/api/admin/embeddings/sync-segments/route";
import { NextRequest } from "next/server";
import { vi } from "vitest";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/server/rate-limit";

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

const embedContentMock = vi.fn();

vi.mock("@google/genai", () => ({
    GoogleGenAI: class {
        models = {
            embedContent: embedContentMock,
        };
    },
}));

describe("Admin segment embedding sync API", () => {
    const rpcMock = vi.fn();
    const insertMock = vi.fn();
    const fromMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GEMINI_API_KEY = "gemini-test-key";

        (verifyAdminSession as any).mockResolvedValue(true);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        rpcMock.mockResolvedValue({
            data: [
                {
                    id: "123e4567-e89b-12d3-a456-426614174000",
                    content_item_id: "223e4567-e89b-12d3-a456-426614174000",
                    markdown_body: "A segment that needs embeddings",
                },
            ],
            error: null,
        });
        rpcMock.mockImplementation((fn: string) => {
            if (fn === "get_segments_missing_gemini_embeddings") {
                return Promise.resolve({
                    data: [
                        {
                            id: "123e4567-e89b-12d3-a456-426614174000",
                            content_item_id: "223e4567-e89b-12d3-a456-426614174000",
                            markdown_body: "A segment that needs embeddings",
                        },
                    ],
                    error: null,
                });
            }

            if (fn === "get_gemini_segment_embedding_coverage") {
                return Promise.resolve({
                    data: [
                        {
                            total_library_content_items: 53,
                            embedded_content_items: 40,
                            missing_segments: 12,
                        },
                    ],
                    error: null,
                });
            }

            throw new Error(`Unexpected rpc: ${fn}`);
        });
        insertMock.mockResolvedValue({ error: null });
        embedContentMock.mockResolvedValue({
            embeddings: [{ values: Array.from({ length: 768 }, (_, index) => index / 1000) }],
        });
        fromMock.mockImplementation((table: string) => {
            if (table !== "segment_embedding_gemini") {
                throw new Error(`Unexpected table: ${table}`);
            }

            return {
                insert: insertMock,
            };
        });

        (getAdminClient as any).mockReturnValue({
            rpc: rpcMock,
            from: fromMock,
        });
    });

    it("requires admin access", async () => {
        (verifyAdminSession as any).mockResolvedValueOnce(false);

        const req = new NextRequest(new URL("http://localhost/api/admin/embeddings/sync-segments"), {
            method: "POST",
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it("requires GEMINI_API_KEY", async () => {
        delete process.env.GEMINI_API_KEY;

        const req = new NextRequest(new URL("http://localhost/api/admin/embeddings/sync-segments"), {
            method: "POST",
        });

        const res = await POST(req);
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error.message).toContain("GEMINI_API_KEY");
    });

    it("writes Gemini segment embeddings and returns progress metadata", async () => {
        const req = new NextRequest(new URL("http://localhost/api/admin/embeddings/sync-segments"), {
            method: "POST",
        });

        const res = await POST(req);
        expect(res.status).toBe(200);

        expect(rpcMock).toHaveBeenCalledWith("get_segments_missing_gemini_embeddings", { p_limit: 50 });
        expect(embedContentMock).toHaveBeenCalled();
        expect(fromMock).toHaveBeenCalledWith("segment_embedding_gemini");
        expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
            segment_id: "123e4567-e89b-12d3-a456-426614174000",
            content_item_id: "223e4567-e89b-12d3-a456-426614174000",
        }));

        const json = await res.json();
        expect(json.results).toEqual({
            processed: 1,
            success: 1,
            failed: 0,
            has_more_to_process: false,
        });
        expect(json.summary).toEqual({
            total_library_content_items: 53,
            embedded_content_items: 40,
            missing_segments: 12,
        });
    });

    it("flags when more segments remain to be processed", async () => {
        rpcMock.mockImplementationOnce((fn: string) => {
            if (fn === "get_segments_missing_gemini_embeddings") {
                return Promise.resolve({
                    data: Array.from({ length: 50 }, (_, index) => ({
                        id: `123e4567-e89b-12d3-a456-4266141740${index.toString().padStart(2, "0")}`,
                        content_item_id: "223e4567-e89b-12d3-a456-426614174000",
                        markdown_body: `Segment ${index}`,
                    })),
                    error: null,
                });
            }

            return Promise.resolve({
                data: [
                    {
                        total_library_content_items: 53,
                        embedded_content_items: 40,
                        missing_segments: 12,
                    },
                ],
                error: null,
            });
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/embeddings/sync-segments"), {
            method: "POST",
        });

        const res = await POST(req);
        const json = await res.json();
        expect(json.results.has_more_to_process).toBe(true);
    });

    it("returns Gemini retrieval coverage on GET", async () => {
        const { GET } = await import("@/app/api/admin/embeddings/sync-segments/route");
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.summary).toEqual({
            total_library_content_items: 53,
            embedded_content_items: 40,
            missing_segments: 12,
        });
    });
});
