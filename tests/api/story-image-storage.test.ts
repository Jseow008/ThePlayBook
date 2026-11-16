import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupOldStoryImageVersions } from "@/lib/server/story-image-storage";
import { buildStoryImageRenderVersion, buildStoryImageStoragePath } from "@/lib/server/story-image-renderer";
import { findCompletedStoryImage, loadVerifiedStoryImageContent } from "@/lib/server/story-image-queue";
import { getAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: vi.fn() }));
vi.mock("@/lib/server/story-image-queue", () => ({ findCompletedStoryImage: vi.fn(), loadVerifiedStoryImageContent: vi.fn() }));

const content = { id: "11111111-1111-1111-1111-111111111111", title: "Synthetic replacement", author: "Test", category: "Psychology", cover_image_url: null, type: "book", duration_seconds: 180 };
const currentPath = buildStoryImageStoragePath(content.id, buildStoryImageRenderVersion(content));
const oldName = "a".repeat(24) + ".jpg";
const newerName = "b".repeat(24) + ".jpg";
const list = vi.fn();
const remove = vi.fn();

describe("story image replacement cleanup", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { headers: { "content-type": "image/jpeg" } })));
        vi.mocked(getAdminClient).mockReturnValue({ storage: { from: () => ({ list, remove, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://storage.example.com/${p}` } }) }) } } as never);
        vi.mocked(loadVerifiedStoryImageContent).mockResolvedValue(content);
        vi.mocked(findCompletedStoryImage).mockResolvedValue({ storage_path: currentPath } as never);
        list.mockResolvedValue({ data: [
            { name: currentPath.split("/").at(-1), created_at: "2026-11-16T12:00:00Z" },
            { name: oldName, created_at: "2026-11-15T12:00:00Z" },
            { name: newerName, created_at: "2026-11-17T12:00:00Z" },
            { name: "unrelated.jpg", created_at: "2026-11-14T12:00:00Z" },
        ], error: null });
        remove.mockResolvedValue({ error: null });
    });

    it("removes only older versions after the current image is completed and available", async () => {
        expect(await cleanupOldStoryImageVersions({ contentId: content.id, currentStoragePath: currentPath })).toEqual({ removed: 1 });
        expect(remove).toHaveBeenCalledWith([`story-images/${content.id}/${oldName}`]);
        expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "HEAD" }));
    });

    it.each(["missing", "inaccessible", "unfinished", "superseded", "changed during listing"])("preserves every image if replacement is %s", async (state) => {
        if (state === "missing") vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
        if (state === "inaccessible") vi.mocked(fetch).mockRejectedValue(new Error("network unavailable"));
        if (state === "unfinished") vi.mocked(findCompletedStoryImage).mockResolvedValue(null);
        if (state === "superseded") vi.mocked(loadVerifiedStoryImageContent).mockResolvedValue({ ...content, title: "Newer title" });
        if (state === "changed during listing") vi.mocked(loadVerifiedStoryImageContent).mockResolvedValueOnce(content).mockResolvedValue({ ...content, title: "Newer title" });
        expect(await cleanupOldStoryImageVersions({ contentId: content.id, currentStoragePath: currentPath })).toEqual({ removed: 0 });
        expect(remove).not.toHaveBeenCalled();
    });

    it("retains objects when the replacement is missing from the listing", async () => {
        list.mockResolvedValue({ data: [{ name: oldName, created_at: "2026-11-15T12:00:00Z" }], error: null });
        expect(await cleanupOldStoryImageVersions({ contentId: content.id, currentStoragePath: currentPath })).toEqual({ removed: 0 });
        expect(remove).not.toHaveBeenCalled();
    });

    it("surfaces deletion failures without changing completion records", async () => {
        remove.mockResolvedValue({ error: new Error("delete failed") });
        await expect(cleanupOldStoryImageVersions({ contentId: content.id, currentStoragePath: currentPath })).rejects.toThrow("delete failed");
    });
});
