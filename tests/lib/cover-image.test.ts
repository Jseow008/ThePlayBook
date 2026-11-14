import { describe, expect, it, vi } from "vitest";
import { coverImageLoader, publicCoverPath } from "@/lib/cover-image";

describe("public cover delivery", () => {
    it("uses resized URLs only for this project's public raster covers", () => {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
        const src = "https://test.supabase.co/storage/v1/object/public/media/covers/test.jpg";
        expect(publicCoverPath(src)).toBe("test.jpg");
        expect(coverImageLoader({ src, width: 256 })).toBe("/api/media/cover?file=test.jpg&w=256");
        for (const other of [src + "?token=x", src + "#x", src.replace("test.supabase.co", "other.supabase.co"), src.replace("covers/", "private/"), src.replace("test.jpg", "../private.jpg"), src.replace("test.jpg", "image.svg")]) {
            expect(publicCoverPath(other)).toBeNull();
            expect(coverImageLoader({ src: other, width: 256 })).toBe(other);
        }
        vi.unstubAllEnvs();
    });
});
