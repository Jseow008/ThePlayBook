import type { ImageLoaderProps } from "next/image";

export const COVER_WIDTHS = [32, 48, 96, 112, 150, 224, 256, 400, 640, 700, 768, 1024, 1280] as const;

// Only this application's public cover bucket is eligible for image processing.
export function publicCoverPath(src: string): string | null {
    try {
        const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
        const url = new URL(src);
        const prefix = "/storage/v1/object/public/media/covers/";
        if (url.origin !== origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(prefix)) return null;
        const path = url.pathname.slice(prefix.length);
        return /^[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|avif)$/i.test(path) ? path : null;
    } catch { return null; }
}

export function coverImageLoader({ src, width }: ImageLoaderProps) {
    const path = publicCoverPath(src);
    return path ? `/api/media/cover?file=${encodeURIComponent(path)}&w=${width}` : src;
}
