import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { APP_NAME } from "@/lib/brand";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export interface OgContent {
    id: string;
    title: string;
    author: string | null;
    category: string | null;
    cover_image_url: string | null;
    type: string;
}

export type OgFont = {
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
};

export const ContentIdSchema = z.string().uuid();

export const cacheControl = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const ogRouteAssetDir = path.join(process.cwd(), "app/api/og/content/[id]");

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

export async function getImageDataUrl(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            headers: {
                Accept: "image/*",
            },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) return null;

        const contentType = response.headers.get("content-type");
        if (!contentType?.startsWith("image/")) return null;

        const imageBuffer = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${imageBuffer.toString("base64")}`;
    } catch {
        return null;
    }
}

export async function getContent(id: string): Promise<OgContent | null> {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
        .from("content_item")
        .select("id, title, author, category, cover_image_url, type")
        .eq("id", id)
        .eq("status", "verified")
        .is("deleted_at", null)
        .single();

    if (error || !data) {
        return null;
    }

    return data as OgContent;
}
