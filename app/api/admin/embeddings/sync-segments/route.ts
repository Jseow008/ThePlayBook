import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import {
    LOCAL_SEGMENT_SYNC_COMMAND,
    LOCAL_SEGMENT_SYNC_DRY_RUN_COMMAND,
    getGeminiSegmentCoverage,
} from "@/lib/server/gemini-segment-sync";

export async function GET() {
    const requestId = getRequestId();

    try {
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
        }

        const supabase = getAdminClient();
        const summary = await getGeminiSegmentCoverage(supabase);
        return NextResponse.json({
            summary,
            command: LOCAL_SEGMENT_SYNC_COMMAND,
            dry_run_command: LOCAL_SEGMENT_SYNC_DRY_RUN_COMMAND,
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/embeddings/sync-segments",
            message: "Failed to load Gemini segment embedding coverage",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to load embedding coverage", 500, requestId);
    }
}

export async function POST() {
    const requestId = getRequestId();

    try {
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
        }

        return NextResponse.json(
            {
                error: {
                    code: "METHOD_NOT_ALLOWED",
                    message: "Segment embedding sync now runs locally. Use the provided CLI command from a trusted machine.",
                },
                command: LOCAL_SEGMENT_SYNC_COMMAND,
                dry_run_command: LOCAL_SEGMENT_SYNC_DRY_RUN_COMMAND,
            },
            {
                status: 405,
                headers: {
                    Allow: "GET",
                },
            }
        );
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/embeddings/sync-segments",
            message: "Failed to handle disabled segment sync POST",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to handle segment sync request", 500, requestId);
    }
}
