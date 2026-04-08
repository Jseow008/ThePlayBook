import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const ActivityLogSchema = z.object({
    duration_seconds: z.coerce.number().int().min(1).max(60 * 60 * 4).default(60),
    activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    content_id: z.string().uuid().optional(),
    visitor_id: z.string().uuid().optional(),
});

function getUtcDateString() {
    return new Date().toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
    const requestId = getRequestId();
    const authClient = await createClient();
    const adminClient = getAdminClient() as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    };
    const { user, error: authError } = resolveAuthUserResult(await authClient.auth.getUser());

    if (authError) {
        logApiError({
            requestId,
            route: "/api/activity/log",
            message: "Failed to verify activity log session",
            error: authError,
        });
        return apiError("INTERNAL_ERROR", "Failed to verify session", 500, requestId);
    }

    // Rate limit: 30 requests per 60 seconds per IP
    const rl = await rateLimit(req, { limit: 30, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
            }
        );
    }

    try {
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
        }

        const parsed = ActivityLogSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid activity payload", 400, requestId);
        }

        const activityDate = getUtcDateString();

        let error: unknown = null;

        if (user) {
            ({ error } = parsed.data.content_id
                ? await adminClient.rpc("log_reading_activity_for_user", {
                    p_activity_date: activityDate,
                    p_duration_seconds: parsed.data.duration_seconds,
                    p_content_id: parsed.data.content_id,
                    p_user_id: user.id,
                })
                : await adminClient.rpc("increment_reading_activity_for_user", {
                    p_activity_date: activityDate,
                    p_duration_seconds: parsed.data.duration_seconds,
                    p_user_id: user.id,
                }));
        } else if (parsed.data.content_id && parsed.data.visitor_id) {
            ({ error } = await adminClient.rpc("log_anonymous_reading_activity", {
                p_activity_date: activityDate,
                p_duration_seconds: parsed.data.duration_seconds,
                p_content_id: parsed.data.content_id,
                p_visitor_id: parsed.data.visitor_id,
            }));
        } else {
            return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
        }

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/activity/log",
            message: "Failed to log activity",
            error,
            userId: user?.id,
        });
        return apiError("INTERNAL_ERROR", "Failed to log activity", 500, requestId);
    }
}
