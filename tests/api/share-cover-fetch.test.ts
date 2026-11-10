import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getLandscapeImage } from "@/app/api/og/content/[id]/route";
import { getContent } from "@/app/api/og/content/[id]/og-content-image-utils";
import { getImageDataUrl } from "@/lib/server/og-image-rendering";
import { renderStoryImageJpeg } from "@/lib/server/story-image-renderer";

vi.mock("@/lib/supabase/public-server", () => ({ createPublicServerClient: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({
    strictPublicRateLimit: vi.fn().mockResolvedValue({ success: true }),
    rateLimitFailureResponse: vi.fn(),
}));
vi.mock("@/app/api/og/content/[id]/og-content-image-utils", async (original) => ({
    ...await original<typeof import("@/app/api/og/content/[id]/og-content-image-utils")>(),
    getContent: vi.fn(),
}));

const STORAGE_ORIGIN = "https://netflux-test.supabase.co";
const COVER_URL = `${STORAGE_ORIGIN}/storage/v1/object/public/media/covers/test.jpg`;
const DOWNLOAD_LIMIT = 5 * 1024 * 1024;
const fetchMock = vi.fn<typeof fetch>();
const realFetch = globalThis.fetch;

function makeCover() {
    return sharp({ create: { width: 120, height: 180, channels: 3, background: "#ff6040" } });
}

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        // The OG renderer loads its embedded WebAssembly through fetch.
        return url.startsWith("data:") ? realFetch(input, init) : fetchMock(input, init);
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", STORAGE_ORIGIN);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("share cover fetch", () => {
    it.each([
        "http://netflux-test.supabase.co/storage/v1/object/public/media/covers/test.jpg",
        "https://netflux-test.supabase.co.evil.test/storage/v1/object/public/media/covers/test.jpg",
        "https://127.0.0.1/storage/v1/object/public/media/covers/test.jpg",
        "https://user:pass@netflux-test.supabase.co/storage/v1/object/public/media/covers/test.jpg",
        "https://netflux-test.supabase.co/storage/v1/object/public/media/story-images/test.jpg",
        "https://netflux-test.supabase.co/storage/v1/object/public/media/covers/%2e%2e%2fother/test.jpg",
        `${COVER_URL}?token=unexpected`,
    ])("rejects an unapproved URL before making a request (%s)", async (url) => {
        await expect(getImageDataUrl(url)).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a redirect without making a second request", async () => {
        const cancel = vi.fn();
        fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }), {
            status: 302,
            headers: { Location: "http://127.0.0.1/private" },
        }));

        await expect(getImageDataUrl(COVER_URL)).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledExactlyOnceWith(new URL(COVER_URL), expect.objectContaining({
            redirect: "manual", cache: "no-store", signal: expect.any(AbortSignal),
        }));
        expect(cancel).toHaveBeenCalledOnce();
    });

    it("rejects an oversized declared length before reading", async () => {
        const cancel = vi.fn();
        fetchMock.mockResolvedValue(new Response(new ReadableStream({ cancel }), {
            headers: { "Content-Type": "image/jpeg", "Content-Length": String(DOWNLOAD_LIMIT + 1) },
        }));

        await expect(getImageDataUrl(COVER_URL)).resolves.toBeNull();
        expect(cancel).toHaveBeenCalledOnce();
    });

    it.each([undefined, "1024"])("cancels a body that exceeds the limit despite its length header (%s)", async (length) => {
        const cancel = vi.fn();
        const headers = new Headers({ "Content-Type": "image/jpeg" });
        if (length) headers.set("Content-Length", length);
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(DOWNLOAD_LIMIT));
                controller.enqueue(new Uint8Array(1));
            },
            cancel,
        });
        fetchMock.mockResolvedValue(new Response(body, { headers }));

        await expect(getImageDataUrl(COVER_URL)).resolves.toBeNull();
        expect(cancel).toHaveBeenCalledOnce();
    });

    it.each([
        ["image/svg+xml", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>"],
        ["image/png", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>"],
        ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0x00])],
    ])("rejects unsupported, mislabeled and corrupt image data (%s)", async (type, bytes) => {
        fetchMock.mockResolvedValue(new Response(bytes, { headers: { "Content-Type": type } }));
        await expect(getImageDataUrl(COVER_URL)).resolves.toBeNull();
    });

    it.each(["jpeg", "png", "webp", "gif", "avif"] as const)("normalizes a valid %s cover to PNG", async (format) => {
        const image = await makeCover().toFormat(format).toBuffer();
        fetchMock.mockResolvedValue(new Response(new Uint8Array(image), { headers: { "Content-Type": `image/${format}` } }));

        const result = await getImageDataUrl(COVER_URL);
        expect(result).toMatch(/^data:image\/png;base64,/);
        const rendered = Buffer.from(result!.split(",")[1], "base64");
        await expect(sharp(rendered).metadata()).resolves.toMatchObject({ format: "png", width: 120, height: 180 });
    });

    it("rejects a small download whose decoded dimensions exceed the pixel limit", async () => {
        const image = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "red" } }).png().toBuffer();
        expect(image.byteLength).toBeLessThan(DOWNLOAD_LIMIT);
        fetchMock.mockResolvedValue(new Response(new Uint8Array(image), { headers: { "Content-Type": "image/png" } }));
        await expect(getImageDataUrl(COVER_URL)).resolves.toBeNull();
    });

    it("keeps the timeout failure on the fallback path", async () => {
        fetchMock.mockRejectedValue(new DOMException("Cover fetch timed out", "TimeoutError"));
        await expect(getImageDataUrl(COVER_URL)).resolves.toBeNull();
    });
});

describe("generated share images", () => {
    it.each([true, false])("generates both formats when the cover is allowed=%s", async (allowed) => {
        vi.stubGlobal("TextEncoder", class {
            encode(value: string) { return Buffer.from(value); }
        });
        const cover = await makeCover().jpeg().toBuffer();
        const content = {
            id: "11111111-1111-4111-8111-111111111111",
            title: "Synthetic share cover",
            author: "Example author",
            category: "History",
            cover_image_url: allowed ? COVER_URL : "https://unapproved.example/cover.jpg",
            type: "book",
            duration_seconds: 420,
        };
        fetchMock.mockImplementation(async () => new Response(new Uint8Array(cover), {
            headers: { "Content-Type": "image/jpeg" },
        }));
        vi.mocked(getContent).mockResolvedValue(content);

        const response = await getLandscapeImage(new NextRequest(`http://localhost/api/og/content/${content.id}`), {
            params: Promise.resolve({ id: content.id }),
        });
        expect(response.status).toBe(200);
        const landscape = Buffer.from(await response.arrayBuffer());
        const story = await renderStoryImageJpeg(content);

        await expect(sharp(landscape).metadata()).resolves.toMatchObject({ format: "png", width: 1200, height: 630 });
        await expect(sharp(story).metadata()).resolves.toMatchObject({ format: "jpeg", width: 1080, height: 1920 });
        for (const [image, x, y] of [[landscape, 120, 260], [story, 330, 460]] as const) {
            const pixel = await sharp(image).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
            expect(pixel[0] > 200 && pixel[1] < 135 && pixel[2] < 110).toBe(allowed);
        }
        expect(fetchMock).toHaveBeenCalledTimes(allowed ? 2 : 0);
    }, 30_000);
});
