import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/series/route";
import { PUT, DELETE } from "@/app/api/admin/series/[id]/route";
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

describe("Admin series API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (verifyAdminSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, retryAfterMs: 0 });
    });

    it("creates a series and revalidates admin surfaces", async () => {
        const insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: {
                        id: "123e4567-e89b-12d3-a456-426614174111",
                        slug: "matthew",
                        title: "Matthew",
                        description: null,
                        created_at: "2026-03-19T00:00:00.000Z",
                        updated_at: "2026-03-19T00:00:00.000Z",
                    },
                    error: null,
                }),
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_series") {
                    return { insert };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/series"), {
            method: "POST",
            body: JSON.stringify({
                title: "Matthew",
                slug: "matthew",
                description: null,
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(201);
        expect(insert).toHaveBeenCalledWith({
            title: "Matthew",
            slug: "matthew",
            description: null,
        });
        expect(revalidatePath).toHaveBeenCalledWith("/admin/series");
        expect(revalidatePath).toHaveBeenCalledWith("/admin/content/new");
        expect(revalidatePath).toHaveBeenCalledWith("/series/matthew");
    });

    it("lists series with content counts", async () => {
        const countSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ count: 4 }),
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_series") {
                    return {
                        select: vi.fn().mockReturnValue({
                            order: vi.fn().mockResolvedValue({
                                data: [{
                                    id: "series-1",
                                    slug: "matthew",
                                    title: "Matthew",
                                    description: null,
                                    created_at: "",
                                    updated_at: "",
                                }],
                                error: null,
                            }),
                        }),
                    };
                }

                if (table === "content_item") {
                    return { select: countSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const res = await GET(new NextRequest(new URL("http://localhost/api/admin/series")));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json[0].content_count).toBe(4);
    });

    it("returns 500 when a series count lookup fails", async () => {
        const countSelect = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ count: null, error: { code: "COUNT_FAILED" } }),
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_series") {
                    return {
                        select: vi.fn().mockReturnValue({
                            order: vi.fn().mockResolvedValue({
                                data: [{
                                    id: "series-1",
                                    slug: "matthew",
                                    title: "Matthew",
                                    description: null,
                                    created_at: "",
                                    updated_at: "",
                                }],
                                error: null,
                            }),
                        }),
                    };
                }

                if (table === "content_item") {
                    return { select: countSelect };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const res = await GET(new NextRequest(new URL("http://localhost/api/admin/series")));
        const json = await res.json();

        expect(res.status).toBe(500);
        expect(json.error.code).toBe("INTERNAL_ERROR");
    });

    it("returns field errors when creating a duplicate slug", async () => {
        const insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: "23505", constraint: "content_series_slug_key" },
                }),
            }),
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_series") {
                    return { insert };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const req = new NextRequest(new URL("http://localhost/api/admin/series"), {
            method: "POST",
            body: JSON.stringify({
                title: "Matthew",
                slug: "matthew",
                description: null,
            }),
        });

        const res = await POST(req);
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.details).toEqual([
            { path: ["slug"], message: "A series with this slug already exists" },
        ]);
    });

    it("updates a series", async () => {
        const maybeSingle = vi.fn().mockResolvedValue({
            data: { id: "series-1", slug: "matthew" },
            error: null,
        });
        const updateSingle = vi.fn().mockResolvedValue({
            data: {
                id: "series-1",
                slug: "gospel-of-matthew",
                title: "Gospel of Matthew",
                description: null,
                created_at: "",
                updated_at: "",
            },
            error: null,
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table !== "content_series") {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle,
                        }),
                    }),
                    update: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                single: updateSingle,
                            }),
                        }),
                    }),
                };
            }),
        });

        const res = await PUT(
            new NextRequest(new URL("http://localhost/api/admin/series/series-1"), {
                method: "PUT",
                body: JSON.stringify({ title: "Gospel of Matthew", slug: "gospel-of-matthew" }),
            }),
            { params: Promise.resolve({ id: "series-1" }) }
        );

        expect(res.status).toBe(200);
        expect(revalidatePath).toHaveBeenCalledWith("/series/matthew");
        expect(revalidatePath).toHaveBeenCalledWith("/series/gospel-of-matthew");
    });

    it("returns field errors when updating to a duplicate slug", async () => {
        const maybeSingle = vi.fn().mockResolvedValue({
            data: { id: "series-1", slug: "matthew" },
            error: null,
        });
        const updateSingle = vi.fn().mockResolvedValue({
            data: null,
            error: { code: "23505", constraint: "content_series_slug_key" },
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table !== "content_series") {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle,
                        }),
                    }),
                    update: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                single: updateSingle,
                            }),
                        }),
                    }),
                };
            }),
        });

        const res = await PUT(
            new NextRequest(new URL("http://localhost/api/admin/series/series-1"), {
                method: "PUT",
                body: JSON.stringify({ slug: "matthew" }),
            }),
            { params: Promise.resolve({ id: "series-1" }) }
        );
        const json = await res.json();

        expect(res.status).toBe(400);
        expect(json.error.code).toBe("VALIDATION_ERROR");
        expect(json.error.details).toEqual([
            { path: ["slug"], message: "A series with this slug already exists" },
        ]);
    });

    it("prevents deleting a non-empty series", async () => {
        const maybeSingle = vi.fn().mockResolvedValue({
            data: { id: "series-1", slug: "matthew" },
            error: null,
        });

        (getAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table === "content_series") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle,
                            }),
                        }),
                    };
                }

                if (table === "content_item") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                is: vi.fn().mockResolvedValue({ count: 1, error: null }),
                            }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const res = await DELETE(
            new NextRequest(new URL("http://localhost/api/admin/series/series-1"), {
                method: "DELETE",
            }),
            { params: Promise.resolve({ id: "series-1" }) }
        );

        expect(res.status).toBe(400);
    });
});
