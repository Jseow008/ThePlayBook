import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logApiError } from "@/lib/server/api";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";
import {
    buildStoryImageRenderVersion,
    buildStoryImageStoragePath,
    createStoryImageJpegResponse,
} from "@/lib/server/story-image-renderer";
import {
    findCompletedStoryImage,
    markStoryImageVersionCompleted,
} from "@/lib/server/story-image-queue";
import {
    getStoryImagePublicUrl,
    storedStoryImageExists,
    storeStoryImage,
} from "@/lib/server/story-image-storage";
import { ContentIdSchema, getContent } from "../og-content-image-utils";

export const runtime = "nodejs";

interface RouteContext {
    params: Promise<{ id: string }>;
}

const STORED_REDIRECT_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";

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

    const renderVersion = buildStoryImageRenderVersion(content);
    const storagePath = buildStoryImageStoragePath(content.id, renderVersion);

    try {
        const completed = await findCompletedStoryImage({
            contentId: content.id,
            renderVersion,
        });

        if (completed?.storage_path) {
            const publicUrl = getStoryImagePublicUrl(completed.storage_path);
            if (!await storedStoryImageExists(publicUrl)) {
                throw new Error("Completed story image record points to a missing Storage object.");
            }
            const response = NextResponse.redirect(publicUrl, 307);
            response.headers.set("Cache-Control", STORED_REDIRECT_CACHE_CONTROL);
            return response;
        }
    } catch (error) {
        logApiError({
            requestId: `story-image:${content.id}`,
            route: "/api/og/content/[id]/story",
            message: "Stored story image lookup failed; rendering dynamically",
            error,
        });
    }

    const renderedResponse = await createStoryImageJpegResponse(content);
    const jpegBuffer = Buffer.from(await renderedResponse.arrayBuffer());

    try {
        await storeStoryImage({ storagePath, jpegBuffer });
        await markStoryImageVersionCompleted({
            contentId: content.id,
            renderVersion,
            storagePath,
        });
    } catch (error) {
        logApiError({
            requestId: `story-image:${content.id}`,
            route: "/api/og/content/[id]/story",
            message: "Story image rendered, but the write-through cache could not be stored",
            error,
        });
    }

    return new Response(jpegBuffer, {
        status: renderedResponse.status,
        headers: renderedResponse.headers,
    });
}
