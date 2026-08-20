import { createHash } from "node:crypto";
import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import {
    buildCoverFallback,
    cacheControl,
    clampText,
    encodeJpegImageResponse,
    fontPromise,
    getImageDataUrl,
    normalizeLabel,
} from "@/lib/server/og-image-rendering";

export interface StoryImageContent {
    id: string;
    title: string;
    author: string | null;
    category: string | null;
    cover_image_url: string | null;
    type: string;
    duration_seconds: number | null;
}

export const STORY_IMAGE_WIDTH = 1080;
export const STORY_IMAGE_HEIGHT = 1920;
export const STORY_IMAGE_JPEG_QUALITY = 85;
export const STORY_IMAGE_TEMPLATE_VERSION = "story-jpeg-v2";
export const STORY_IMAGE_STORAGE_PREFIX = "story-images";
export const STORY_IMAGE_CONTENT_TYPE = "image/jpeg";

function buildMetadataLine(content: StoryImageContent) {
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

export function buildStoryImageRenderVersion(content: StoryImageContent) {
    const renderInput = JSON.stringify({
        template: STORY_IMAGE_TEMPLATE_VERSION,
        title: content.title,
        author: content.author,
        category: content.category,
        type: content.type,
        durationSeconds: content.duration_seconds,
        coverImageUrl: content.cover_image_url,
    });

    return createHash("sha256").update(renderInput).digest("hex").slice(0, 24);
}

export function buildStoryImageStoragePath(contentId: string, renderVersion: string) {
    return `${STORY_IMAGE_STORAGE_PREFIX}/${contentId}/${renderVersion}.jpg`;
}

export async function createStoryImageJpegResponse(content: StoryImageContent) {
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
            width: STORY_IMAGE_WIDTH,
            height: STORY_IMAGE_HEIGHT,
            fonts,
        }
    );

    image.headers.set("Cache-Control", cacheControl);
    image.headers.set("Content-Disposition", `inline; filename="${content.id}-story.jpg"`);
    return encodeJpegImageResponse(image, STORY_IMAGE_JPEG_QUALITY);
}

export async function renderStoryImageJpeg(content: StoryImageContent) {
    const response = await createStoryImageJpegResponse(content);
    return Buffer.from(await response.arrayBuffer());
}
