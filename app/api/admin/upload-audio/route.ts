import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-m4a",
    "audio/m4a",
    "audio/mp4",
];
const ALLOWED_AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a"]);

function getSafeAudioExtension(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return ALLOWED_AUDIO_EXTENSIONS.has(ext) ? ext : null;
}

export async function POST(req: NextRequest) {
    const requestId = getRequestId();
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
        if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
            return apiError("VALIDATION_ERROR", "Invalid file type. Only audio files (MP3, WAV, M4A) are allowed.", 400, requestId);
        }

        const fileExt = getSafeAudioExtension(file.name);
        if (!fileExt) {
            return apiError("VALIDATION_ERROR", "Invalid file extension.", 400, requestId);
        }

        // Validate file size (50MB max for audio)
        if (file.size > MAX_AUDIO_BYTES) {
            return apiError("VALIDATION_ERROR", "File too large. Maximum size is 50MB.", 400, requestId);
        }

        const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

        // Upload to 'audio' bucket
        const { error: uploadError } = await getAdminClient().storage
            .from("audio")
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) {
            logApiError({
                requestId,
                route: "/api/admin/upload-audio",
                message: "Supabase audio upload failed",
                error: uploadError,
            });
            return apiError("INTERNAL_ERROR", "Upload failed", 500, requestId);
        }

        // Get public URL
        const { data: { publicUrl } } = getAdminClient().storage
            .from("audio")
            .getPublicUrl(fileName);

        return NextResponse.json({ url: publicUrl });

    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/upload-audio",
            message: "Audio upload handler error",
            error,
        });
        return apiError("INTERNAL_ERROR", "Internal server error during upload", 500, requestId);
    }
}
