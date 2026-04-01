import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/content/[id]/narration/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/server/rate-limit";

const { revalidatePathMock } = vi.hoisted(() => ({
    revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/admin/auth", () => ({
    verifyAdminSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
    getAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

describe("Admin content narration API", () => {
    const uploadMock = vi.fn();
    const getPublicUrlMock = vi.fn();
    const removeMock = vi.fn();
    const contentUpdateEqMock = vi.fn();
    const contentUpdateMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.OPENAI_API_KEY = "test-openai-key";
        (verifyAdminSession as any).mockResolvedValue(true);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });

        const selectChain = {
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    id: "11111111-1111-1111-1111-111111111111",
                    title: "Atomic Habits Summary",
                    author: "James Clear",
                    status: "verified",
                    quick_mode_json: {
                        big_idea: "Small habits compound into remarkable results.",
                    },
                    segments: [
                        {
                            order_index: 1,
                            title: "Make it obvious",
                            markdown_body: "Cue your habits with visible triggers.",
                            deleted_at: null,
                        },
                    ],
                },
                error: null,
            }),
        };

        contentUpdateEqMock.mockResolvedValue({ error: null });
        contentUpdateMock.mockReturnValue({
            eq: contentUpdateEqMock,
        });

        uploadMock.mockResolvedValue({ error: null });
        removeMock.mockResolvedValue({ error: null });
        getPublicUrlMock.mockReturnValue({
            data: {
                publicUrl: "https://example.supabase.co/storage/v1/object/public/audio/generated/11111111-1111-1111-1111-111111111111/ai-narration.wav",
            },
        });

        (getAdminClient as any).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table !== "content_item") {
                    throw new Error(`Unexpected table ${table}`);
                }

                return {
                    select: vi.fn().mockReturnValue(selectChain),
                    update: contentUpdateMock,
                };
            }),
            storage: {
                from: vi.fn((bucket: string) => {
                    if (bucket !== "audio") {
                        throw new Error(`Unexpected bucket ${bucket}`);
                    }

                    return {
                        upload: uploadMock,
                        getPublicUrl: getPublicUrlMock,
                        remove: removeMock,
                    };
                }),
            },
        });

        const wavBuffer = Buffer.alloc(48);
        wavBuffer.write("RIFF", 0, "ascii");
        wavBuffer.writeUInt32LE(40, 4);
        wavBuffer.write("WAVE", 8, "ascii");
        wavBuffer.write("fmt ", 12, "ascii");
        wavBuffer.writeUInt32LE(16, 16);
        wavBuffer.writeUInt16LE(1, 20);
        wavBuffer.writeUInt16LE(1, 22);
        wavBuffer.writeUInt32LE(24_000, 24);
        wavBuffer.writeUInt32LE(48_000, 28);
        wavBuffer.writeUInt16LE(2, 32);
        wavBuffer.writeUInt16LE(16, 34);
        wavBuffer.write("data", 36, "ascii");
        wavBuffer.writeUInt32LE(4, 40);
        wavBuffer.writeUInt16LE(0, 44);
        wavBuffer.writeUInt16LE(0, 46);
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: async () => wavBuffer,
        }) as any;
    });

    it("requires admin access", async () => {
        (verifyAdminSession as any).mockResolvedValueOnce(false);

        const req = new NextRequest("http://localhost/api/admin/content/11111111-1111-1111-1111-111111111111/narration", {
            method: "POST",
        });

        const res = await POST(req, {
            params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
        });

        expect(res.status).toBe(401);
    });

    it("generates, uploads, and persists a single WAV narration", async () => {
        const req = new NextRequest("http://localhost/api/admin/content/11111111-1111-1111-1111-111111111111/narration", {
            method: "POST",
        });

        const res = await POST(req, {
            params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
        });

        expect(res.status).toBe(200);

        const json = await res.json();
        expect(json.data.url).toContain("/audio/generated/11111111-1111-1111-1111-111111111111/ai-narration.wav");
        expect(json.data.chunk_count).toBe(1);

        expect(global.fetch).toHaveBeenCalledWith(
            "https://api.openai.com/v1/audio/speech",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer test-openai-key",
                }),
            })
        );

        expect(uploadMock).toHaveBeenCalledWith(
            "generated/11111111-1111-1111-1111-111111111111/ai-narration.wav",
            expect.any(Blob),
            expect.objectContaining({
                contentType: "audio/wav",
                upsert: true,
            })
        );

        expect(contentUpdateMock).toHaveBeenCalledWith({
            audio_url: "https://example.supabase.co/storage/v1/object/public/audio/generated/11111111-1111-1111-1111-111111111111/ai-narration.wav",
        });
        expect(contentUpdateEqMock).toHaveBeenCalledWith("id", "11111111-1111-1111-1111-111111111111");
        expect(revalidatePathMock).toHaveBeenCalledWith("/read/11111111-1111-1111-1111-111111111111");
    });

    it("rejects draft content", async () => {
        (getAdminClient as any).mockReturnValue({
            from: vi.fn(() => ({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnThis(),
                    is: vi.fn().mockReturnThis(),
                    order: vi.fn().mockReturnThis(),
                    single: vi.fn().mockResolvedValue({
                        data: {
                            id: "11111111-1111-1111-1111-111111111111",
                            title: "Draft summary",
                            author: null,
                            status: "draft",
                            quick_mode_json: null,
                            segments: [],
                        },
                        error: null,
                    }),
                }),
                update: contentUpdateMock,
            })),
            storage: {
                from: vi.fn(() => ({
                    upload: uploadMock,
                    getPublicUrl: getPublicUrlMock,
                    remove: removeMock,
                })),
            },
        });

        const req = new NextRequest("http://localhost/api/admin/content/11111111-1111-1111-1111-111111111111/narration", {
            method: "POST",
        });

        const res = await POST(req, {
            params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
        });

        expect(res.status).toBe(400);
        expect(uploadMock).not.toHaveBeenCalled();
    });

    it("sanitizes provider failures before returning them to the client", async () => {
        vi.useFakeTimers();
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({
                error: {
                    message: "internal upstream path: /var/task/runtime/provider-secret",
                },
            }),
        }) as any;

        const req = new NextRequest("http://localhost/api/admin/content/11111111-1111-1111-1111-111111111111/narration", {
            method: "POST",
        });

        const responsePromise = POST(req, {
            params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
        });

        await vi.runAllTimersAsync();
        const res = await responsePromise;
        const json = await res.json();

        expect(res.status).toBe(503);
        expect(json.error.message).toBe("The AI voice provider is temporarily unavailable. Please try again.");
        expect(json.error.message).not.toContain("/var/task/runtime");

        vi.useRealTimers();
    });

    it("removes the uploaded narration file if saving audio_url fails", async () => {
        contentUpdateEqMock.mockResolvedValueOnce({
            error: { message: "database write failed" },
        });

        const req = new NextRequest("http://localhost/api/admin/content/11111111-1111-1111-1111-111111111111/narration", {
            method: "POST",
        });

        const res = await POST(req, {
            params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
        });

        expect(res.status).toBe(500);
        expect(removeMock).toHaveBeenCalledWith([
            "generated/11111111-1111-1111-1111-111111111111/ai-narration.wav",
        ]);
    });
});
