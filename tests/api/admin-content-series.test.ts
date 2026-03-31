import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    DELETE as deleteAdminContent,
    GET as getAdminContentDetail,
    PUT as updateAdminContent,
} from "@/app/api/admin/content/[id]/route";
import { POST as createAdminContent } from "@/app/api/admin/content/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/server/rate-limit";
import { revalidatePath } from "next/cache";

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Admin content series support", () => {
    const seriesId = "123e4567-e89b-12d3-a456-426614174111";

    beforeEach(() => {
        vi.clearAllMocks();
        (verifyAdminSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, retryAfterMs: 0 });
    });

    it("persists series metadata when creating content", async () => {
        const contentInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: { id: "content-1", series_id: seriesId },
                    error: null,
                }),
            }),
        });
        const segmentInsert = vi.fn().mockResolvedValue({ error: null });
        const artifactInsert = vi.fn().mockResolvedValue({ error: null });
        const seriesLookup = vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
                data: [{ slug: "matthew" }],
                error: null,
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return { insert: contentInsert };
                }

                if (table === "segment") {
                    return { insert: segmentInsert };
                }

                if (table === "artifact") {
                    return { insert: artifactInsert };
                }

                if (table === "content_series") {
                    return { select: seriesLookup };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content"), {
            method: "POST",
            body: JSON.stringify({
                title: "Matthew 5-7: Sermon on the Mount",
                type: "book",
                author: "Matthew",
                category: "Christian",
                cover_image_url: "https://example.com/matthew.jpg",
                status: "verified",
                series_id: seriesId,
                series_order: 2,
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Idea",
                    key_takeaways: ["A"],
                },
                segments: [{ order_index: 0, markdown_body: "Blessed are the poor in spirit." }],
                artifacts: [],
            }),
        });

        const res = await createAdminContent(req);

        expect(res.status).toBe(201);
        expect(contentInsert).toHaveBeenCalledWith(expect.objectContaining({
            title: "Matthew 5-7: Sermon on the Mount",
            series_id: seriesId,
            series_order: 2,
        }));
        expect(revalidatePath).toHaveBeenCalledWith("/browse");
        expect(revalidatePath).toHaveBeenCalledWith("/series/matthew");
    });

    it("rejects verified content creation when publish requirements are missing", async () => {
        const req = new NextRequest(new URL("http://localhost/api/admin/content"), {
            method: "POST",
            body: JSON.stringify({
                title: "Matthew 5-7: Sermon on the Mount",
                type: "book",
                category: "Christian",
                status: "verified",
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Idea",
                    key_takeaways: ["A"],
                },
                segments: [],
                artifacts: [],
            }),
        });

        const res = await createAdminContent(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.details).toEqual(expect.arrayContaining([
            {
                path: ["cover_image_url"],
                message: "A cover image is required before content can be verified",
            },
            {
                path: ["segments"],
                message: "At least one non-empty segment is required before content can be verified",
            },
        ]));
    });

    it("returns existing series assignment on detail fetch", async () => {
        const single = vi.fn().mockResolvedValue({
            data: {
                id: "content-1",
                title: "Matthew 5-7: Sermon on the Mount",
                series_id: seriesId,
                series_order: 2,
                segments: [],
                artifacts: [],
            },
            error: null,
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        order: vi.fn().mockReturnValue({
                            single,
                        }),
                    }),
                }),
            })),
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/content-1"));
        const res = await getAdminContentDetail(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        const json = await res.json();
        expect(res.status).toBe(200);
        expect(json.data.series_id).toBe(seriesId);
        expect(json.data.series_order).toBe(2);
    });

    it("forwards series updates through the graph RPC and revalidates the series page", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: { series_id: seriesId },
            error: null,
        });
        const slugLookup = vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
                data: [{ slug: "matthew" }],
                error: null,
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                single: firstSingle,
                            }),
                        }),
                    };
                }

                if (table === "content_series") {
                    return { select: slugLookup };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                title: "Matthew 5-7: Sermon on the Mount",
                series_id: seriesId,
                series_order: 2,
                segments: [],
                artifacts: [],
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("admin_update_content_graph", expect.objectContaining({
            p_content_patch: expect.objectContaining({
                title: "Matthew 5-7: Sermon on the Mount",
                series_id: seriesId,
                series_order: 2,
            }),
        }));
        expect(revalidatePath).toHaveBeenCalledWith("/browse");
        expect(revalidatePath).toHaveBeenCalledWith("/series/matthew");
    });

    it("rejects updates that would leave verified content missing publish requirements", async () => {
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: seriesId,
                status: "draft",
                cover_image_url: null,
                category: "Christian",
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Idea",
                    key_takeaways: ["A"],
                },
            },
            error: null,
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                single: firstSingle,
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc: vi.fn(),
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                status: "verified",
                segments: [],
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.details).toEqual(expect.arrayContaining([
            {
                path: ["cover_image_url"],
                message: "A cover image is required before content can be verified",
            },
            {
                path: ["segments"],
                message: "At least one non-empty segment is required before content can be verified",
            },
        ]));
    });

    it("invalidates content embeddings when verified metadata changes", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: seriesId,
                status: "verified",
                title: "Matthew",
                author: "Matthew",
                type: "book",
                category: "Christian",
                cover_image_url: "https://example.com/matthew.jpg",
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Idea",
                    key_takeaways: ["A"],
                },
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
                data: [{ markdown_body: "Blessed are the poor in spirit." }],
                error: null,
            }),
        });
        const contentUpdate = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
        });
        const slugLookup = vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
                data: [{ slug: "matthew" }],
                error: null,
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                single: firstSingle,
                            }),
                        }),
                        update: contentUpdate,
                    };
                }

                if (table === "segment") {
                    return { select: segmentSelect };
                }

                if (table === "content_series") {
                    return { select: slugLookup };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                title: "Gospel of Matthew",
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(contentUpdate).toHaveBeenCalledWith({ embedding: null });
        expect(revalidatePath).toHaveBeenCalledWith("/browse");
    });

    it("returns field errors when creating content with a duplicate series order", async () => {
        const contentInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: "23505", constraint: "idx_content_item_series_order_unique" },
                }),
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return { insert: contentInsert };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content"), {
            method: "POST",
            body: JSON.stringify({
                title: "Matthew 5-7: Sermon on the Mount",
                type: "book",
                series_id: seriesId,
                series_order: 2,
            }),
        });

        const res = await createAdminContent(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.details).toEqual([
            { path: ["series_order"], message: "This series order is already used in the selected series" },
        ]);
    });

    it("returns 404 when updating content that no longer exists", async () => {
        const firstSingle = vi.fn().mockResolvedValue({
            data: null,
            error: { code: "PGRST116" },
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: firstSingle,
                    }),
                }),
            })),
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                title: "Matthew 5-7: Sermon on the Mount",
                series_id: seriesId,
                series_order: 2,
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });
        const json = await res.json();

        expect(res.status).toBe(404);
        expect(json.error.code).toBe("NOT_FOUND");
    });

    it("returns field errors when updating content with a duplicate series order", async () => {
        const rpc = vi.fn().mockResolvedValue({
            error: { code: "23505", constraint: "idx_content_item_series_order_unique" },
        });
        const firstSingle = vi.fn().mockResolvedValue({
            data: { series_id: seriesId },
            error: null,
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                single: firstSingle,
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                title: "Matthew 5-7: Sermon on the Mount",
                series_id: seriesId,
                series_order: 2,
                segments: [],
                artifacts: [],
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.details).toEqual([
            { path: ["series_order"], message: "This series order is already used in the selected series" },
        ]);
    });

    it("does not misclassify unrelated RPC unique violations as series-order conflicts", async () => {
        const rpc = vi.fn().mockResolvedValue({
            error: { code: "23505", constraint: "segment_item_id_order_index_key" },
        });
        const firstSingle = vi.fn().mockResolvedValue({
            data: { series_id: seriesId },
            error: null,
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                single: firstSingle,
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const res = await updateAdminContent(
            new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
                method: "PUT",
                body: JSON.stringify({
                    title: "Matthew 5-7: Sermon on the Mount",
                    series_id: seriesId,
                    series_order: 2,
                    segments: [
                        { order_index: 1, markdown_body: "A" },
                        { order_index: 1, markdown_body: "B" },
                    ],
                    artifacts: [],
                }),
            }),
            { params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }) }
        );
        const json = await res.json();

        expect(res.status).toBe(500);
        expect(json.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns 404 when deleting content that no longer exists", async () => {
        const firstSingle = vi.fn().mockResolvedValue({
            data: null,
            error: { code: "PGRST116" },
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        single: firstSingle,
                    }),
                }),
            })),
        });

        const res = await deleteAdminContent(
            new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
                method: "DELETE",
            }),
            { params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }) }
        );
        const json = await res.json();

        expect(res.status).toBe(404);
        expect(json.error.code).toBe("NOT_FOUND");
    });
});
