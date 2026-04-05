import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, isSupabaseNotFoundError, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { getNarrationJobState } from "@/lib/narration-job";
import { processNextNarrationJob } from "@/lib/server/narration-processor";

const ContentIdSchema = z.string().uuid();

interface RouteParams {
    params: Promise<{ id: string }>;
}

async function getNarrationRow(id: string) {
    const supabase = getAdminClient();
    const { data, error } = await supabase
        .from("content_item")
        .select("id, title, status, audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at")
        .eq("id", id)
        .is("deleted_at", null)
        .single();

    return { supabase, data, error };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const { id } = await params;

    if (!ContentIdSchema.safeParse(id).success) {
        return apiError("VALIDATION_ERROR", "Invalid content ID", 400, requestId);
    }

    const rl = await rateLimit(request, { limit: 60, windowMs: 60_000, key: "status" });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        const { data, error } = await getNarrationRow(id);

        if (error) {
            if (isSupabaseNotFoundError(error)) {
                return apiError("NOT_FOUND", "Content not found", 404, requestId);
            }

            throw error;
        }

        if (!data) {
            return apiError("NOT_FOUND", "Content not found", 404, requestId);
        }

        return NextResponse.json({
            success: true,
            data: {
                job: getNarrationJobState(data),
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/[id]/narration",
            message: "Failed to load AI narration job state",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to load AI narration status", 500, requestId);
    }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const { id } = await params;

    if (!ContentIdSchema.safeParse(id).success) {
        return apiError("VALIDATION_ERROR", "Invalid content ID", 400, requestId);
    }

    const rl = await rateLimit(request, { limit: 10, windowMs: 60_000, key: "queue" });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
    }

    try {
        const { supabase, data: contentItem, error } = await getNarrationRow(id);

        if (error) {
            if (isSupabaseNotFoundError(error)) {
                return apiError("NOT_FOUND", "Content not found", 404, requestId);
            }

            throw error;
        }

        if (!contentItem) {
            return apiError("NOT_FOUND", "Content not found", 404, requestId);
        }

        if (contentItem.status !== "verified") {
            return apiError("VALIDATION_ERROR", "Narration can only be generated for verified content.", 400, requestId);
        }

        const currentJob = getNarrationJobState(contentItem);
        if (currentJob.status === "queued" || currentJob.status === "processing") {
            return NextResponse.json({
                success: true,
                data: {
                    job: currentJob,
                    message: currentJob.status === "queued"
                        ? "AI narration is already queued."
                        : "AI narration is already generating in the background.",
                },
            }, { status: 202 });
        }

        const now = new Date().toISOString();
        const { data: queuedItem, error: queueError } = await supabase
            .from("content_item")
            .update({
                narration_status: "queued",
                narration_error: null,
                narration_requested_at: now,
                narration_started_at: null,
                narration_completed_at: null,
            })
            .eq("id", id)
            .is("deleted_at", null)
            .select("audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at")
            .single();

        if (queueError) {
            throw queueError;
        }

        if (!queuedItem) {
            return apiError("INTERNAL_ERROR", "Failed to queue AI narration", 500, requestId);
        }

        after(async () => {
            try {
                await processNextNarrationJob(`${requestId}:background`);
            } catch (backgroundError) {
                logApiError({
                    requestId,
                    route: "/api/admin/content/[id]/narration",
                    message: "Background AI narration processor failed after queueing",
                    error: backgroundError,
                });
            }
        });

        return NextResponse.json({
            success: true,
            data: {
                job: getNarrationJobState(queuedItem),
                message: "AI narration queued. Generation will continue in the background.",
            },
        }, { status: 202 });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/content/[id]/narration",
            message: "Failed to queue AI narration job",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to queue AI narration", 500, requestId);
    }
}
