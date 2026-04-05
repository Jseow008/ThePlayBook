import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/content/[id]/narration/route";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/server/rate-limit";

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

describe("Admin content narration API", () => {
    const contentSelectSingleMock = vi.fn();
    const updateSelectSingleMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (verifyAdminSession as any).mockResolvedValue(true);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        afterMock.mockImplementation(() => {});

        contentSelectSingleMock.mockResolvedValue({
            data: {
                id: "11111111-1111-1111-1111-111111111111",
                title: "Atomic Habits Summary",
                status: "verified",
                audio_url: "https://example.supabase.co/storage/v1/object/public/audio/generated/11111111-1111-1111-1111-111111111111/ai-narration.mp3",
                narration_status: "ready",
                narration_error: null,
                narration_requested_at: "2026-04-01T00:00:00.000Z",
                narration_started_at: "2026-04-01T00:00:03.000Z",
                narration_completed_at: "2026-04-01T00:02:00.000Z",
            },
            error: null,
        });

        updateSelectSingleMock.mockResolvedValue({
            data: {
                audio_url: "https://example.supabase.co/storage/v1/object/public/audio/generated/11111111-1111-1111-1111-111111111111/ai-narration.mp3",
                narration_status: "queued",
                narration_error: null,
                narration_requested_at: "2026-04-01T01:00:00.000Z",
                narration_started_at: null,
                narration_completed_at: null,
            },
            error: null,
        });

        (getAdminClient as any).mockReturnValue({
            from: vi.fn((table: string) => {
                if (table !== "content_item") {
                    throw new Error(`Unexpected table ${table}`);
                }

                const selectChain = {
                    eq: vi.fn(function eq() {
                        return this;
                    }),
                    is: vi.fn(function is() {
                        return this;
                    }),
                    single: contentSelectSingleMock,
                };

                const updateChain = {
                    eq: vi.fn(function eq() {
                        return this;
                    }),
                    is: vi.fn(function is() {
                        return this;
                    }),
                    select: vi.fn().mockReturnValue({
                        single: updateSelectSingleMock,
                    }),
                };

                return {
                    select: vi.fn().mockReturnValue(selectChain),
                    update: vi.fn().mockReturnValue(updateChain),
                };
            }),
        });
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

    it("queues narration generation", async () => {
        const req = new NextRequest("http://localhost/api/admin/content/11111111-1111-1111-1111-111111111111/narration", {
            method: "POST",
        });

        const res = await POST(req, {
            params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
        });

        expect(res.status).toBe(202);
        expect(rateLimit).toHaveBeenCalledWith(req, expect.objectContaining({
            limit: 10,
            windowMs: 60_000,
            key: "queue",
        }));
        expect(afterMock).toHaveBeenCalledTimes(1);

        const json = await res.json();
        expect(json.data.job.status).toBe("queued");
        expect(json.data.message).toMatch(/generation will continue in the background/i);
    });

    it("returns the persisted narration job state", async () => {
        const req = new NextRequest("http://localhost/api/admin/content/11111111-1111-1111-1111-111111111111/narration", {
            method: "GET",
        });

        const res = await GET(req, {
            params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
        });

        expect(res.status).toBe(200);
        expect(rateLimit).toHaveBeenCalledWith(req, expect.objectContaining({
            limit: 60,
            windowMs: 60_000,
            key: "status",
        }));

        const json = await res.json();
        expect(json.data.job.status).toBe("ready");
        expect(json.data.job.audio_url).toContain("/audio/generated/11111111-1111-1111-1111-111111111111/ai-narration.mp3");
    });

    it("rejects draft content", async () => {
        contentSelectSingleMock.mockResolvedValueOnce({
            data: {
                id: "11111111-1111-1111-1111-111111111111",
                title: "Draft summary",
                status: "draft",
                audio_url: null,
                narration_status: "idle",
                narration_error: null,
                narration_requested_at: null,
                narration_started_at: null,
                narration_completed_at: null,
            },
            error: null,
        });

        const req = new NextRequest("http://localhost/api/admin/content/11111111-1111-1111-1111-111111111111/narration", {
            method: "POST",
        });

        const res = await POST(req, {
            params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }),
        });

        expect(res.status).toBe(400);
    });
});
