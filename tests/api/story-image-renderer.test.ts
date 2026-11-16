import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
    buildStoryImageRenderVersion,
    buildStoryImageStoragePath,
    renderStoryImageJpeg,
    STORY_IMAGE_HEIGHT,
    STORY_IMAGE_WIDTH,
} from "@/lib/server/story-image-renderer";

const content = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Atomic Habits Summary",
    author: "James Clear",
    category: "Personal Growth",
    cover_image_url: null,
    type: "book",
    duration_seconds: 720,
};

beforeAll(() => {
    vi.stubGlobal("TextEncoder", class {
        encode(value: string) {
            return Buffer.from(value);
        }
    });
});

describe("story image renderer", () => {
    it("creates a stable version and deterministic storage path", () => {
        const version = buildStoryImageRenderVersion(content);

        expect(version).toMatch(/^[a-f0-9]{24}$/);
        expect(buildStoryImageRenderVersion({ ...content })).toBe(version);
        expect(buildStoryImageStoragePath(content.id, version)).toBe(
            `story-images/${content.id}/${version}.jpg`
        );
    });

    it("changes the version when an image-affecting field changes", () => {
        const version = buildStoryImageRenderVersion(content);

        expect(buildStoryImageRenderVersion({ ...content, title: "A revised title" })).not.toBe(version);
        expect(buildStoryImageRenderVersion({ ...content, cover_image_url: "https://example.com/cover.jpg" })).not.toBe(version);
    });

    it("renders a share-compatible 1080 by 1920 JPEG", async () => {
        const jpeg = await renderStoryImageJpeg(content);
        const metadata = await sharp(jpeg).metadata();

        expect(metadata.format).toBe("jpeg");
        expect(metadata.width).toBe(STORY_IMAGE_WIDTH);
        expect(metadata.height).toBe(STORY_IMAGE_HEIGHT);
        expect(jpeg.byteLength).toBeLessThan(5 * 1024 * 1024);
    }, 30_000);

    it("keeps the broad background uniformly charcoal after JPEG encoding", async () => {
        const jpeg = await renderStoryImageJpeg(content);
        const { data } = await sharp(jpeg)
            .extract({ left: 40, top: 1500, width: 1, height: 400 })
            .raw()
            .toBuffer({ resolveWithObject: true });
        const colors = new Set<string>();
        for (let offset = 0; offset < data.length; offset += 3) {
            colors.add(data.subarray(offset, offset + 3).toString("hex"));
        }
        expect(colors.size).toBe(1);
        expect([...colors][0]).toBe("111113");
    }, 30_000);

    it("renders the remainder of long author credits instead of the previous ellipsis", async () => {
        const author = "Ben Gilbert and David Rosenthal with Jamie Dimon, Andrew Ross Sorkin, Meredith Kopit Levien, and Barry Diller";
        const full = await renderStoryImageJpeg({ ...content, author });
        const truncated = await renderStoryImageJpeg({ ...content, author: `${author.slice(0, 45)}...` });
        expect(full.equals(truncated)).toBe(false);
        const metadata = await sharp(full).metadata();
        expect(metadata.width).toBe(STORY_IMAGE_WIDTH);
        expect(metadata.height).toBe(STORY_IMAGE_HEIGHT);
    }, 30_000);
});
