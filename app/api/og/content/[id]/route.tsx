import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";
import { z } from "zod";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export const runtime = "nodejs";

interface RouteContext {
    params: Promise<{ id: string }>;
}

interface OgContent {
    id: string;
    title: string;
    author: string | null;
    category: string | null;
    cover_image_url: string | null;
    type: string;
}

type OgFont = {
    name: string;
    data: ArrayBuffer;
    weight: 400 | 700;
    style: "normal";
};

const ContentIdSchema = z.string().uuid();
const size = { width: 1200, height: 630 };
const cacheControl = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

const fontPromise = loadOgFonts();

async function loadLocalFont(url: URL, label: string): Promise<ArrayBuffer> {
    try {
        const data = await readFile(url);
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    } catch (error) {
        throw new Error(`Failed to load local OG font: ${label}`, { cause: error });
    }
}

async function loadOgFonts(): Promise<OgFont[]> {
    const [interRegular, interBold, outfitBold] = await Promise.all([
        loadLocalFont(new URL("./fonts/Inter-Regular.woff", import.meta.url), "Inter Regular"),
        loadLocalFont(new URL("./fonts/Inter-Bold.woff", import.meta.url), "Inter Bold"),
        loadLocalFont(new URL("./fonts/Outfit-Bold.woff", import.meta.url), "Outfit Bold"),
    ]);

    return [
        { name: "Inter", data: interRegular, weight: 400, style: "normal" },
        { name: "Inter", data: interBold, weight: 700, style: "normal" },
        { name: "Outfit", data: outfitBold, weight: 700, style: "normal" },
    ];
}

function normalizeLabel(value: string | null) {
    if (!value) return "Reading";

    return value
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function clampText(value: string, maxLength: number) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3).trim()}...`;
}

function buildCoverFallback(title: string, brandFont: string) {
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

async function getImageDataUrl(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            headers: {
                Accept: "image/*",
            },
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

async function getContent(id: string): Promise<OgContent | null> {
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

export async function GET(_request: Request, context: RouteContext) {
    const { id } = await context.params;
    const parsedId = ContentIdSchema.safeParse(id);

    if (!parsedId.success) {
        return new Response("Invalid content id", { status: 400 });
    }

    const content = await getContent(parsedId.data);

    if (!content) {
        return new Response("Content not found", { status: 404 });
    }

    const fonts = await fontPromise;
    const uiFont = fonts.some((font) => font.name === "Inter") ? "Inter" : "sans-serif";
    const brandFont = fonts.some((font) => font.name === "Outfit") ? "Outfit" : uiFont;
    const title = clampText(content.title, 92);
    const author = content.author ? clampText(content.author, 56) : APP_TAGLINE;
    const badge = normalizeLabel(content.category ?? content.type);
    const coverImageSrc = content.cover_image_url ? await getImageDataUrl(content.cover_image_url) : null;
    const hasCover = Boolean(coverImageSrc);
    const titleFontSize = title.length > 72 ? 48 : title.length > 48 ? 56 : 64;

    const image = new ImageResponse(
        (
            <div
                style={{
                    background:
                        "radial-gradient(circle at 14% 18%, rgba(250, 250, 250, 0.12) 0, transparent 32%), linear-gradient(135deg, #09090b 0%, #111113 46%, #18181b 100%)",
                    color: "#fafafa",
                    display: "flex",
                    fontFamily: uiFont,
                    height: "100%",
                    overflow: "hidden",
                    padding: 64,
                    position: "relative",
                    width: "100%",
                }}
            >
                <div
                    style={{
                        background:
                            "linear-gradient(135deg, rgba(250,250,250,0.12), rgba(250,250,250,0.02))",
                        border: "1px solid rgba(250, 250, 250, 0.14)",
                        borderRadius: 32,
                        display: "flex",
                        height: "100%",
                        overflow: "hidden",
                        padding: 34,
                        position: "relative",
                        width: "100%",
                    }}
                >
                    <div
                        style={{
                            background:
                                "linear-gradient(180deg, rgba(250,250,250,0.14), rgba(250,250,250,0.03))",
                            border: "1px solid rgba(250, 250, 250, 0.16)",
                            borderRadius: 24,
                            boxShadow: "0 34px 80px rgba(0, 0, 0, 0.48)",
                            display: "flex",
                            height: 452,
                            overflow: "hidden",
                            width: 302,
                        }}
                    >
                        {hasCover ? (
                            <img
                                alt=""
                                src={coverImageSrc!}
                                style={{
                                    height: "100%",
                                    objectFit: "cover",
                                    width: "100%",
                                }}
                            />
                        ) : (
                            buildCoverFallback(content.title, brandFont)
                        )}
                    </div>

                    <div
                        style={{
                            display: "flex",
                            flex: 1,
                            flexDirection: "column",
                            justifyContent: "space-between",
                            paddingLeft: 58,
                        }}
                    >
                        <div
                            style={{
                                alignItems: "center",
                                display: "flex",
                                justifyContent: "space-between",
                                width: "100%",
                            }}
                        >
                            <div
                                style={{
                                    alignItems: "center",
                                    background: "rgba(250, 250, 250, 0.1)",
                                    border: "1px solid rgba(250, 250, 250, 0.14)",
                                    borderRadius: 999,
                                    color: "rgba(250, 250, 250, 0.78)",
                                    display: "flex",
                                    fontSize: 22,
                                    fontWeight: 700,
                                    padding: "12px 18px",
                                }}
                            >
                                {badge}
                            </div>

                            <div
                                style={{
                                    color: "rgba(250, 250, 250, 0.72)",
                                    display: "flex",
                                    fontFamily: brandFont,
                                    fontSize: 34,
                                    fontWeight: 700,
                                }}
                            >
                                {APP_NAME}
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                maxWidth: 660,
                            }}
                        >
                            <div
                                style={{
                                    color: "#fafafa",
                                    display: "flex",
                                    fontSize: titleFontSize,
                                    fontWeight: 700,
                                    letterSpacing: 0,
                                    lineHeight: 1.04,
                                    marginBottom: 26,
                                    maxHeight: 210,
                                    overflow: "hidden",
                                }}
                            >
                                {title}
                            </div>
                            <div
                                style={{
                                    color: "rgba(250, 250, 250, 0.68)",
                                    display: "flex",
                                    fontSize: 30,
                                    lineHeight: 1.28,
                                }}
                            >
                                {content.author ? `By ${author}` : author}
                            </div>
                        </div>

                        <div
                            style={{
                                alignItems: "center",
                                color: "rgba(250, 250, 250, 0.58)",
                                display: "flex",
                                fontSize: 24,
                                justifyContent: "flex-end",
                                width: "100%",
                            }}
                        >
                            <div
                                style={{
                                    background: "rgba(250, 250, 250, 0.24)",
                                    display: "flex",
                                    height: 1,
                                    marginLeft: 28,
                                    width: 210,
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        ),
        {
            ...size,
            fonts,
        }
    );

    image.headers.set("Cache-Control", cacheControl);
    return image;
}
