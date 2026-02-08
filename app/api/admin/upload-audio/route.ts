import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";

const ALLOWED_AUDIO_TYPES = [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-m4a",
    "audio/m4a",
    "audio/mp4",
];

export async function POST(req: NextRequest) {
    // Verify admin session
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 }
            );
        }

        // Validate file type
        if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: `Invalid file type: ${file.type}. Only audio files (MP3, WAV, M4A) are allowed.` },
                { status: 400 }
            );
        }

        // Validate file size (50MB max for audio)
        if (file.size > 50 * 1024 * 1024) {
            return NextResponse.json(
                { error: "File too large. Maximum size is 50MB." },
                { status: 400 }
            );
        }

        const fileExt = file.name.split(".").pop()?.toLowerCase() || "mp3";
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

        // Upload to 'audio' bucket
        const { error: uploadError } = await getAdminClient().storage
            .from("audio")
            .upload(fileName, file, {
                contentType: file.type,
                upsert: false
            });

        if (uploadError) {
            console.error("Supabase audio upload error:", uploadError);
            return NextResponse.json(
                { error: uploadError.message },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: { publicUrl } } = getAdminClient().storage
            .from("audio")
            .getPublicUrl(fileName);

        return NextResponse.json({ url: publicUrl });

    } catch (error) {
        console.error("Audio upload handler error:", error);
        return NextResponse.json(
            { error: "Internal server error during upload" },
            { status: 500 }
        );
    }
}
