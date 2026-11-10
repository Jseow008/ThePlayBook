import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { APP_NAME } from "@/lib/brand";

export type OgFont = {
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
};

export const cacheControl = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const ogRouteAssetDir = path.join(process.cwd(), "app/api/og/content/[id]");
const COVER_PATH = /^\/storage\/v1\/object\/public\/media\/covers\/[a-zA-Z0-9._-]+\.[a-zA-Z0-9]+$/;
const COVER_DOWNLOAD_LIMIT = 5 * 1024 * 1024;
const COVER_INPUT_PIXELS = 16_000_000;
const COVER_RENDER_SIZE = 1200;
const COVER_DOWNLOAD_TIMEOUT_MS = 5_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COVER_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export async function bufferImageResponse(image: Response) {
    const body = await image.arrayBuffer();
    return new Response(body, {
        status: image.status,
        statusText: image.statusText,
        headers: image.headers,
    });
}

export async function encodeJpegImageResponse(image: Response, quality = 85) {
    const jpegBody = await sharp(Buffer.from(await image.arrayBuffer()))
        .jpeg({ quality })
        .toBuffer();
    const headers = new Headers(image.headers);
    headers.set("Content-Type", "image/jpeg");
    headers.set("Content-Length", jpegBody.byteLength.toString());

    return new Response(jpegBody, {
        status: image.status,
        statusText: image.statusText,
        headers,
    });
}

export const fontPromise = loadOgFonts();
export const logoPromise = loadLocalImageDataUrl(
    path.join(process.cwd(), "public/icons/netflux-icon-borderless.png"),
    "Netflux icon"
);

async function loadLocalFont(filePath: string, label: string): Promise<ArrayBuffer> {
    try {
        const data = await readFile(filePath);
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    } catch (error) {
        throw new Error(`Failed to load local OG font: ${label}`, { cause: error });
    }
}

async function loadLocalImageDataUrl(filePath: string, label: string): Promise<string> {
    try {
        const data = await readFile(filePath);
        return `data:image/png;base64,${data.toString("base64")}`;
    } catch (error) {
        throw new Error(`Failed to load local OG image: ${label}`, { cause: error });
    }
}

async function loadOgFonts(): Promise<OgFont[]> {
    const [interRegular, interBold, outfitBold] = await Promise.all([
        loadLocalFont(path.join(ogRouteAssetDir, "fonts/Inter-Regular.woff"), "Inter Regular"),
        loadLocalFont(path.join(ogRouteAssetDir, "fonts/Inter-Bold.woff"), "Inter Bold"),
        loadLocalFont(path.join(ogRouteAssetDir, "fonts/Outfit-Bold.woff"), "Outfit Bold"),
    ]);

    return [
        { name: "Inter", data: interRegular, weight: 400, style: "normal" },
        { name: "Inter", data: interBold, weight: 700, style: "normal" },
        { name: "Outfit", data: outfitBold, weight: 700, style: "normal" },
    ];
}

export function normalizeLabel(value: string | null) {
    if (!value) return "Reading";
    return value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function clampText(value: string, maxLength: number) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3).trim()}...`;
}

export function buildCoverFallback(title: string, brandFont: string) {
    const initial = title.trim().charAt(0).toUpperCase() || "N";

    return (
        <div
            style={{
                alignItems: "center",
                background: "linear-gradient(145deg, #27272a 0%, #111113 100%)",
                color: "#fafafa",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                justifyContent: "center",
                width: "100%",
            }}
        >
            <div
                style={{
                    alignItems: "center",
                    border: "1px solid rgba(250, 250, 250, 0.18)",
                    borderRadius: 999,
                    display: "flex",
                    fontFamily: brandFont,
                    fontSize: 92,
                    fontWeight: 700,
                    height: 164,
                    justifyContent: "center",
                    width: 164,
                }}
            >
                {initial}
            </div>
            <div
                style={{
                    color: "rgba(250, 250, 250, 0.62)",
                    fontSize: 22,
                    letterSpacing: 0,
                    marginTop: 34,
                }}
            >
                {APP_NAME}
            </div>
        </div>
    );
}

function matchesCoverFormat(image: Buffer, contentType: string) {
    switch (contentType) {
        case "image/jpeg":
            return image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
        case "image/png":
            return image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
        case "image/webp":
            return image.toString("latin1", 0, 4) === "RIFF" && image.toString("latin1", 8, 12) === "WEBP";
        case "image/gif":
            return ["GIF87a", "GIF89a"].includes(image.toString("latin1", 0, 6));
        case "image/avif": {
            if (image.length < 16 || image.toString("latin1", 4, 8) !== "ftyp") return false;
            const boxSize = image.readUInt32BE(0);
            if (boxSize < 16 || boxSize > image.length) return false;
            const isAvifBrand = (offset: number) => ["avif", "avis"].includes(image.toString("latin1", offset, offset + 4));
            if (isAvifBrand(8)) return true;
            for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
                if (isAvifBrand(offset)) return true;
            }
            return false;
        }
        default:
            return false;
    }
}

async function readCoverBody(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) return Buffer.concat(chunks, size);
            size += value.byteLength;
            if (size > COVER_DOWNLOAD_LIMIT) {
                await reader.cancel();
                return null;
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
}

export async function getImageDataUrl(url: string): Promise<string | null> {
    try {
        const cover = new URL(url);
        const storageOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
        if (cover.protocol !== "https:" || cover.origin !== storageOrigin || cover.port
            || cover.username || cover.password || cover.search || cover.hash || !COVER_PATH.test(cover.pathname)) {
            return null;
        }

        const response = await fetch(cover, {
            headers: { Accept: "image/jpeg, image/png, image/webp, image/gif, image/avif" },
            redirect: "manual",
            cache: "no-store",
            signal: AbortSignal.timeout(COVER_DOWNLOAD_TIMEOUT_MS),
        });
        const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
        if (!response.ok || !contentType || !COVER_MIME_TYPES.has(contentType)
            || Number(response.headers.get("content-length")) > COVER_DOWNLOAD_LIMIT) {
            await response.body?.cancel();
            return null;
        }
        if (!response.body) return null;

        const image = await readCoverBody(response.body);
        if (!image || !matchesCoverFormat(image, contentType)) return null;

        // Decode a bounded raster before handing it to the share renderer.
        const png = await sharp(image, { limitInputPixels: COVER_INPUT_PIXELS })
            .autoOrient()
            .resize(COVER_RENDER_SIZE, COVER_RENDER_SIZE, { fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
        return `data:image/png;base64,${png.toString("base64")}`;
    } catch {
        return null;
    }
}
