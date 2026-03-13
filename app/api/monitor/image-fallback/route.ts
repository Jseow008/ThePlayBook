import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import {
    IMAGE_FALLBACK_STAGES,
    IMAGE_SOURCE_TYPES,
    IMAGE_SURFACES,
} from "@/lib/image-fallback";

const ImageFallbackPayloadSchema = z.object({
    host: z.string().max(255).nullable(),
    pathname: z.string().min(1).max(1024).startsWith("/"),
    src_type: z.enum(IMAGE_SOURCE_TYPES),
    stage: z.enum(IMAGE_FALLBACK_STAGES),
    surface: z.enum(IMAGE_SURFACES),
});

export async function POST(req: NextRequest) {
    const requestId = getRequestId();

    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000, key: "image-fallback" });
    if (!rl.success) {
        return new NextResponse(null, {
            headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
            status: 429,
        });
    }

    try {
        const body = await req.json();
        const parsed = ImageFallbackPayloadSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid fallback payload", 400, requestId);
        }

        console.info({
            host: parsed.data.host,
            message: "Image fallback diagnostic",
            pathname: parsed.data.pathname,
            request_id: requestId,
            route: "/api/monitor/image-fallback",
            src_type: parsed.data.src_type,
            stage: parsed.data.stage,
            surface: parsed.data.surface,
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        logApiError({
            error,
            message: "Image fallback diagnostic route failed",
            requestId,
            route: "/api/monitor/image-fallback",
        });
        return apiError("INTERNAL_ERROR", "Failed to record image fallback", 500, requestId);
    }
}

