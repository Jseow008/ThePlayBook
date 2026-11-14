import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { COVER_WIDTHS } from "@/lib/cover-image";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const preferredRegion = "bom1";
const MAX_BYTES = 8 * 1024 * 1024;
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const file = params.get("file") ?? "";
    const width = Number(params.get("w"));
    if (params.size !== 2 || file.length > 200 || !/^[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|avif)$/i.test(file)
        || !COVER_WIDTHS.some(value => String(value) === params.get("w"))) {
        return new NextResponse(null, { status: 400, headers: noStore });
    }
    const admission = await strictPublicRateLimit(request, { limit: 120, windowMs: 60_000, routeLabel: "/api/media/cover" });
    if (!admission.success) {
        const response = rateLimitFailureResponse(admission, "Too many image requests.");
        response.headers.set("Cache-Control", "no-store");
        return response;
    }
    const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!origin) return new NextResponse(null, { status: 503, headers: noStore });
    try {
        const source = await fetch(new URL(`/storage/v1/object/public/media/covers/${file}`, origin), {
            redirect: "error", signal: AbortSignal.timeout(10_000),
        });
        if (!source.ok) return new NextResponse(null, { status: source.status === 404 ? 404 : 502, headers: noStore });
        if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(source.headers.get("content-type")?.split(";", 1)[0] ?? "") || Number(source.headers.get("content-length")) > MAX_BYTES || !source.body) {
            await source.body?.cancel();
            return new NextResponse(null, { status: 415, headers: noStore });
        }
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        const reader = source.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_BYTES) {
                await reader.cancel();
                return new NextResponse(null, { status: 413, headers: noStore });
            }
            chunks.push(value);
        }
        const image = await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 })
            .rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
        return new NextResponse(new Uint8Array(image), { headers: {
            "Content-Type": "image/webp",
            "Content-Length": String(image.byteLength),
            "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400",
            "X-Content-Type-Options": "nosniff",
        } });
    } catch {
        return new NextResponse(null, { status: 502, headers: noStore });
    }
}
