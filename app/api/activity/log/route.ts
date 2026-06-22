import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveAuthUserResult } from "@/lib/supabase/auth-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { verifyAnonymousActivityToken } from "@/lib/server/anonymous-activity-token";

const ActivityLogSchema = z.object({
    duration_seconds: z.coerce.number().int().min(1).max(60 * 60 * 4).default(60),
    activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    content_id: z.string().uuid().optional(),
    visitor_id: z.string().uuid().optional(),
    visitor_token: z.string().min(1).max(512).optional(),
});

type ContentItemLookupResult = {
    data: { id: string } | null;
    error: unknown;
};
type ContentItemLookupQuery = {
    select: (columns: string) => {
        eq: (column: string, value: string) => {
            eq: (column: string, value: string) => {
                is: (column: string, value: null) => {
                    maybeSingle: () => Promise<ContentItemLookupResult>;
                };
            };
        };
    };
};
type ActivityAdminClient = {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    from: (table: "content_item") => ContentItemLookupQuery;
};

function getUtcDateString() {
    return new Date().toISOString().split("T")[0];
}

function rateLimitedResponse(retryAfterMs?: number) {
    return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests." } },
        {
            status: 429,
            headers: { "Retry-After": String(Math.ceil((retryAfterMs ?? 60_000) / 1000)) },
        }
    );
}

function logAnonymousActivityRejection(reason: string, requestId: string, details?: Record<string, unknown>) {
    console.warn({
        request_id: requestId,
        route: "/api/activity/log",
        reason,
        ...details,
    });
}

async function enforceRateLimit(
    req: NextRequest,
    options: { limit: number; windowMs: number; key?: string; identifier?: string }
) {
    const rl = await rateLimit(req, options);
    return rl.success ? null : rateLimitedResponse(rl.retryAfterMs);
}

async function enforceAnonymousRateLimits(req: NextRequest, visitorId: string, contentId: string) {
    return await enforceRateLimit(req, { limit: 10, windowMs: 60_000, key: "anonymous-activity-ip" })
        ?? await enforceRateLimit(req, {
            limit: 20,
            windowMs: 10 * 60_000,
            key: "anonymous-activity-visitor",
            identifier: visitorId,
        })
        ?? await enforceRateLimit(req, {
            limit: 8,
            windowMs: 60_000,
            key: `anonymous-activity-content:${contentId}`,
        });
}

async function isVerifiedContent(
    adminClient: ActivityAdminClient,
    contentId: string
) {
    const { data, error } = await adminClient
        .from("content_item")
        .select("id")
        .eq("id", contentId)
        .eq("status", "verified")
        .is("deleted_at", null)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return Boolean(data);
}

export async function POST(req: NextRequest) {
    const requestId = getRequestId();
    const authClient = await createClient();
    const adminClient = getAdminClient() as unknown as ActivityAdminClient;
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

    const routeRateLimitResponse = await enforceRateLimit(req, { limit: 30, windowMs: 60_000 });
    if (routeRateLimitResponse) {
        return routeRateLimitResponse;
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
            if (parsed.data.content_id && !(await isVerifiedContent(adminClient, parsed.data.content_id))) {
                return apiError("NOT_FOUND", "Content not found", 404, requestId);
            }

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
            const anonymousRateLimitResponse = await enforceAnonymousRateLimits(
                req,
                parsed.data.visitor_id,
                parsed.data.content_id
            );
            if (anonymousRateLimitResponse) {
                logAnonymousActivityRejection("rate_limited", requestId, {
                    content_id: parsed.data.content_id,
                    visitor_id: parsed.data.visitor_id,
                });
                return anonymousRateLimitResponse;
            }

            if (!verifyAnonymousActivityToken(parsed.data.visitor_id, parsed.data.visitor_token)) {
                logAnonymousActivityRejection("invalid_visitor_token", requestId, {
                    content_id: parsed.data.content_id,
                    visitor_id: parsed.data.visitor_id,
                });
                return apiError("FORBIDDEN", "Invalid anonymous activity session", 403, requestId);
            }

            if (!(await isVerifiedContent(adminClient, parsed.data.content_id))) {
                logAnonymousActivityRejection("invalid_content", requestId, {
                    content_id: parsed.data.content_id,
                    visitor_id: parsed.data.visitor_id,
                });
                return apiError("NOT_FOUND", "Content not found", 404, requestId);
            }

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
