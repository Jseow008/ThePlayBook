import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { QuickModeSchema, type FocusFeedItem } from "@/types/domain";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";
import type { Database } from "@/types/database";

const FOCUS_REQUEST_SCHEMA = z.object({
    limit: z.coerce.number().int().min(1).max(12).default(6),
    excludeIds: z.array(z.string().uuid()).max(500).default([]),
    cursor: z.string().trim().min(1).max(4096).optional(),
    seed: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).default("default"),
});

const FOCUS_PERSONALIZED_REQUEST_SCHEMA = FOCUS_REQUEST_SCHEMA.extend({
    completedIds: z.array(z.string().uuid()).max(12).default([]),
    savedIds: z.array(z.string().uuid()).max(12).default([]),
});

const FOCUS_SELECT =
    "id, title, type, author, category, cover_image_url, duration_seconds, quick_mode_json";
const PAGE_SIZE = 48;
const CANDIDATE_WINDOW_MULTIPLIER = 4;
const FOCUS_CURSOR_PREFIX = "v1_";
const PERSONALIZED_BATCH_RATIO = 2 / 3;
const PERSONALIZED_CANDIDATE_MULTIPLIER = 4;

type FocusRequest = z.infer<typeof FOCUS_REQUEST_SCHEMA>;
type RecommendationItem = Database["public"]["Functions"]["match_recommendations"]["Returns"][number];

const FocusCursorPayloadSchema = z.object({
    v: z.literal(1),
    scanCursor: z.string().uuid().nullable(),
    carryIds: z.array(z.string().uuid()).max(PAGE_SIZE),
});

type FocusCursorPayload = z.infer<typeof FocusCursorPayloadSchema>;

type FocusSelectionOptions = {
    preferInputOrder?: boolean;
};

function hashString(value: string) {
    let hash = 2166136261;

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

function seededRank(seed: string, value: string) {
    return hashString(`${seed}:${value}`);
}

function normalizeDiversityValue(value: string | null | undefined, fallback: string) {
    const normalized = value?.trim().toLowerCase();
    return normalized || fallback;
}

function encodeFocusCursor(payload: FocusCursorPayload) {
    return `${FOCUS_CURSOR_PREFIX}${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

function decodeFocusCursor(value: string | undefined) {
    if (!value) {
        return {
            success: true as const,
            cursor: {
                scanCursor: null,
                carryIds: [],
            },
        };
    }

    const legacyUuid = z.string().uuid().safeParse(value);
    if (legacyUuid.success) {
        return {
            success: true as const,
            cursor: {
                scanCursor: legacyUuid.data,
                carryIds: [],
            },
        };
    }

    if (!value.startsWith(FOCUS_CURSOR_PREFIX)) {
        return { success: false as const };
    }

    try {
        const raw = Buffer.from(value.slice(FOCUS_CURSOR_PREFIX.length), "base64url").toString("utf8");
        const parsed = FocusCursorPayloadSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
            return { success: false as const };
        }

        return {
            success: true as const,
            cursor: {
                scanCursor: parsed.data.scanCursor,
                carryIds: parsed.data.carryIds,
            },
        };
    } catch {
        return { success: false as const };
    }
}

function selectDiversifiedItems(
    candidates: FocusFeedItem[],
    limit: number,
    seed: string,
    options?: FocusSelectionOptions,
) {
    const selected: FocusFeedItem[] = [];
    const remaining = options?.preferInputOrder
        ? [...candidates]
        : [...candidates].sort((first, second) => (
            seededRank(seed, first.id) - seededRank(seed, second.id)
        ));
    const inputRank = new Map(candidates.map((item, index) => [item.id, index]));
    const categoryCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();

    while (selected.length < limit && remaining.length > 0) {
        let bestIndex = 0;
        let bestScore = Number.POSITIVE_INFINITY;

        remaining.forEach((item, index) => {
            const category = normalizeDiversityValue(item.category, "uncategorized");
            const type = normalizeDiversityValue(item.type, "unknown");
            const categoryPenalty = categoryCounts.get(category) ?? 0;
            const typePenalty = typeCounts.get(type) ?? 0;
            const rankPenalty = options?.preferInputOrder
                ? (inputRank.get(item.id) ?? 0) / Math.max(candidates.length - 1, 1)
                : seededRank(seed, item.id) / 0xffffffff;
            const score = categoryPenalty * 3 + typePenalty * 2 + rankPenalty;

            if (score < bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });

        const [nextItem] = remaining.splice(bestIndex, 1);
        if (!nextItem) {
            break;
        }

        const category = normalizeDiversityValue(nextItem.category, "uncategorized");
        const type = normalizeDiversityValue(nextItem.type, "unknown");
        categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
        typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
        selected.push(nextItem);
    }

    return selected.sort((first, second) => first.id.localeCompare(second.id));
}

function parseFocusItem(item: FocusFeedItem) {
    const parsedQuickMode = QuickModeSchema.safeParse(item.quick_mode_json);
    if (!parsedQuickMode.success) {
        return null;
    }

    item.quick_mode_json = parsedQuickMode.data;
    return item;
}

function dedupeIds(ids: string[]) {
    return Array.from(new Set(ids));
}

function getPersonalizedItemLimit(limit: number) {
    return Math.floor(limit * PERSONALIZED_BATCH_RATIO);
}

async function loadPersonalizedFocusItems(params: {
    supabase: ReturnType<typeof createPublicServerClient>;
    requestId: string;
    seedIds: string[];
    excludeIds: string[];
    limit: number;
}) {
    if (params.seedIds.length === 0 || params.limit === 0) {
        return [] as FocusFeedItem[];
    }

    const candidateCount = Math.min(
        Math.max(params.limit * PERSONALIZED_CANDIDATE_MULTIPLIER, 12),
        40,
    );
    const { data, error } = await params.supabase.rpc("match_recommendations", {
        seed_ids: params.seedIds,
        exclude_ids: dedupeIds([...params.seedIds, ...params.excludeIds]),
        match_count: candidateCount,
    });

    if (error) {
        // Focus remains usable when the optional personalization query is unavailable.
        logApiError({
            requestId: params.requestId,
            route: "/api/focus",
            message: "Focus personalization lookup failed; using discovery fallback",
            error,
        });
        return [];
    }

    const excluded = new Set(params.excludeIds);
    const collectedIds = new Set<string>();

    return ((data ?? []) as RecommendationItem[]).flatMap((candidate) => {
        const item = parseFocusItem(candidate as unknown as FocusFeedItem);
        if (!item || excluded.has(item.id) || collectedIds.has(item.id)) {
            return [];
        }

        collectedIds.add(item.id);
        return [item];
    });
}

async function loadCarryItems(params: {
    supabase: ReturnType<typeof createPublicServerClient>;
    carryIds: string[];
}) {
    if (params.carryIds.length === 0) {
        return {
            data: [] as FocusFeedItem[],
            invalidRowCount: 0,
            error: null,
        };
    }

    const { data, error } = await params.supabase
        .from("content_item")
        .select(FOCUS_SELECT)
        .in("id", params.carryIds)
        .eq("status", "verified")
        .is("deleted_at", null)
        .not("quick_mode_json", "is", null);

    if (error) {
        return {
            data: [] as FocusFeedItem[],
            invalidRowCount: 0,
            error,
        };
    }

    let invalidRowCount = 0;
    const itemsById = new Map<string, FocusFeedItem>();
    ((data ?? []) as FocusFeedItem[]).forEach((item) => {
        const parsedItem = parseFocusItem(item);
        if (!parsedItem) {
            invalidRowCount += 1;
            return;
        }

        itemsById.set(parsedItem.id, parsedItem);
    });

    return {
        data: params.carryIds
            .map((id) => itemsById.get(id))
            .filter((item): item is FocusFeedItem => Boolean(item)),
        invalidRowCount,
        error: null,
    };
}

async function buildFocusResponse(params: {
    requestId: string;
    request: FocusRequest;
    completedIds?: string[];
    savedIds?: string[];
}) {
    const { limit, seed } = params.request;
    const excludeIds = dedupeIds([
        ...params.request.excludeIds,
        ...(params.completedIds ?? []),
    ]);
    const decodedCursor = decodeFocusCursor(params.request.cursor);
    if (!decodedCursor.success) {
        return apiError("VALIDATION_ERROR", "Invalid focus feed cursor.", 400, params.requestId);
    }

    const supabase = createPublicServerClient();
    const excluded = new Set(excludeIds);
    let invalidRowCount = 0;
    const collectedIds = new Set<string>();
    const candidateItems: FocusFeedItem[] = [];
    let scanCursor = decodedCursor.cursor.scanCursor;
    let lastScannedCursor = scanCursor;
    let reachedEnd = false;

    const candidateWindowSize = Math.max(limit + 1, limit * CANDIDATE_WINDOW_MULTIPLIER);
    const carryResult = await loadCarryItems({
        supabase,
        carryIds: decodedCursor.cursor.carryIds,
    });

    if (carryResult.error) {
        logApiError({
            requestId: params.requestId,
            route: "/api/focus",
            message: "Failed to fetch carried focus feed content",
            error: carryResult.error,
        });
        return apiError("INTERNAL_ERROR", "Failed to fetch focus feed.", 500, params.requestId);
    }

    invalidRowCount += carryResult.invalidRowCount;
    carryResult.data.forEach((item) => {
        if (excluded.has(item.id) || collectedIds.has(item.id)) {
            return;
        }

        collectedIds.add(item.id);
        candidateItems.push(item);
    });

    while (candidateItems.length < candidateWindowSize) {
        let query = supabase
            .from("content_item")
            .select(FOCUS_SELECT)
            .eq("status", "verified")
            .is("deleted_at", null)
            .not("quick_mode_json", "is", null);

        if (scanCursor) {
            query = query.gt("id", scanCursor);
        }

        const { data, error } = await query
            .order("id", { ascending: true })
            .limit(PAGE_SIZE);

        if (error) {
            logApiError({
                requestId: params.requestId,
                route: "/api/focus",
                message: "Failed to fetch focus feed content",
                error,
            });
            return apiError("INTERNAL_ERROR", "Failed to fetch focus feed.", 500, params.requestId);
        }

        const pageItems = (data ?? []) as FocusFeedItem[];

        if (pageItems.length === 0) {
            reachedEnd = true;
            break;
        }

        pageItems.forEach((item) => {
            const parsedItem = parseFocusItem(item);
            if (!parsedItem) {
                invalidRowCount += 1;
                return;
            }

            if (excluded.has(parsedItem.id) || collectedIds.has(parsedItem.id)) {
                return;
            }

            collectedIds.add(parsedItem.id);
            candidateItems.push(parsedItem);
        });

        const pageCursor = pageItems[pageItems.length - 1]?.id ?? null;
        lastScannedCursor = pageCursor ?? lastScannedCursor;
        scanCursor = pageCursor ?? scanCursor;

        if (pageItems.length < PAGE_SIZE) {
            reachedEnd = true;
            break;
        }
    }

    if (invalidRowCount > 0) {
        console.warn({
            requestId: params.requestId,
            route: "/api/focus",
            message: "Dropped invalid focus feed rows",
            error: { invalid_row_count: invalidRowCount },
        });
    }

    const personalizationSeedIds = dedupeIds([
        ...(params.completedIds ?? []),
        ...(params.savedIds ?? []),
    ]);
    const personalizedLimit = getPersonalizedItemLimit(limit);
    const personalizedCandidates = await loadPersonalizedFocusItems({
        supabase,
        requestId: params.requestId,
        seedIds: personalizationSeedIds,
        excludeIds: dedupeIds([...excludeIds, ...personalizationSeedIds]),
        limit: personalizedLimit,
    });
    const personalizedItems = selectDiversifiedItems(
        personalizedCandidates,
        personalizedLimit,
        seed,
        { preferInputOrder: true },
    );
    const personalizedIds = new Set(personalizedItems.map((item) => item.id));
    const discoveryItems = selectDiversifiedItems(
        candidateItems.filter((item) => !personalizedIds.has(item.id)),
        limit - personalizedItems.length,
        seed,
    );
    const items = [...personalizedItems, ...discoveryItems];
    const selectedIds = new Set(items.map((item) => item.id));
    const remainingCarryIds = candidateItems
        .map((item) => item.id)
        .filter((id) => !selectedIds.has(id))
        .slice(0, PAGE_SIZE);
    const hasMore = remainingCarryIds.length > 0 || !reachedEnd;
    const nextCursor = hasMore
        ? encodeFocusCursor({
            v: 1,
            scanCursor: lastScannedCursor,
            carryIds: remainingCarryIds,
        })
        : null;

    return NextResponse.json({
        items,
        pageInfo: {
            hasMore,
            nextCursor: hasMore ? nextCursor : null,
        },
    }, {
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

async function enforceFocusRateLimit(request: NextRequest) {
    const rateLimitResult = await strictPublicRateLimit(request, {
        limit: 30,
        windowMs: 60_000,
        routeLabel: "/api/focus",
    });

    return rateLimitResult.success
        ? null
        : rateLimitFailureResponse(rateLimitResult, "Too many requests.");
}

/**
 * Legacy generic Focus endpoint. The app uses POST so reading history stays
 * out of URLs, but retaining GET avoids breaking existing public callers.
 */
export async function GET(request: NextRequest) {
    const rateLimitResponse = await enforceFocusRateLimit(request);
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    const requestId = getRequestId();
    const parsedQuery = FOCUS_REQUEST_SCHEMA.safeParse({
        limit: request.nextUrl.searchParams.get("limit") ?? undefined,
        excludeIds: (request.nextUrl.searchParams.get("excludeIds") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
        seed: request.nextUrl.searchParams.get("seed") ?? undefined,
    });

    if (!parsedQuery.success) {
        return apiError("VALIDATION_ERROR", "Invalid focus feed query.", 400, requestId);
    }

    return buildFocusResponse({ requestId, request: parsedQuery.data });
}

export async function POST(request: NextRequest) {
    const rateLimitResponse = await enforceFocusRateLimit(request);
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    const requestId = getRequestId();
    let body: unknown;

    try {
        body = await request.json();
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/focus",
            message: "Focus request parse error",
            error,
        });
        return apiError("INVALID_JSON", "Invalid focus feed request.", 400, requestId);
    }

    const parsedBody = FOCUS_PERSONALIZED_REQUEST_SCHEMA.safeParse(body);
    if (!parsedBody.success) {
        return apiError("VALIDATION_ERROR", "Invalid focus feed request.", 400, requestId);
    }

    const { completedIds, savedIds, ...focusRequest } = parsedBody.data;
    return buildFocusResponse({
        requestId,
        request: focusRequest,
        completedIds,
        savedIds,
    });
}
