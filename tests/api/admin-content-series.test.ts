import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    DELETE as deleteAdminContent,
    GET as getAdminContentDetail,
    PUT as updateAdminContent,
} from "@/app/api/admin/content/[id]/route";
import {
    GET as listAdminContent,
    POST as createAdminContent,
} from "@/app/api/admin/content/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/server/rate-limit";
import { revalidatePath } from "next/cache";

const { afterMock } = vi.hoisted(() => ({
    afterMock: vi.fn(),
}));

vi.mock("next/server", async () => {
    const actual = await vi.importActual<typeof import("next/server")>("next/server");
    return {
        ...actual,
        after: afterMock,
    };
});

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
        afterMock.mockImplementation(() => {});
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
        const contentUpdate = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: {
                            audio_url: null,
                            narration_status: "queued",
                            narration_error: null,
                            narration_requested_at: "2026-04-05T00:00:00.000Z",
                            narration_started_at: null,
                            narration_completed_at: null,
                        },
                        error: null,
                    }),
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                            audio_url: null,
                            narration_status: "queued",
                            narration_error: null,
                            narration_requested_at: "2026-04-05T00:00:00.000Z",
                            narration_started_at: null,
                            narration_completed_at: null,
                        },
                        error: null,
                    }),
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
                    return {
                        insert: contentInsert,
                        update: contentUpdate,
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                is: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: {
                                            audio_url: null,
                                            narration_status: "idle",
                                            narration_error: null,
                                            narration_requested_at: null,
                                            narration_started_at: null,
                                            narration_completed_at: null,
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
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

    it("auto-queues narration when creating verified content without manual audio", async () => {
        const contentInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: { id: "content-1", series_id: null },
                    error: null,
                }),
            }),
        });
        const contentUpdate = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: {
                            audio_url: null,
                            narration_status: "queued",
                            narration_error: null,
                            narration_requested_at: "2026-04-05T00:00:00.000Z",
                            narration_started_at: null,
                            narration_completed_at: null,
                        },
                        error: null,
                    }),
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                            audio_url: null,
                            narration_status: "queued",
                            narration_error: null,
                            narration_requested_at: "2026-04-05T00:00:00.000Z",
                            narration_started_at: null,
                            narration_completed_at: null,
                        },
                        error: null,
                    }),
                }),
            }),
        });
        const segmentInsert = vi.fn().mockResolvedValue({ error: null });
        const seriesLookup = vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
                data: [],
                error: null,
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        insert: contentInsert,
                        update: contentUpdate,
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                is: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: {
                                            audio_url: null,
                                            narration_status: "idle",
                                            narration_error: null,
                                            narration_requested_at: null,
                                            narration_started_at: null,
                                            narration_completed_at: null,
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }

                if (table === "segment") {
                    return { insert: segmentInsert };
                }

                if (table === "content_series") {
                    return { select: seriesLookup };
                }

                if (table === "artifact") {
                    return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Idea",
                    key_takeaways: ["A"],
                },
                segments: [{ order_index: 0, markdown_body: "Blessed are the poor in spirit." }],
            }),
        });

        const res = await createAdminContent(req);

        expect(res.status).toBe(201);
        expect(contentUpdate).toHaveBeenCalledWith(expect.objectContaining({
            narration_status: "queued",
            narration_error: null,
        }));
        expect(afterMock).toHaveBeenCalledTimes(1);
    });

    it("returns a narration warning when auto-queue fails during verified content creation", async () => {
        const contentInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: { id: "content-1", series_id: null },
                    error: null,
                }),
            }),
        });
        const contentUpdate = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: null,
                        error: new Error("queue failed"),
                    }),
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: new Error("queue failed"),
                    }),
                }),
            }),
        });
        const segmentInsert = vi.fn().mockResolvedValue({ error: null });
        const seriesLookup = vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
                data: [],
                error: null,
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        insert: contentInsert,
                        update: contentUpdate,
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                is: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: null,
                                        error: new Error("queue failed"),
                                    }),
                                }),
                            }),
                        }),
                    };
                }

                if (table === "segment") {
                    return { insert: segmentInsert };
                }

                if (table === "content_series") {
                    return { select: seriesLookup };
                }

                if (table === "artifact") {
                    return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Idea",
                    key_takeaways: ["A"],
                },
                segments: [{ order_index: 0, markdown_body: "Blessed are the poor in spirit." }],
            }),
        });

        const res = await createAdminContent(req);
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.data.narration_warning).toMatch(/could not be queued automatically/i);
    });

    it("does not auto-queue narration when creating verified content with manual audio", async () => {
        const contentInsert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: { id: "content-1", series_id: null },
                    error: null,
                }),
            }),
        });
        const contentUpdate = vi.fn();
        const segmentInsert = vi.fn().mockResolvedValue({ error: null });
        const seriesLookup = vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
                data: [],
                error: null,
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        insert: contentInsert,
                        update: contentUpdate,
                    };
                }

                if (table === "segment") {
                    return { insert: segmentInsert };
                }

                if (table === "content_series") {
                    return { select: seriesLookup };
                }

                if (table === "artifact") {
                    return { insert: vi.fn().mockResolvedValue({ error: null }) };
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
                audio_url: "https://example.com/manual-audio.mp3",
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Idea",
                    key_takeaways: ["A"],
                },
                segments: [{ order_index: 0, markdown_body: "Blessed are the poor in spirit." }],
            }),
        });

        const res = await createAdminContent(req);

        expect(res.status).toBe(201);
        expect(contentUpdate).not.toHaveBeenCalled();
        expect(afterMock).not.toHaveBeenCalled();
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
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockReturnValue({
                                    single,
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
                                        data: [],
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
                                    data: [],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                if (table === "segment") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({
                                    data: [],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                if (table === "segment") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({
                                    data: [],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                if (table === "segment") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({
                                    data: [],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
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

    it("adds AI readiness to content list responses", async () => {
        const contentRange = vi.fn().mockResolvedValue({
            data: [
                {
                    id: "verified-ready",
                    title: "Ready item",
                    type: "book",
                    author: "Matthew",
                    category: "Christian",
                    status: "verified",
                    is_featured: false,
                    embedding: "[1,2,3]",
                    created_at: "2026-03-01T00:00:00Z",
                    updated_at: "2026-03-01T00:00:00Z",
                    deleted_at: null,
                },
                {
                    id: "draft-item",
                    title: "Draft item",
                    type: "book",
                    author: "Matthew",
                    category: "Christian",
                    status: "draft",
                    is_featured: false,
                    embedding: null,
                    created_at: "2026-03-02T00:00:00Z",
                    updated_at: "2026-03-02T00:00:00Z",
                    deleted_at: null,
                },
            ],
            error: null,
            count: 2,
        });
        const listQuery = {
            is: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnValue({
                range: contentRange,
            }),
        };

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue(listQuery),
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

        const req = new NextRequest(new URL("http://localhost/api/admin/content"));
        const res = await listAdminContent(req);
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data[0].ai_readiness.status).toBe("ready");
        expect(json.data[0].ai_readiness.segment_embeddings.missing_segments).toBe(0);
        expect(json.data[1].ai_readiness.status).toBe("not_applicable");
        expect(json.data[1].ai_readiness.stale_reasons).toEqual(["CONTENT_NOT_VERIFIED"]);
    });

    it("adds AI readiness to content detail responses", async () => {
        const single = vi.fn().mockResolvedValue({
            data: {
                id: "content-1",
                title: "Matthew 5-7: Sermon on the Mount",
                status: "verified",
                embedding: null,
                segments: [{ id: "segment-1", markdown_body: "Blessed are the poor in spirit." }],
                artifacts: [],
            },
            error: null,
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockReturnValue({
                                    single,
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
                                            { id: "segment-1", item_id: "content-1", markdown_body: "Blessed are the poor in spirit." },
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
                                    data: [],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/content-1"));
        const res = await getAdminContentDetail(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.ai_readiness.status).toBe("stale");
        expect(json.data.ai_readiness.stale_reasons).toEqual([
            "CONTENT_EMBEDDING_MISSING",
            "SEGMENT_EMBEDDINGS_MISSING",
        ]);
        expect(json.data.ai_readiness.next_actions).toEqual([
            "run_content_embedding_sync",
            "run_segment_embedding_sync",
        ]);
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

                if (table === "segment") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({
                                    data: [],
                                    error: null,
                                }),
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
                                is: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: {
                                            audio_url: null,
                                            narration_status: "idle",
                                            narration_error: null,
                                            narration_requested_at: null,
                                            narration_started_at: null,
                                            narration_completed_at: null,
                                        },
                                        error: null,
                                    }),
                                }),
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

    it("marks existing narration stale when verified segment content changes", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: null,
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
                audio_url: "https://example.com/audio/current.mp3",
                narration_status: "ready",
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                    data: [{
                        id: "11111111-1111-1111-1111-111111111111",
                        order_index: 0,
                        title: "Current segment",
                        markdown_body: "Old body",
                        start_time_sec: 0,
                        end_time_sec: 30,
                    }],
                    error: null,
                }),
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

                if (table === "segment") {
                    return { select: segmentSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                segments: [{
                    id: "11111111-1111-1111-1111-111111111111",
                    order_index: 0,
                    title: "Current segment",
                    markdown_body: "Updated body",
                    start_time_sec: 0,
                    end_time_sec: 30,
                }],
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("admin_update_content_graph", expect.objectContaining({
            p_content_patch: expect.objectContaining({
                narration_status: "stale",
                narration_error: null,
                narration_requested_at: null,
                narration_started_at: null,
            }),
            p_segments: [
                expect.objectContaining({
                    id: "11111111-1111-1111-1111-111111111111",
                    start_time_sec: null,
                    end_time_sec: null,
                }),
            ],
        }));
    });

    it("keeps narration ready when only segment timing changes", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: null,
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
                audio_url: "https://example.com/audio/current.mp3",
                narration_status: "ready",
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                    data: [{
                        order_index: 0,
                        title: "Current segment",
                        markdown_body: "Stable body",
                    }],
                    error: null,
                }),
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

                if (table === "segment") {
                    return { select: segmentSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                segments: [{
                    order_index: 0,
                    title: "Current segment",
                    markdown_body: "Stable body",
                    start_time_sec: 30,
                    end_time_sec: 60,
                }],
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("admin_update_content_graph", expect.objectContaining({
            p_content_patch: expect.not.objectContaining({
                narration_status: "stale",
            }),
        }));
    });

    it("preserves existing segment timings when verified content saves unchanged segments without timing fields", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: null,
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
                audio_url: "https://example.com/audio/current.mp3",
                narration_status: "ready",
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                    data: [{
                        id: "11111111-1111-1111-1111-111111111111",
                        order_index: 0,
                        title: "Current segment",
                        markdown_body: "Stable body",
                        start_time_sec: 12,
                        end_time_sec: 34,
                    }],
                    error: null,
                }),
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

                if (table === "segment") {
                    return { select: segmentSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                segments: [{
                    id: "11111111-1111-1111-1111-111111111111",
                    order_index: 0,
                    title: "Current segment",
                    markdown_body: "Stable body",
                }],
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("admin_update_content_graph", expect.objectContaining({
            p_segments: [
                expect.objectContaining({
                    id: "11111111-1111-1111-1111-111111111111",
                    start_time_sec: 12,
                    end_time_sec: 34,
                }),
            ],
        }));
    });

    it("still marks narration stale when an unchanged audio url is submitted with segment edits", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: null,
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
                audio_url: "https://example.com/audio/current.mp3",
                narration_status: "ready",
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                    data: [{
                        order_index: 0,
                        title: "Current segment",
                        markdown_body: "Old body",
                    }],
                    error: null,
                }),
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

                if (table === "segment") {
                    return { select: segmentSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                audio_url: "https://example.com/audio/current.mp3",
                segments: [{
                    order_index: 0,
                    title: "Current segment",
                    markdown_body: "Updated body",
                }],
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("admin_update_content_graph", expect.objectContaining({
            p_content_patch: expect.objectContaining({
                narration_status: "stale",
            }),
        }));
    });

    it("does not reset a stale narration when saving unrelated edits with an unchanged audio url", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: null,
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
                audio_url: "https://example.com/audio/current.mp3",
                narration_status: "stale",
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
                data: [{ order_index: 0, title: "Current segment", markdown_body: "Stable body" }],
                error: null,
            }),
        });
        const contentUpdate = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                single: firstSingle,
                                is: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: null,
                                        error: new Error("queue failed"),
                                    }),
                                }),
                            }),
                        }),
                        update: contentUpdate,
                    };
                }

                if (table === "segment") {
                    return { select: segmentSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                title: "Updated title only",
                audio_url: "https://example.com/audio/current.mp3",
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith("admin_update_content_graph", expect.objectContaining({
            p_content_patch: expect.not.objectContaining({
                narration_status: "ready",
            }),
        }));
    });

    it("auto-queues narration when publishing draft content without manual audio", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: null,
                status: "draft",
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
                audio_url: null,
                narration_status: "idle",
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
                data: [{ order_index: 0, title: "Current segment", markdown_body: "Stable body" }],
                error: null,
            }),
        });
        const contentUpdate = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: {
                            audio_url: null,
                            narration_status: "queued",
                            narration_error: null,
                            narration_requested_at: "2026-04-05T00:00:00.000Z",
                            narration_started_at: null,
                            narration_completed_at: null,
                        },
                        error: null,
                    }),
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                            audio_url: null,
                            narration_status: "queued",
                            narration_error: null,
                            narration_requested_at: "2026-04-05T00:00:00.000Z",
                            narration_started_at: null,
                            narration_completed_at: null,
                        },
                        error: null,
                    }),
                }),
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                single: firstSingle,
                                is: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: {
                                            audio_url: null,
                                            narration_status: "idle",
                                            narration_error: null,
                                            narration_requested_at: null,
                                            narration_started_at: null,
                                            narration_completed_at: null,
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                        update: contentUpdate,
                    };
                }

                if (table === "segment") {
                    return { select: segmentSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                status: "verified",
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(contentUpdate).toHaveBeenCalledWith(expect.objectContaining({
            narration_status: "queued",
            narration_error: null,
        }));
        expect(afterMock).toHaveBeenCalledTimes(1);
    });

    it("returns a narration warning when auto-queue fails after publish", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: null,
                status: "draft",
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
                audio_url: null,
                narration_status: "idle",
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
                data: [{ order_index: 0, title: "Current segment", markdown_body: "Stable body" }],
                error: null,
            }),
        });
        const contentUpdate = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                        data: null,
                        error: new Error("queue failed"),
                    }),
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: new Error("queue failed"),
                    }),
                }),
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                single: firstSingle,
                                is: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({
                                        data: null,
                                        error: new Error("queue failed"),
                                    }),
                                }),
                            }),
                        }),
                        update: contentUpdate,
                    };
                }

                if (table === "segment") {
                    return { select: segmentSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                status: "verified",
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.data.narration_warning).toMatch(/could not be queued automatically/i);
    });

    it("does not auto-queue narration when saving already verified content", async () => {
        const rpc = vi.fn().mockResolvedValue({ error: null });
        const firstSingle = vi.fn().mockResolvedValue({
            data: {
                series_id: null,
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
                audio_url: null,
                narration_status: "idle",
            },
            error: null,
        });
        const segmentSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
                data: [{ order_index: 0, title: "Current segment", markdown_body: "Stable body" }],
                error: null,
            }),
        });
        const contentUpdate = vi.fn((payload?: Record<string, unknown>) => {
            if (payload && "embedding" in payload) {
                return {
                    eq: vi.fn().mockResolvedValue({ error: null }),
                };
            }

            return {
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                            data: {
                                audio_url: null,
                                narration_status: "queued",
                                narration_error: null,
                                narration_requested_at: "2026-04-05T00:00:00.000Z",
                                narration_started_at: null,
                                narration_completed_at: null,
                            },
                            error: null,
                        }),
                    }),
                }),
            };
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

                throw new Error(`Unexpected table ${table}`);
            }),
            rpc,
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                title: "Minor verified edit",
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });

        expect(res.status).toBe(200);
        expect(contentUpdate).toHaveBeenCalledWith({ embedding: null });
        expect(contentUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
            narration_status: "queued",
        }));
        expect(afterMock).not.toHaveBeenCalled();
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

    it("rejects invalid segment timing ranges when creating content", async () => {
        const req = new NextRequest(new URL("http://localhost/api/admin/content"), {
            method: "POST",
            body: JSON.stringify({
                title: "Timing Validation",
                type: "article",
                status: "verified",
                cover_image_url: "https://example.com/cover.jpg",
                category: "Health",
                quick_mode_json: {
                    hook: "Hook",
                    big_idea: "Big idea",
                    key_takeaways: ["Takeaway"],
                },
                segments: [
                    {
                        order_index: 0,
                        markdown_body: "Body",
                        start_time_sec: -1,
                        end_time_sec: 4,
                    },
                ],
            }),
        });

        const res = await createAdminContent(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.details).toEqual([
            expect.objectContaining({
                path: ["segments", 0, "start_time_sec"],
                message: "Start time must be zero or greater.",
            }),
        ]);
    });

    it("rejects segment timing ranges whose end time is not after the start time", async () => {
        const req = new NextRequest(new URL("http://localhost/api/admin/content/123e4567-e89b-12d3-a456-426614174000"), {
            method: "PUT",
            body: JSON.stringify({
                title: "Timing Validation",
                segments: [
                    {
                        order_index: 0,
                        markdown_body: "Body",
                        start_time_sec: 12,
                        end_time_sec: 12,
                    },
                ],
            }),
        });

        const res = await updateAdminContent(req, {
            params: Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174000" }),
        });
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.details).toEqual([
            expect.objectContaining({
                path: ["segments", 0, "end_time_sec"],
                message: "End time must be greater than start time.",
            }),
        ]);
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
