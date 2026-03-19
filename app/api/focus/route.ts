import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { QuickModeSchema, type FocusFeedItem } from "@/types/domain";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

const QUERY_SCHEMA = z.object({
    limit: z.coerce.number().int().min(1).max(12).default(6),
    excludeIds: z.array(z.string().uuid()).default([]),
});

const FOCUS_SELECT =
    "id, title, type, author, category, cover_image_url, duration_seconds, quick_mode_json";

function shuffleItems<T>(items: T[]): T[] {
    const next = [...items];

    for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }

    return next;
}

export async function GET(request: NextRequest) {
    const requestId = getRequestId();

    const rateLimitResult = await bestEffortRateLimit(request, {
        limit: 30,
        windowMs: 60_000,
        routeLabel: "/api/focus",
    });
    if (!rateLimitResult.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            {
                status: 429,
                headers: {
                    "Retry-After": String(
                        Math.ceil((rateLimitResult.retryAfterMs ?? 60_000) / 1000)
                    ),
                },
            }
        );
    }

    const parsedQuery = QUERY_SCHEMA.safeParse({
        limit: request.nextUrl.searchParams.get("limit") ?? undefined,
        excludeIds: (request.nextUrl.searchParams.get("excludeIds") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
    });

    if (!parsedQuery.success) {
        return apiError("VALIDATION_ERROR", "Invalid focus feed query.", 400, requestId);
    }

    const { limit, excludeIds } = parsedQuery.data;
    const supabase = createPublicServerClient();
    const poolSize = Math.max(limit * 8, 48);

    const { data, error } = await supabase
        .from("content_item")
        .select(FOCUS_SELECT)
        .eq("status", "verified")
        .is("deleted_at", null)
        .not("quick_mode_json", "is", null)
        .limit(poolSize);

    if (error) {
        logApiError({
            requestId,
            route: "/api/focus",
            message: "Failed to fetch focus feed content",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch focus feed.", 500, requestId);
    }

    let invalidRowCount = 0;
    const validItems = ((data ?? []) as FocusFeedItem[]).filter((item) => {
        const parsedQuickMode = QuickModeSchema.safeParse(item.quick_mode_json);
        if (!parsedQuickMode.success) {
            invalidRowCount += 1;
            return false;
        }

        item.quick_mode_json = parsedQuickMode.data;
        return true;
    });

    if (invalidRowCount > 0) {
        logApiError({
            requestId,
            route: "/api/focus",
            message: "Dropped invalid focus feed rows",
            error: { invalid_row_count: invalidRowCount },
        });
    }

    const excluded = new Set(excludeIds);
    const filteredItems = shuffleItems(validItems.filter((item) => !excluded.has(item.id))).slice(
        0,
        limit
    );

    return NextResponse.json(filteredItems, {
        headers: {
            "Cache-Control": "private, max-age=0, must-revalidate",
        },
    });
}
