import {
    LOCAL_SEGMENT_SYNC_COMMAND,
    LOCAL_SEGMENT_SYNC_DRY_RUN_COMMAND,
} from "@/lib/server/gemini-segment-sync";

export const CONTENT_EMBEDDING_SYNC_PATH = "/api/admin/embeddings/sync";
export const CONTENT_EMBEDDING_SYNC_METHOD = "POST";

export type AdminAiReadinessStatus = "not_applicable" | "stale" | "ready";

export type AdminAiReadinessReason =
    | "CONTENT_NOT_VERIFIED"
    | "CONTENT_EMBEDDING_MISSING"
    | "NO_PUBLISHED_SEGMENTS"
    | "SEGMENT_EMBEDDINGS_MISSING";

export type AdminAiReadinessAction =
    | "run_content_embedding_sync"
    | "run_segment_embedding_sync"
    | "add_published_segments";

export type AdminAiReadiness = {
    status: AdminAiReadinessStatus;
    content_embedding: {
        required: boolean;
        ready: boolean;
    };
    segment_embeddings: {
        required: boolean;
        ready: boolean;
        total_segments: number;
        embedded_segments: number;
        missing_segments: number;
    };
    stale_reasons: AdminAiReadinessReason[];
    next_actions: AdminAiReadinessAction[];
};

export type AdminAiReadinessSummary = {
    verified_items: number;
    ai_ready_items: number;
    ai_stale_items: number;
    stale_content_embeddings: number;
    stale_segment_embeddings: number;
    items_without_published_segments: number;
};

export type AdminAiReadinessCounts = {
    status: ContentStatus;
    hasContentEmbedding: boolean;
    totalSegments: number;
    embeddedSegments: number;
};

type ContentStatus = "draft" | "verified" | "deleted" | string | null | undefined;

type ReadinessItem = {
    id: string;
    status: ContentStatus;
    embedding: unknown;
};

type SegmentRow = {
    id: string;
    item_id: string;
    markdown_body: string | null;
};

type SegmentEmbeddingRow = {
    content_item_id: string;
    segment_id: string;
};

type AdminAiReadinessSupabaseClient = {
    from: (table: string) => {
        select: (columns: string, options?: { count?: "exact" }) => {
            in: (column: string, values: string[]) => {
                range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
            };
            eq?: (column: string, value: string) => {
                is?: (column: string, value: null) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
            };
            is: (column: string, value: null) => {
                in: (column: string, values: string[]) => {
                    range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
                };
            };
        };
    };
};

const READINESS_QUERY_PAGE_SIZE = 1000;

function hasText(value: string | null | undefined) {
    return typeof value === "string" && value.trim().length > 0;
}

export function getAdminAiReadiness(params: {
    status: ContentStatus;
    hasContentEmbedding: boolean;
    totalSegments: number;
    embeddedSegments: number;
}): AdminAiReadiness {
    if (params.status !== "verified") {
        return {
            status: "not_applicable",
            content_embedding: {
                required: false,
                ready: false,
            },
            segment_embeddings: {
                required: false,
                ready: false,
                total_segments: 0,
                embedded_segments: 0,
                missing_segments: 0,
            },
            stale_reasons: ["CONTENT_NOT_VERIFIED"],
            next_actions: [],
        };
    }

    const totalSegments = Math.max(0, params.totalSegments);
    const embeddedSegments = Math.max(0, Math.min(params.embeddedSegments, totalSegments));
    const missingSegments = Math.max(0, totalSegments - embeddedSegments);
    const staleReasons: AdminAiReadinessReason[] = [];
    const nextActions: AdminAiReadinessAction[] = [];

    if (!params.hasContentEmbedding) {
        staleReasons.push("CONTENT_EMBEDDING_MISSING");
        nextActions.push("run_content_embedding_sync");
    }

    if (totalSegments === 0) {
        staleReasons.push("NO_PUBLISHED_SEGMENTS");
        nextActions.push("add_published_segments");
    } else if (missingSegments > 0) {
        staleReasons.push("SEGMENT_EMBEDDINGS_MISSING");
        nextActions.push("run_segment_embedding_sync");
    }

    return {
        status: staleReasons.length === 0 ? "ready" : "stale",
        content_embedding: {
            required: true,
            ready: params.hasContentEmbedding,
        },
        segment_embeddings: {
            required: true,
            ready: totalSegments > 0 && missingSegments === 0,
            total_segments: totalSegments,
            embedded_segments: embeddedSegments,
            missing_segments: missingSegments,
        },
        stale_reasons: staleReasons,
        next_actions: nextActions,
    };
}

export function getAdminAiReadinessFromCounts(params: AdminAiReadinessCounts) {
    return getAdminAiReadiness({
        status: params.status,
        hasContentEmbedding: params.hasContentEmbedding,
        totalSegments: params.totalSegments,
        embeddedSegments: params.embeddedSegments,
    });
}

function toSegmentRows(data: unknown[] | null | undefined) {
    if (!Array.isArray(data)) {
        return [];
    }

    return data.filter((row): row is SegmentRow => {
        if (!row || typeof row !== "object") {
            return false;
        }

        const candidate = row as Partial<SegmentRow>;
        return typeof candidate.id === "string" && typeof candidate.item_id === "string";
    });
}

function toSegmentEmbeddingRows(data: unknown[] | null | undefined) {
    if (!Array.isArray(data)) {
        return [];
    }

    return data.filter((row): row is SegmentEmbeddingRow => {
        if (!row || typeof row !== "object") {
            return false;
        }

        const candidate = row as Partial<SegmentEmbeddingRow>;
        return typeof candidate.segment_id === "string" && typeof candidate.content_item_id === "string";
    });
}

export async function getAdminAiReadinessMap(
    supabase: AdminAiReadinessSupabaseClient,
    items: ReadinessItem[]
): Promise<Record<string, AdminAiReadiness>> {
    if (items.length === 0) {
        return {};
    }

    const itemIds = items.map((item) => item.id);
    const [segmentRows, embeddingRows] = await Promise.all([
        loadSegmentRows(supabase, itemIds),
        loadSegmentEmbeddingRows(supabase, itemIds),
    ]);
    const segmentIdsByItem = new Map<string, Set<string>>();
    const totalSegmentsByItem = new Map<string, number>();

    for (const row of segmentRows) {
        if (!hasText(row.markdown_body)) {
            continue;
        }

        totalSegmentsByItem.set(row.item_id, (totalSegmentsByItem.get(row.item_id) ?? 0) + 1);

        const currentIds = segmentIdsByItem.get(row.item_id) ?? new Set<string>();
        currentIds.add(row.id);
        segmentIdsByItem.set(row.item_id, currentIds);
    }

    const embeddedSegmentsByItem = new Map<string, number>();

    for (const row of embeddingRows) {
        const validSegmentIds = segmentIdsByItem.get(row.content_item_id);
        if (!validSegmentIds?.has(row.segment_id)) {
            continue;
        }

        embeddedSegmentsByItem.set(
            row.content_item_id,
            (embeddedSegmentsByItem.get(row.content_item_id) ?? 0) + 1
        );
    }

    return Object.fromEntries(items.map((item) => [
        item.id,
        getAdminAiReadiness({
            status: item.status,
            hasContentEmbedding: item.embedding !== null,
            totalSegments: totalSegmentsByItem.get(item.id) ?? 0,
            embeddedSegments: embeddedSegmentsByItem.get(item.id) ?? 0,
        }),
    ]));
}

async function loadSegmentRows(supabase: AdminAiReadinessSupabaseClient, itemIds: string[]) {
    const segmentRows: SegmentRow[] = [];

    for (let offset = 0; ; offset += READINESS_QUERY_PAGE_SIZE) {
        const segmentResult = await supabase
            .from("segment")
            .select("id, item_id, markdown_body")
            .is("deleted_at", null)
            .in("item_id", itemIds)
            .range(offset, offset + READINESS_QUERY_PAGE_SIZE - 1);

        if (segmentResult.error) {
            throw segmentResult.error;
        }

        const page = toSegmentRows(segmentResult.data);
        segmentRows.push(...page);

        if (page.length < READINESS_QUERY_PAGE_SIZE) {
            break;
        }
    }

    return segmentRows;
}

async function loadSegmentEmbeddingRows(supabase: AdminAiReadinessSupabaseClient, itemIds: string[]) {
    const embeddingRows: SegmentEmbeddingRow[] = [];

    for (let offset = 0; ; offset += READINESS_QUERY_PAGE_SIZE) {
        const embeddingResult = await supabase
            .from("segment_embedding_gemini")
            .select("content_item_id, segment_id")
            .in("content_item_id", itemIds)
            .range(offset, offset + READINESS_QUERY_PAGE_SIZE - 1);

        if (embeddingResult.error) {
            throw embeddingResult.error;
        }

        const page = toSegmentEmbeddingRows(embeddingResult.data);
        embeddingRows.push(...page);

        if (page.length < READINESS_QUERY_PAGE_SIZE) {
            break;
        }
    }

    return embeddingRows;
}

export function summarizeAdminAiReadiness(readinessList: AdminAiReadiness[]): AdminAiReadinessSummary {
    return readinessList.reduce<AdminAiReadinessSummary>((summary, readiness) => {
        if (readiness.status === "not_applicable") {
            return summary;
        }

        summary.verified_items += 1;

        if (readiness.status === "ready") {
            summary.ai_ready_items += 1;
        } else {
            summary.ai_stale_items += 1;
        }

        if (!readiness.content_embedding.ready) {
            summary.stale_content_embeddings += 1;
        }

        if (!readiness.segment_embeddings.ready) {
            summary.stale_segment_embeddings += 1;
        }

        if (readiness.segment_embeddings.total_segments === 0) {
            summary.items_without_published_segments += 1;
        }

        return summary;
    }, {
        verified_items: 0,
        ai_ready_items: 0,
        ai_stale_items: 0,
        stale_content_embeddings: 0,
        stale_segment_embeddings: 0,
        items_without_published_segments: 0,
    });
}

export function getAdminAiReadinessWorkflow() {
    return {
        content_embedding_sync: {
            method: CONTENT_EMBEDDING_SYNC_METHOD,
            path: CONTENT_EMBEDDING_SYNC_PATH,
            description: "Run the admin endpoint to generate missing content-level embeddings for verified items.",
        },
        segment_embedding_sync: {
            command: LOCAL_SEGMENT_SYNC_COMMAND,
            dry_run_command: LOCAL_SEGMENT_SYNC_DRY_RUN_COMMAND,
            description: "Run segment embedding sync from a trusted machine, then refresh admin readiness.",
        },
    };
}
