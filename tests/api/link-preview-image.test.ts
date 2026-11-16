import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/supabase/public-server", () => ({ createPublicServerClient: vi.fn() }));
vi.mock("@/lib/server/rate-limit", () => ({
    strictPublicRateLimit: vi.fn().mockResolvedValue({ success: true }),
    rateLimitFailureResponse: vi.fn(),
}));
vi.mock("@/app/api/og/content/[id]/og-content-image-utils", async (original) => ({
    ...await original<typeof import("@/app/api/og/content/[id]/og-content-image-utils")>(),
    getContent: vi.fn(),
    getImageDataUrl: vi.fn().mockResolvedValue(null),
}));

import { GET } from "@/app/api/og/content/[id]/route";
import { getContent } from "@/app/api/og/content/[id]/og-content-image-utils";

const content = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Crucial Conversations",
    author: "Kerry Patterson, Joseph Grenny, Ron McMillan, and Al Switzler",
    category: "Relationships & Communication",
    cover_image_url: null,
    type: "book",
    duration_seconds: 300,
};
const request = new Request("https://netflux.test/api/og/content/" + content.id) as NextRequest;
const context = { params: Promise.resolve({ id: content.id }) };

beforeEach(() => {
    vi.mocked(getContent).mockResolvedValue(content);
    vi.stubGlobal("TextEncoder", class { encode(value: string) { return Buffer.from(value); } });
});

describe("landscape link preview", () => {
    it("renders 1200 by 630 PNG with uniform broad charcoal and unchanged cache policy", async () => {
        const response = await GET(request, context);
        expect(response.headers.get("Cache-Control")).toBe("public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
        const image = Buffer.from(await response.arrayBuffer());
        expect(await sharp(image).metadata()).toMatchObject({ width: 1200, height: 630, format: "png" });
        for (const [left, top] of [[0, 0], [1199, 0], [1199, 400], [800, 629]]) {
            const pixel = await sharp(image).extract({ left, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
            expect(pixel.toString("hex")).toBe("111113");
        }
    }, 30_000);

    it("renders credits beyond the old 52-character cutoff", async () => {
        const full = Buffer.from(await (await GET(request, context)).arrayBuffer());
        vi.mocked(getContent).mockResolvedValue({ ...content, author: content.author.slice(0, 52) + "..." });
        const truncated = Buffer.from(await (await GET(request, context)).arrayBuffer());
        // Compare the credit region, excluding cover, title and footer.
        const region = { left: 470, top: 290, width: 600, height: 140 };
        const fullCredits = await sharp(full).extract(region).raw().toBuffer();
        const truncatedCredits = await sharp(truncated).extract(region).raw().toBuffer();
        expect(fullCredits.equals(truncatedCredits)).toBe(false);
    }, 30_000);

    it("keeps unavailable content unavailable instead of rendering a preview", async () => {
        vi.mocked(getContent).mockResolvedValue(null);
        const response = await GET(request, context);
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("Content not found");
    });
});
