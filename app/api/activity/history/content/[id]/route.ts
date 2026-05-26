import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const ContentHistoryParamsSchema = z.object({
    id: z.string().uuid(),
});

const ContentHistoryDeleteBodySchema = z.object({
    deleteNotesAndHighlights: z.boolean().optional().default(false),
});

type SupabaseAdminClient = {
    from: (table: string) => SupabaseQueryBuilder;
};

type SupabaseQueryBuilder = {
    select: (columns: string) => SupabaseQueryBuilder;
    delete: () => SupabaseQueryBuilder;
    eq: (column: string, value: string) => SupabaseQueryBuilder;
    neq: (column: string, value: string) => SupabaseQueryBuilder;
    in: (column: string, values: string[]) => SupabaseQueryBuilder;
    then: Promise<{ data: unknown[] | null; error: unknown }>["then"];
};

type ActivityDateRow = {
    activity_date: string;
};

function asQueryResult<T>(query: unknown) {
    return query as Promise<{ data: T[] | null; error: unknown }>;
}

function selectActivityDates(
    adminClient: SupabaseAdminClient,
    userId: string,
    contentId: string,
) {
    return asQueryResult<ActivityDateRow>(
        adminClient
            .from("content_reader_daily")
            .select("activity_date")
            .eq("user_id", userId)
            .eq("content_id", contentId)
    );
}

function selectRemainingContentDates(
    adminClient: SupabaseAdminClient,
    userId: string,
    contentId: string,
    dates: string[],
) {
    return asQueryResult<ActivityDateRow>(
        adminClient
            .from("content_reader_daily")
            .select("activity_date")
            .eq("user_id", userId)
            .neq("content_id", contentId)
            .in("activity_date", dates)
    );
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const requestId = getRequestId();
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
        return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
    }

    const rl = await rateLimit(req, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    const parsed = ContentHistoryParamsSchema.safeParse(await context.params);
    if (!parsed.success) {
        return apiError("VALIDATION_ERROR", "Invalid content id", 400, requestId);
    }

    const contentId = parsed.data.id;
    const adminClient = getAdminClient() as unknown as SupabaseAdminClient;

    try {
        let deleteNotesAndHighlights = false;
        const rawBody = await req.text();

        if (rawBody.trim().length > 0) {
            try {
                const body = ContentHistoryDeleteBodySchema.safeParse(JSON.parse(rawBody));
                if (!body.success) {
                    return apiError("VALIDATION_ERROR", "Invalid history removal payload", 400, requestId);
                }

                deleteNotesAndHighlights = body.data.deleteNotesAndHighlights;
            } catch {
                return apiError("INVALID_JSON", "Invalid request body", 400, requestId);
            }
        }

        const { data: contentDates, error: contentDatesError } = await selectActivityDates(
            adminClient,
            user.id,
            contentId,
        );

        if (contentDatesError) throw contentDatesError;

        const dates = Array.from(new Set((contentDates ?? []).map((row) => row.activity_date)));
        const datesToRemoveFromActivity = new Set(dates);

        if (dates.length > 0) {
            const { data: remainingRows, error: remainingRowsError } = await selectRemainingContentDates(
                adminClient,
                user.id,
                contentId,
                dates,
            );

            if (remainingRowsError) throw remainingRowsError;

            for (const row of remainingRows ?? []) {
                datesToRemoveFromActivity.delete(row.activity_date);
            }
        }

        const deleteContentRowsQuery = adminClient
            .from("content_reader_daily")
            .delete()
            .eq("user_id", user.id)
            .eq("content_id", contentId);

        const { error: deleteContentRowsError } = await asQueryResult<never>(deleteContentRowsQuery);
        if (deleteContentRowsError) throw deleteContentRowsError;

        if (deleteNotesAndHighlights) {
            const deleteNotesQuery = adminClient
                .from("user_highlights")
                .delete()
                .eq("user_id", user.id)
                .eq("content_item_id", contentId);

            const { error: deleteNotesError } = await asQueryResult<never>(deleteNotesQuery);
            if (deleteNotesError) throw deleteNotesError;
        }

        if (datesToRemoveFromActivity.size > 0) {
            const deleteActivityRowsQuery = adminClient
                .from("reading_activity")
                .delete()
                .eq("user_id", user.id)
                .in("activity_date", Array.from(datesToRemoveFromActivity));

            const { error: deleteActivityRowsError } = await asQueryResult<never>(deleteActivityRowsQuery);
            if (deleteActivityRowsError) throw deleteActivityRowsError;
        }

        return NextResponse.json({
            success: true,
            deletedNotesAndHighlights: deleteNotesAndHighlights,
            removedActivityDays: datesToRemoveFromActivity.size,
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/activity/history/content/[id]",
            message: "Failed to remove content from reading history",
            error,
            userId: user.id,
        });
        return apiError("INTERNAL_ERROR", "Failed to remove content from reading history", 500, requestId);
    }
}
