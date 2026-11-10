import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/og/content/[id]/story/route";
import { getContent } from "@/app/api/og/content/[id]/og-content-image-utils";
import { strictPublicRateLimit } from "@/lib/server/rate-limit";
import { createStoryImageJpegResponse } from "@/lib/server/story-image-renderer";
import { findCompletedStoryImage, markStoryImageVersionCompleted } from "@/lib/server/story-image-queue";
import { storedStoryImageExists, storeStoryImage } from "@/lib/server/story-image-storage";

vi.mock("@/lib/supabase/public-server", () => ({ createPublicServerClient: vi.fn() }));

vi.mock("@/app/api/og/content/[id]/og-content-image-utils", async (original) => {
    return {
        ...await original<typeof import("@/app/api/og/content/[id]/og-content-image-utils")>(),
        getContent: vi.fn(),
    };
});

vi.mock("@/lib/server/api", () => ({ logApiError: vi.fn() }));

vi.mock("@/lib/server/rate-limit", async (original) => ({
    ...await original<typeof import("@/lib/server/rate-limit")>(),
    strictPublicRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/story-image-renderer", () => ({
    buildStoryImageRenderVersion: vi.fn(() => "aaaaaaaaaaaaaaaaaaaaaaaa"),
    buildStoryImageStoragePath: vi.fn((id: string, version: string) => `story-images/${id}/${version}.jpg`),
    createStoryImageJpegResponse: vi.fn(),
}));

vi.mock("@/lib/server/story-image-queue", () => ({
    findCompletedStoryImage: vi.fn(),
    markStoryImageVersionCompleted: vi.fn(),
}));

vi.mock("@/lib/server/story-image-storage", () => ({
    getStoryImagePublicUrl: vi.fn((path: string) => `https://storage.example.com/${path}`),
    storedStoryImageExists: vi.fn(),
    storeStoryImage: vi.fn(),
}));

const content = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Atomic Habits Summary",
    author: "James Clear",
    category: "Personal Growth",
    cover_image_url: null,
    type: "book",
    duration_seconds: 720,
};

function request() {
    return new NextRequest(`http://localhost/api/og/content/${content.id}/story`);
}

describe("story image route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(strictPublicRateLimit).mockResolvedValue({ success: true } as never);
        vi.mocked(getContent).mockResolvedValue(content);
    });

    it("redirects to an existing immutable stored image", async () => {
        vi.mocked(findCompletedStoryImage).mockResolvedValue({
            storage_path: `story-images/${content.id}/aaaaaaaaaaaaaaaaaaaaaaaa.jpg`,
        } as never);
        vi.mocked(storedStoryImageExists).mockResolvedValue(true);

        const response = await GET(request(), { params: Promise.resolve({ id: content.id }) });

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            `https://storage.example.com/story-images/${content.id}/aaaaaaaaaaaaaaaaaaaaaaaa.jpg`
        );
        expect(createStoryImageJpegResponse).not.toHaveBeenCalled();
    });

    it("enforces the same 30-request limit across titles for one trusted IP", async () => {
        const { strictPublicRateLimit: realRateLimit } =
            await vi.importActual<typeof import("@/lib/server/rate-limit")>("@/lib/server/rate-limit");
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("VERCEL", "1");
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
        vi.mocked(strictPublicRateLimit).mockImplementation(realRateLimit);
        vi.mocked(getContent).mockImplementation(async id => ({ ...content, id }));
        vi.mocked(findCompletedStoryImage).mockImplementation(async ({ contentId }) => ({
            storage_path: `story-images/${contentId}/aaaaaaaaaaaaaaaaaaaaaaaa.jpg`,
        }) as never);
        vi.mocked(storedStoryImageExists).mockResolvedValue(true);

        const firstTitle = content.id;
        const secondTitle = "22222222-2222-2222-2222-222222222222";
        const thirdTitle = "33333333-3333-3333-3333-333333333333";
        const get = (id: string, ip = "192.0.2.31") => GET(
            new NextRequest(`http://localhost/api/og/content/${id}/story`, {
                headers: { "x-vercel-forwarded-for": ip },
            }),
            { params: Promise.resolve({ id }) },
        );

        try {
            for (let i = 0; i < 29; i++) expect((await get(firstTitle)).status).toBe(307);
            expect((await get(secondTitle)).status).toBe(307);

            const blocked = await get(thirdTitle);
            expect(blocked.status).toBe(429);
            expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
            expect(await blocked.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
            expect((await get(firstTitle)).status).toBe(429);
            expect(getContent).toHaveBeenCalledTimes(30);
            expect(createStoryImageJpegResponse).not.toHaveBeenCalled();

            expect((await get(thirdTitle, "192.0.2.32")).status).toBe(307);
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it("renders and stores a write-through fallback when the version is missing", async () => {
        const jpeg = new Uint8Array([255, 216, 255, 217]);
        vi.mocked(findCompletedStoryImage).mockResolvedValue(null);
        vi.mocked(createStoryImageJpegResponse).mockResolvedValue(new Response(jpeg, {
            headers: { "Content-Type": "image/jpeg" },
        }));
        vi.mocked(storeStoryImage).mockResolvedValue("https://storage.example.com/image.jpg");
        vi.mocked(markStoryImageVersionCompleted).mockResolvedValue({} as never);

        const response = await GET(request(), { params: Promise.resolve({ id: content.id }) });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/jpeg");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(jpeg);
        expect(storeStoryImage).toHaveBeenCalledWith(expect.objectContaining({
            storagePath: `story-images/${content.id}/aaaaaaaaaaaaaaaaaaaaaaaa.jpg`,
        }));
        expect(markStoryImageVersionCompleted).toHaveBeenCalledWith({
            contentId: content.id,
            renderVersion: "aaaaaaaaaaaaaaaaaaaaaaaa",
            storagePath: `story-images/${content.id}/aaaaaaaaaaaaaaaaaaaaaaaa.jpg`,
        });
    });
});
