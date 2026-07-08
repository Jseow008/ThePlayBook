import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";
import {
    buildCoverFallback,
    cacheControl,
    clampText,
    ContentIdSchema,
    fontPromise,
    getContent,
    getImageDataUrl,
    logoPromise,
    normalizeLabel,
} from "./og-content-image-utils";

export const runtime = "nodejs";

interface RouteContext {
    params: Promise<{ id: string }>;
}

const size = { width: 1200, height: 630 };

export async function GET(request: NextRequest, context: RouteContext) {
    const rateLimitResult = await strictPublicRateLimit(request, {
        limit: 60,
        windowMs: 60_000,
        routeLabel: "content_og_image",
    });

    if (!rateLimitResult.success) {
        return rateLimitFailureResponse(rateLimitResult, "Too many image requests.");
    }

    const { id } = await context.params;
    const parsedId = ContentIdSchema.safeParse(id);

    if (!parsedId.success) {
        return new Response("Invalid content id", { status: 400 });
    }

    const content = await getContent(parsedId.data);

    if (!content) {
        return new Response("Content not found", { status: 404 });
    }

    const [fonts, logoSrc] = await Promise.all([fontPromise, logoPromise]);
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
                            // eslint-disable-next-line @next/next/no-img-element -- Satori OG image markup uses raw img elements, not next/image.
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

                            {/* eslint-disable-next-line @next/next/no-img-element -- Satori OG image markup uses raw img elements, not next/image. */}
                            <img
                                alt={APP_NAME}
                                src={logoSrc}
                                style={{
                                    height: 56,
                                    objectFit: "contain",
                                    opacity: 0.9,
                                    width: 58,
                                }}
                            />
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
