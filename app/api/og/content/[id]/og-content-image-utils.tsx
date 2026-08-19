import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export {
    bufferImageResponse,
    buildCoverFallback,
    cacheControl,
    clampText,
    encodeJpegImageResponse,
    fontPromise,
    getImageDataUrl,
    logoPromise,
    normalizeLabel,
} from "@/lib/server/og-image-rendering";
export type { OgFont } from "@/lib/server/og-image-rendering";

export interface OgContent {
    id: string;
    title: string;
    author: string | null;
    category: string | null;
    cover_image_url: string | null;
    type: string;
    duration_seconds: number | null;
}

export const ContentIdSchema = z.string().uuid();

export async function getContent(id: string): Promise<OgContent | null> {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
        .from("content_item")
        .select("id, title, author, category, cover_image_url, type, duration_seconds")
        .eq("id", id)
        .eq("status", "verified")
        .is("deleted_at", null)
        .single();

    if (error || !data) return null;
    return data as OgContent;
}
