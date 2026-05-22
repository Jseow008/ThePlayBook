import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { fetchContentRequestById } from "@/lib/server/content-requests";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeContentRequestStatus } from "@/types/content-requests";

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

async function resolveParams(params: Promise<{ id: string }> | { id: string }) {
    return ParamsSchema.safeParse(await params);
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const requestId = getRequestId();
    const parsedParams = await resolveParams(context.params);

    if (!parsedParams.success) {
        return apiError("VALIDATION_ERROR", "Invalid request ID.", 400, requestId);
    }

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Sign in to vote on requests.", 401, requestId);
        }

        const rl = await rateLimit(request, {
            limit: 60,
            windowMs: 60_000,
            key: "content-request-vote",
            identifier: user.id,
        });

        if (!rl.success) {
            return NextResponse.json(
                { error: { code: "RATE_LIMITED", message: "Too many vote updates." } },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
                }
            );
        }

        const admin = getAdminClient();
        const { data: targetRequest, error: targetRequestError } = await (admin as any).from("content_requests")
            .select("id, status, hidden_at")
            .eq("id", parsedParams.data.id)
            .maybeSingle();

        if (targetRequestError) throw targetRequestError;

        const targetStatus = normalizeContentRequestStatus(targetRequest?.status);
        if (!targetRequest || targetRequest.hidden_at || (targetStatus !== "pending" && targetStatus !== "processing")) {
            return apiError("NOT_FOUND", "Request not found.", 404, requestId);
        }

        const { error } = await (admin as any).from("content_request_votes").upsert(
            { user_id: user.id, request_id: parsedParams.data.id },
            { onConflict: "user_id,request_id", ignoreDuplicates: true }
        );

        if (error) throw error;

        const contentRequest = await fetchContentRequestById(parsedParams.data.id);
        if (!contentRequest) {
            return apiError("NOT_FOUND", "Request not found.", 404, requestId);
        }

        return NextResponse.json({ success: true, data: { request: contentRequest, voted: true } }, { status: 200 });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/content-requests/[id]/vote[POST]",
            message: "Failed to vote on content request",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not update your vote right now.", 500, requestId);
    }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const requestId = getRequestId();
    const parsedParams = await resolveParams(context.params);

    if (!parsedParams.success) {
        return apiError("VALIDATION_ERROR", "Invalid request ID.", 400, requestId);
    }

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Sign in to vote on requests.", 401, requestId);
        }

        const rl = await rateLimit(request, {
            limit: 60,
            windowMs: 60_000,
            key: "content-request-vote",
            identifier: user.id,
        });

        if (!rl.success) {
            return NextResponse.json(
                { error: { code: "RATE_LIMITED", message: "Too many vote updates." } },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
                }
            );
        }

        const admin = getAdminClient();
        const { error } = await (admin as any).from("content_request_votes")
            .delete()
            .eq("user_id", user.id)
            .eq("request_id", parsedParams.data.id);

        if (error) throw error;

        const contentRequest = await fetchContentRequestById(parsedParams.data.id);
        if (!contentRequest) {
            return apiError("NOT_FOUND", "Request not found.", 404, requestId);
        }

        return NextResponse.json({ success: true, data: { request: contentRequest, voted: false } }, { status: 200 });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/content-requests/[id]/vote[DELETE]",
            message: "Failed to remove content request vote",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not update your vote right now.", 500, requestId);
    }
}
