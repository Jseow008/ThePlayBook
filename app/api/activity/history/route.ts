import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const HistoryQuerySchema = z
    .object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .refine(
        (data) => {
            if (!data.start || !data.end) return true;
            return new Date(data.start) <= new Date(data.end);
        },
        { message: "start must be before or equal to end" }
    )
    .refine(
        (data) => {
            if (!data.start || !data.end) return true;
            const diffMs = new Date(data.end).getTime() - new Date(data.start).getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            return diffDays <= 370;
        },
        { message: "Date range too large" }
    );

export async function GET(req: NextRequest) {
    const requestId = getRequestId();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    // Rate limit: 20 requests per 60 seconds per IP
    const rl = rateLimit(req, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        const url = new URL(req.url);
        const parsed = HistoryQuerySchema.safeParse({
            start: url.searchParams.get("start") ?? undefined,
            end: url.searchParams.get("end") ?? undefined,
        });

        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid query parameters", 400, requestId);
        }

        const { start, end } = parsed.data;

        // Basic query
        let query = supabase
            .from("reading_activity")
            .select("activity_date, duration_seconds, pages_read")
            .eq("user_id", user.id)
            .order("activity_date", { ascending: true });

        if (start) {
            query = query.gte("activity_date", start);
        }
        if (end) {
            query = query.lte("activity_date", end);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data ?? []);
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/activity/history",
            message: "Failed to fetch reading history",
            error,
            userId: user.id,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch reading history", 500, requestId);
    }
}
