import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const ALLOWED_IMAGE_MIME = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif",
]);

function getSafeImageExtension(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : null;
}

export async function POST(req: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 5 requests per 60 seconds per IP
    const rl = await rateLimit(req, { limit: 5, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    // Verify admin session
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return apiError("VALIDATION_ERROR", "No file provided", 400, requestId);
        }

        // Validate MIME + extension (defense in depth)
        if (!ALLOWED_IMAGE_MIME.has(file.type)) {
            return apiError("VALIDATION_ERROR", "Invalid file type. Only images are allowed.", 400, requestId);
        }

        const fileExt = getSafeImageExtension(file.name);
        if (!fileExt) {
            return apiError("VALIDATION_ERROR", "Invalid file extension.", 400, requestId);
        }

        // Validate file size (e.g., 5MB)
        if (file.size > MAX_IMAGE_BYTES) {
            return apiError("VALIDATION_ERROR", "File too large. Maximum size is 5MB.", 400, requestId);
        }

        const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
        const filePath = `covers/${fileName}`;

        // Upload using admin client (bypasses RLS)
        const { error: uploadError } = await getAdminClient().storage
            .from("media")
            .upload(filePath, file, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) {
            logApiError({
                requestId,
                route: "/api/admin/upload",
                message: "Supabase image upload failed",
                error: uploadError,
            });
            return apiError("INTERNAL_ERROR", "Upload failed", 500, requestId);
        }

        // Get public URL
        const { data: { publicUrl } } = getAdminClient().storage
            .from("media")
            .getPublicUrl(filePath);

        return NextResponse.json({ url: publicUrl });

    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/upload",
            message: "Upload handler error",
            error,
        });
        return apiError("INTERNAL_ERROR", "Internal server error during upload", 500, requestId);
    }
}
