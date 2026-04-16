import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { QuickModeSchema, type FocusFeedItem } from "@/types/domain";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { bestEffortRateLimit } from "@/lib/server/rate-limit";

const QUERY_SCHEMA = z.object({
    limit: z.coerce.number().int().min(1).max(12).default(6),
    excludeIds: z.array(z.string().uuid()).default([]),
    cursor: z.string().uuid().optional(),
});

const FOCUS_SELECT =
    "id, title, type, author, category, cover_image_url, duration_seconds, quick_mode_json";
const PAGE_SIZE = 48;

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
        cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
    });

    if (!parsedQuery.success) {
        return apiError("VALIDATION_ERROR", "Invalid focus feed query.", 400, requestId);
    }

    const { limit, excludeIds } = parsedQuery.data;
    const supabase = createPublicServerClient();
    const excluded = new Set(excludeIds);
    let invalidRowCount = 0;
    const collectedIds = new Set<string>();
    const candidateItems: FocusFeedItem[] = [];
    let cursor = parsedQuery.data.cursor ?? null;
    let hasMore = false;

    while (candidateItems.length <= limit) {
        let query = supabase
            .from("content_item")
            .select(FOCUS_SELECT)
            .eq("status", "verified")
            .is("deleted_at", null)
            .not("quick_mode_json", "is", null);

        if (cursor) {
            query = query.gt("id", cursor);
        }

        const { data, error } = await query
            .order("id", { ascending: true })
            .limit(PAGE_SIZE);

        if (error) {
            logApiError({
                requestId,
                route: "/api/focus",
                message: "Failed to fetch focus feed content",
                error,
            });
            return apiError("INTERNAL_ERROR", "Failed to fetch focus feed.", 500, requestId);
        }

        const pageItems = (data ?? []) as FocusFeedItem[];

        if (pageItems.length === 0) {
            break;
        }

        pageItems.forEach((item) => {
            const parsedQuickMode = QuickModeSchema.safeParse(item.quick_mode_json);
            if (!parsedQuickMode.success) {
                invalidRowCount += 1;
                return;
            }

            if (excluded.has(item.id) || collectedIds.has(item.id)) {
                return;
            }

            item.quick_mode_json = parsedQuickMode.data;
            collectedIds.add(item.id);
            candidateItems.push(item);
        });

        if (candidateItems.length > limit) {
            hasMore = true;
            break;
        }

        if (pageItems.length < PAGE_SIZE) {
            break;
        }

        cursor = pageItems[pageItems.length - 1]?.id ?? null;
    }

    if (invalidRowCount > 0) {
        console.warn({
            requestId,
            route: "/api/focus",
            message: "Dropped invalid focus feed rows",
            error: { invalid_row_count: invalidRowCount },
        });
    }

    const items = candidateItems.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

    return NextResponse.json({
        items,
        pageInfo: {
            hasMore,
            nextCursor: hasMore ? nextCursor : null,
        },
    }, {
        headers: {
            "Cache-Control": "private, max-age=0, must-revalidate",
        },
    });
}
