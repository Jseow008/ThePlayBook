import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { createClient } from "@/lib/supabase/server";

const NotificationPreferencesSchema = z.object({
    request_published_email_enabled: z.boolean(),
});

async function getAuthenticatedUser(requestId: string) {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return {
            supabase,
            user: null,
            response: apiError("UNAUTHORIZED", "Sign in to manage notification preferences.", 401, requestId),
        };
    }

    return { supabase, user, response: null };
}

export async function GET() {
    const requestId = getRequestId();

    try {
        const { supabase, user, response } = await getAuthenticatedUser(requestId);
        if (response || !user) {
            return response;
        }

        const { data, error } = await (supabase as any).from("user_notification_preferences")
            .select("request_published_email_enabled")
            .eq("user_id", user.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            data: {
                request_published_email_enabled: data?.request_published_email_enabled ?? true,
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/notification-preferences[GET]",
            message: "Failed to load notification preferences",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not load notification preferences.", 500, requestId);
    }
}

export async function PUT(request: NextRequest) {
    const requestId = getRequestId();
    const rl = await rateLimit(request, { limit: 20, windowMs: 60_000, key: "notification-preferences" });

    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const { supabase, user, response } = await getAuthenticatedUser(requestId);
        if (response || !user) {
            return response;
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid request body.", 400, requestId);
        }

        const parsed = NotificationPreferencesSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid notification preference.", 400, requestId);
        }

        const { data, error } = await (supabase as any).from("user_notification_preferences")
            .upsert({
                user_id: user.id,
                request_published_email_enabled: parsed.data.request_published_email_enabled,
            }, { onConflict: "user_id" })
            .select("request_published_email_enabled")
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            data: {
                request_published_email_enabled: data.request_published_email_enabled,
            },
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/notification-preferences[PUT]",
            message: "Failed to update notification preferences",
            error,
        });
        return apiError("INTERNAL_ERROR", "Could not update notification preferences.", 500, requestId);
    }
}
