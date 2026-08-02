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
} from "../og-content-image-utils";

export const runtime = "nodejs";

interface RouteContext {
    params: Promise<{ id: string }>;
}

const size = { width: 1080, height: 1920 };

function buildMetadataLine(content: NonNullable<Awaited<ReturnType<typeof getContent>>>) {
    const category = normalizeLabel(content.category ?? content.type);
    const readingMinutes = content.duration_seconds
        ? Math.max(1, Math.round(content.duration_seconds / 60))
        : null;
    const parts = [
        category,
        readingMinutes ? `${readingMinutes} min read` : null,
    ].filter(Boolean);

    return parts.join(" · ");
}

export async function GET(request: NextRequest, context: RouteContext) {
    const rateLimitResult = await strictPublicRateLimit(request, {
        limit: 30,
        windowMs: 60_000,
        routeLabel: "content_story_image",
    });

    if (!rateLimitResult.success) {
        return rateLimitFailureResponse(rateLimitResult, "Too many story image requests.");
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
    const title = clampText(content.title, 76);
    const author = content.author ? clampText(content.author, 48) : APP_TAGLINE;
    const metadataLine = buildMetadataLine(content);
    const coverImageSrc = content.cover_image_url ? await getImageDataUrl(content.cover_image_url) : null;
    const hasCover = Boolean(coverImageSrc);
    const titleFontSize = title.length > 58 ? 56 : title.length > 38 ? 66 : 76;

    const image = new ImageResponse(
        (
            <div
                style={{
                    background:
                        "radial-gradient(circle at 50% 8%, rgba(250, 250, 250, 0.16) 0, transparent 28%), linear-gradient(180deg, #09090b 0%, #111113 48%, #18181b 100%)",
                    color: "#fafafa",
                    display: "flex",
                    flexDirection: "column",
                    fontFamily: uiFont,
                    height: "100%",
                    overflow: "hidden",
                    padding: 72,
                    width: "100%",
                }}
            >
                <div
                    style={{
                        alignItems: "center",
                        display: "flex",
                        flex: 1,
                        flexDirection: "column",
                        justifyContent: "flex-start",
                        width: "100%",
                    }}
                >
                    <div
                        style={{
                            background:
                                "linear-gradient(180deg, rgba(250,250,250,0.16), rgba(250,250,250,0.04))",
                            border: "1px solid rgba(250, 250, 250, 0.16)",
                            borderRadius: 36,
                            boxShadow: "0 48px 120px rgba(0, 0, 0, 0.55)",
                            display: "flex",
                            height: 900,
                            marginTop: 96,
                            overflow: "hidden",
                            width: 600,
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
                            alignItems: "center",
                            display: "flex",
                            flexDirection: "column",
                            marginTop: 64,
                            textAlign: "center",
                            width: "100%",
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
                                maxHeight: 232,
                                maxWidth: 900,
                                overflow: "hidden",
                            }}
                        >
                            {title}
                        </div>
                        <div
                            style={{
                                color: "rgba(250, 250, 250, 0.68)",
                                display: "flex",
                                fontSize: 36,
                                lineHeight: 1.24,
                                marginTop: 26,
                            }}
                        >
                            {author}
                        </div>
                        {metadataLine && (
                            <div
                                style={{
                                    color: "rgba(250, 250, 250, 0.56)",
                                    display: "flex",
                                    fontSize: 30,
                                    lineHeight: 1.2,
                                    marginTop: 20,
                                }}
                            >
                                {metadataLine}
                            </div>
                        )}
                    </div>
                </div>

                <div
                    style={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        marginBottom: 96,
                        width: "100%",
                    }}
                >
                    <div
                        style={{
                            background: "linear-gradient(90deg, rgba(59, 130, 246, 0), rgba(59, 130, 246, 0.86), rgba(250, 250, 250, 0.18), rgba(59, 130, 246, 0))",
                            display: "flex",
                            height: 2,
                            marginBottom: 30,
                            width: 188,
                        }}
                    />
                    <div
                        style={{
                            color: "rgba(250, 250, 250, 0.76)",
                            display: "flex",
                            fontFamily: brandFont,
                            fontSize: 34,
                            fontWeight: 700,
                            letterSpacing: 0,
                            lineHeight: 1,
                        }}
                    >
                        {APP_NAME.toUpperCase()}
                    </div>
                    <div
                        style={{
                            color: "rgba(250, 250, 250, 0.48)",
                            display: "flex",
                            fontSize: 24,
                            lineHeight: 1,
                            marginTop: 14,
                        }}
                    >
                        netflux.blog
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
    image.headers.set("Content-Disposition", `inline; filename="${content.id}-story.png"`);
    return bufferImageResponse(image);
}
