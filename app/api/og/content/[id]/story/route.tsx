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
} from "../og-content-image-utils";

export const runtime = "nodejs";

interface RouteContext {
    params: Promise<{ id: string }>;
}

const size = { width: 1080, height: 1920 };

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

    const [fonts, logoSrc] = await Promise.all([fontPromise, logoPromise]);
    const uiFont = fonts.some((font) => font.name === "Inter") ? "Inter" : "sans-serif";
    const brandFont = fonts.some((font) => font.name === "Outfit") ? "Outfit" : uiFont;
    const title = clampText(content.title, 76);
    const author = content.author ? clampText(content.author, 48) : APP_TAGLINE;
    const badge = normalizeLabel(content.category ?? content.type);
    const coverImageSrc = content.cover_image_url ? await getImageDataUrl(content.cover_image_url) : null;
    const hasCover = Boolean(coverImageSrc);
    const titleFontSize = title.length > 58 ? 58 : title.length > 38 ? 68 : 78;

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
                            fontSize: 28,
                            fontWeight: 700,
                            padding: "16px 24px",
                        }}
                    >
                        {badge}
                    </div>

                    {/* eslint-disable-next-line @next/next/no-img-element -- Satori OG image markup uses raw img elements, not next/image. */}
                    <img
                        alt={APP_NAME}
                        src={logoSrc}
                        style={{
                            height: 72,
                            objectFit: "contain",
                            opacity: 0.92,
                            width: 76,
                        }}
                    />
                </div>

                <div
                    style={{
                        alignItems: "center",
                        display: "flex",
                        flex: 1,
                        flexDirection: "column",
                        justifyContent: "center",
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
                            height: 858,
                            overflow: "hidden",
                            width: 572,
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
                            marginTop: 72,
                            textAlign: "center",
                            width: "100%",
                        }}
                    >
                        <div
                            style={{
                                color: "rgba(250, 250, 250, 0.58)",
                                display: "flex",
                                fontSize: 30,
                                fontWeight: 700,
                                letterSpacing: 0,
                                marginBottom: 22,
                            }}
                        >
                            Reading on {APP_NAME}
                        </div>
                        <div
                            style={{
                                color: "#fafafa",
                                display: "flex",
                                fontSize: titleFontSize,
                                fontWeight: 700,
                                letterSpacing: 0,
                                lineHeight: 1.02,
                                maxHeight: 238,
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
                                marginTop: 28,
                            }}
                        >
                            {content.author ? `By ${author}` : author}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        alignItems: "center",
                        color: "rgba(250, 250, 250, 0.52)",
                        display: "flex",
                        fontSize: 26,
                        justifyContent: "space-between",
                        width: "100%",
                    }}
                >
                    <div
                        style={{
                            background: "rgba(250, 250, 250, 0.22)",
                            display: "flex",
                            height: 1,
                            width: 220,
                        }}
                    />
                    <div style={{ display: "flex" }}>{APP_NAME}</div>
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
    return image;
}
