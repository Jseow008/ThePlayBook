import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { GET } from "@/app/api/media/cover/route";
const { admission } = vi.hoisted(() => ({ admission: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({ strictPublicRateLimit: admission, rateLimitFailureResponse: () => new Response(null, { status: 429 }) }));
const request = (query = "file=test.jpg&w=256") => new NextRequest(`http://localhost/api/media/cover?${query}`);
let source: Buffer;
beforeEach(async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    admission.mockReset().mockResolvedValue({ success: true });
    source = await sharp({ create: { width: 1600, height: 2400, channels: 3, background: "#345678" } }).jpeg().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(source), { headers: { "Content-Type": "image/jpeg" } })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("cover image route", () => {
    it.each([256, 400, 700, 1280])("serves a bounded, cacheable %i pixel WebP", async width => {
        const response = await GET(request(`file=test.jpg&w=${width}`));
        expect(response.status).toBe(200);
        const image = Buffer.from(await response.arrayBuffer());
        const metadata = await sharp(image).metadata();
        expect(metadata.format).toBe("webp");
        expect(metadata.width).toBe(width);
        expect(image.length).toBeLessThan(source.length);
        expect(response.headers.get("Cache-Control")).toContain("s-maxage=2592000");
        expect(fetch).toHaveBeenCalledWith(new URL("https://test.supabase.co/storage/v1/object/public/media/covers/test.jpg"), expect.objectContaining({ redirect: "error" }));
    });
    it.each(["file=../secret.jpg&w=256", "file=test.jpg%0A&w=256", "file=https://evil.test/a.jpg&w=256", "file=foo.svg&w=256", "file=test.jpg&w=257", "file=test.jpg&w=0256", "file=test.jpg&w=256&x=1", "file=x.jpg&file=y.jpg&w=256"])("rejects unsafe/noncanonical input %s before work", async query => {
        expect((await GET(request(query))).status).toBe(400);
        expect(admission).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
    it("does not fetch when admission rejects", async () => {
        admission.mockResolvedValue({ success: false });
        const response = await GET(request());
        expect(response.status).toBe(429);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(fetch).not.toHaveBeenCalled();
    });
    it("does not cache missing files or redirect/fetch failures", async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 })).mockRejectedValueOnce(new Error("redirect"));
        expect((await GET(request())).status).toBe(404);
        const response = await GET(request());
        expect(response.status).toBe(502);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
    it("rejects non-raster types, oversize declarations, oversized streams and corrupt data", async () => {
        for (const fixture of [
            new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
            new Response("x", { headers: { "Content-Type": "image/jpeg", "Content-Length": "99999999" } }),
            new Response(new Uint8Array(8 * 1024 * 1024 + 1), { headers: { "Content-Type": "image/jpeg" } }),
            new Response("broken", { headers: { "Content-Type": "image/jpeg" } }),
        ]) {
            vi.mocked(fetch).mockResolvedValueOnce(fixture);
            const response = await GET(request());
            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.headers.get("Cache-Control")).toBe("no-store");
        }
    });
});
