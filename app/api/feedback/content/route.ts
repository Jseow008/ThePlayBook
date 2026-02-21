import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const PosFeedbackSchema = z.object({
    content_id: z.string().uuid("Invalid content ID"),
    is_positive: z.boolean(),
    reason: z.string().optional().nullable(),
    details: z.string().optional().nullable(),
});

const DelSchema = z.object({
    content_id: z.string().uuid("Invalid content ID"),
});

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 20 requests per 60 seconds per IP
    const rl = rateLimit(request, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const contentId = searchParams.get("contentId");

        if (!contentId) {
            return apiError("VALIDATION_ERROR", "Missing contentId", 400, requestId);
        }

        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ success: true, data: { status: null } }, { status: 200 });
        }

        const { data, error } = await (supabase
            .from("content_feedback") as any)
            .select("is_positive")
            .eq("user_id", user.id)
            .eq("content_id", contentId)
            .single();

        if (error && error.code !== "PGRST116") { // 116 = no rows returned
            throw error;
        }

        return NextResponse.json({
            success: true,
            data: { status: data ? (data.is_positive ? 'up' : 'down') : null }
        }, { status: 200 });

    } catch (error) {
        logApiError({
            requestId,
            route: "/api/feedback/content[GET]",
            message: "Error fetching content feedback",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch feedback", 500, requestId);
    }
}

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 20 requests per 60 seconds per IP
    const rl = rateLimit(request, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch (error) {
            return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
        }

        const parsed = PosFeedbackSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid feedback payload", 400, requestId);
        }

        const { content_id, is_positive, reason, details } = parsed.data;

        const { error } = await (supabase
            .from("content_feedback") as any)
            .upsert({
                user_id: user.id,
                content_id,
                is_positive,
                reason: reason || null,
                details: details || null,
            }, {
                onConflict: "user_id, content_id"
            });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            data: { message: "Feedback saved successfully" }
        }, { status: 200 });

    } catch (error) {
        logApiError({
            requestId,
            route: "/api/feedback/content[POST]",
            message: "Error saving content feedback",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to save feedback", 500, requestId);
    }
}

export async function DELETE(request: NextRequest) {
    const requestId = getRequestId();

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Not authenticated", 401, requestId);
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch (error) {
            return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
        }

        const parsed = DelSchema.safeParse(body);

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid delete payload", 400, requestId);
        }

        const { content_id } = parsed.data;

        const { error } = await (supabase
            .from("content_feedback") as any)
            .delete()
            .match({
                user_id: user.id,
                content_id
            });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            data: { message: "Feedback removed successfully" }
        }, { status: 200 });

    } catch (error) {
        logApiError({
            requestId,
            route: "/api/feedback/content[DELETE]",
            message: "Error removing content feedback",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to remove feedback", 500, requestId);
    }
}
