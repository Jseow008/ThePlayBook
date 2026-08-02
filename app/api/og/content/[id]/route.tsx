import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";
import {
    bufferImageResponse,
    buildCoverFallback,
    cacheControl,
    clampText,
    ContentIdSchema,
    fontPromise,
    getContent,
    getImageDataUrl,
    normalizeLabel,
} from "./og-content-image-utils";

export const runtime = "nodejs";

interface RouteContext {
    params: Promise<{ id: string }>;
}

const size = { width: 1200, height: 630 };

function buildMetadataLine(content: NonNullable<Awaited<ReturnType<typeof getContent>>>) {
    const type = normalizeLabel(content.type);
    const category = normalizeLabel(content.category);
    const readingMinutes = content.duration_seconds
        ? Math.max(1, Math.round(content.duration_seconds / 60))
        : null;
    const parts = [
        type,
        category && category !== type ? category : null,
        readingMinutes ? `${readingMinutes} min read` : null,
    ].filter(Boolean);

    return parts.join(" · ");
}

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

    const fonts = await fontPromise;
    const uiFont = fonts.some((font) => font.name === "Inter") ? "Inter" : "sans-serif";
    const brandFont = fonts.some((font) => font.name === "Outfit") ? "Outfit" : uiFont;
    const title = clampText(content.title, 82);
    const author = content.author ? clampText(content.author, 52) : APP_TAGLINE;
    const metadataLine = buildMetadataLine(content);
    const coverImageSrc = content.cover_image_url ? await getImageDataUrl(content.cover_image_url) : null;
    const hasCover = Boolean(coverImageSrc);
    const titleFontSize = title.length > 68 ? 50 : title.length > 44 ? 58 : 68;

    const image = new ImageResponse(
        (
            <div
                style={{
                    background:
                        "radial-gradient(circle at 72% 24%, rgba(250, 250, 250, 0.12) 0, transparent 23%), radial-gradient(circle at 86% 18%, rgba(250, 250, 250, 0.06) 0, transparent 30%), linear-gradient(135deg, #09090b 0%, #111113 62%, #151518 100%)",
                    color: "#fafafa",
                    display: "flex",
                    fontFamily: uiFont,
                    height: "100%",
                    overflow: "hidden",
                    padding: 60,
                    position: "relative",
                    width: "100%",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        height: "100%",
                        width: "100%",
                    }}
                >
                    <div
                        style={{
                            background: "linear-gradient(180deg, rgba(250,250,250,0.08), rgba(250,250,250,0.02))",
                            border: "1px solid rgba(250, 250, 250, 0.13)",
                            borderRadius: 28,
                            boxShadow: "0 38px 90px rgba(0, 0, 0, 0.5)",
                            display: "flex",
                            height: 510,
                            overflow: "hidden",
                            width: 340,
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
                            paddingLeft: 70,
                            paddingRight: 20,
                            paddingTop: 58,
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                maxWidth: 640,
                            }}
                        >
                            <div
                                style={{
                                    color: "#fafafa",
                                    display: "flex",
                                    fontSize: titleFontSize,
                                    fontWeight: 700,
                                    letterSpacing: 0,
                                    lineHeight: 1.02,
                                    marginBottom: 24,
                                    maxHeight: 220,
                                    overflow: "hidden",
                                }}
                            >
                                {title}
                            </div>
                            <div
                                style={{
                                    color: "rgba(250, 250, 250, 0.68)",
                                    display: "flex",
                                    fontSize: 32,
                                    lineHeight: 1.24,
                                }}
                            >
                                {author}
                            </div>
                            {metadataLine && (
                                <div
                                    style={{
                                        color: "rgba(250, 250, 250, 0.55)",
                                        display: "flex",
                                        fontSize: 25,
                                        lineHeight: 1.2,
                                        marginTop: 18,
                                    }}
                                >
                                    {metadataLine}
                                </div>
                            )}
                        </div>

                        <div
                            style={{
                                alignItems: "flex-end",
                                display: "flex",
                                flexDirection: "column",
                                marginBottom: 2,
                                width: "100%",
                            }}
                        >
                            <div
                                style={{
                                    color: "rgba(250, 250, 250, 0.78)",
                                    display: "flex",
                                    fontFamily: brandFont,
                                    fontSize: 30,
                                    fontWeight: 700,
                                    letterSpacing: 0,
                                    lineHeight: 1,
                                }}
                            >
                                {APP_NAME.toUpperCase()}
                            </div>
                            <div
                                style={{
                                    color: "rgba(250, 250, 250, 0.42)",
                                    display: "flex",
                                    fontSize: 18,
                                    letterSpacing: 0,
                                    lineHeight: 1,
                                    marginTop: 12,
                                }}
                            >
                                netflux.blog
                            </div>
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
    return bufferImageResponse(image);
}
