import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/public-server", () => ({
    createPublicServerClient: vi.fn(),
}));

import { encodeJpegImageResponse } from "@/app/api/og/content/[id]/og-content-image-utils";

const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
);

describe("encodeJpegImageResponse", () => {
    it("returns a JPEG body while preserving response metadata", async () => {
        const source = new Response(onePixelPng, {
            status: 200,
            headers: {
                "Cache-Control": "public, max-age=300",
                "Content-Disposition": "inline; filename=story.jpg",
                "Content-Type": "image/png",
            },
        });

        const response = await encodeJpegImageResponse(source, 85);
        const body = Buffer.from(await response.arrayBuffer());

        expect(response.headers.get("Content-Type")).toBe("image/jpeg");
        expect(response.headers.get("Content-Length")).toBe(body.byteLength.toString());
        expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
        expect(response.headers.get("Content-Disposition")).toBe("inline; filename=story.jpg");
        expect([...body.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    });
});
