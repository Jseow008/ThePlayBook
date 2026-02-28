import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const ActivityLogSchema = z.object({
    duration_seconds: z.coerce.number().int().min(1).max(60 * 60 * 4).default(60),
    activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    content_id: z.string().uuid().optional(),
});

function getUtcDateString() {
    return new Date().toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
    const requestId = getRequestId();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
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
        const body = await req.json();
        const parsed = ActivityLogSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid activity payload", 400, requestId);
        }

        const activityDate = parsed.data.activity_date ?? getUtcDateString();

        const { error } = await (supabase.rpc as any)("increment_reading_activity", {
            p_activity_date: activityDate,
            p_duration_seconds: parsed.data.duration_seconds,
        });

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/activity/log",
            message: "Failed to log activity",
            error,
            userId: user.id,
        });
        return apiError("INTERNAL_ERROR", "Failed to log activity", 500, requestId);
    }
}
