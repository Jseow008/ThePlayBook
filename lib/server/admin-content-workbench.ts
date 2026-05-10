import { getAdminContentSortOrder } from "@/lib/admin-content-sort";
import {
    DEFAULT_ADMIN_CONTENT_PAGE_SIZE,
    DEFAULT_ADMIN_CONTENT_VIEW_STATE,
    getAdminContentViewStateFromSearchParams,
} from "@/lib/admin-content-query";
import {
    getAdminAiReadinessFromCounts,
    getAdminAiReadinessMap,
    type AdminAiReadiness,
} from "@/lib/server/admin-ai-readiness";
import type { NarrationCostEstimate } from "@/lib/narration-cost";
import type { NarrationJobStatus } from "@/lib/narration-job";
import { getNarrationEstimatesByContentId } from "@/lib/server/narration-estimate";
import { escapePostgrestLikeValue } from "@/lib/postgrest-filters";

type AdminSupabaseClient = {
    from: (table: string) => {
        select: (columns: string, options?: { count?: "exact" }) => any;
    };
};

export type AdminContentWorkbenchItem = {
    id: string;
    title: string;
    type: "podcast" | "book" | "article" | "video" | string;
    author: string | null;
    status: "draft" | "verified";
    is_featured: boolean;
    embedding?: unknown;
    audio_url: string | null;
    narration_status: NarrationJobStatus | null;
    narration_error: string | null;
    narration_requested_at: string | null;
    narration_started_at: string | null;
    narration_completed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    deleted_at: string | null;
};

export type AdminNarrationEstimateById = Record<string, NarrationCostEstimate | null>;

type SearchParamsInput = {
    page?: string;
    page_size?: string;
    status?: string;
    type?: string;
    featured?: string;
    q?: string;
    sort?: string;
    ai?: string;
    voice?: string;
    narration_warning?: string;
};

type AdminContentWorkbenchReadinessRow = AdminContentWorkbenchItem & {
    has_content_embedding: boolean | null;
    total_segments: number | null;
    embedded_segments: number | null;
};

const ADMIN_CONTENT_WORKBENCH_SELECT = "id, title, type, author, status, is_featured, embedding, audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at, created_at, updated_at, deleted_at";
const ADMIN_CONTENT_WORKBENCH_READINESS_SELECT = "id, title, type, author, status, is_featured, audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at, created_at, updated_at, deleted_at, has_content_embedding, total_segments, embedded_segments";

function toAiReadinessByIdFromRows(rows: AdminContentWorkbenchReadinessRow[]) {
    return rows.reduce<Record<string, AdminAiReadiness>>((accumulator, row) => {
        accumulator[row.id] = getAdminAiReadinessFromCounts({
            status: row.status,
            hasContentEmbedding: Boolean(row.has_content_embedding),
            totalSegments: Number(row.total_segments ?? 0),
            embeddedSegments: Number(row.embedded_segments ?? 0),
        });
        return accumulator;
    }, {});
}

export async function getAdminContentWorkbenchData(
    supabase: AdminSupabaseClient,
    params: SearchParamsInput,
    basePath: string
) {
    const requestedPage = Math.max(1, Number(params.page) || 1);
    const viewState = getAdminContentViewStateFromSearchParams({
        status: params.status,
        type: params.type,
        featured: params.featured,
        sort: params.sort,
        ai: params.ai,
        voice: params.voice,
        page_size: params.page_size,
    });
    const searchQuery = params.q?.trim() || "";
    const narrationWarning = params.narration_warning || "";
    const returnParams = new URLSearchParams();

    if (requestedPage > 1) {
        returnParams.set("page", String(requestedPage));
    }
    if (viewState.pageSize !== DEFAULT_ADMIN_CONTENT_PAGE_SIZE) {
        returnParams.set("page_size", String(viewState.pageSize));
    }
    if (viewState.status !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.status) {
        returnParams.set("status", viewState.status);
    }
    if (viewState.type !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.type) {
        returnParams.set("type", viewState.type);
    }
    if (viewState.featured) {
        returnParams.set("featured", "true");
    }
    if (searchQuery) {
        returnParams.set("q", searchQuery);
    }
    if (viewState.sort !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.sort) {
        returnParams.set("sort", viewState.sort);
    }
    if (viewState.ai !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.ai) {
        returnParams.set("ai", viewState.ai);
    }
    if (viewState.voice !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.voice) {
        returnParams.set("voice", viewState.voice);
    }

    const returnTo = returnParams.toString() ? `${basePath}?${returnParams.toString()}` : basePath;

    let baseQuery = (supabase
        .from("content_item") as any)
        .select(ADMIN_CONTENT_WORKBENCH_SELECT, { count: "exact" })
        .is("deleted_at", null);

    if (viewState.status !== "all") {
        baseQuery = baseQuery.eq("status", viewState.status);
    }

    if (viewState.type !== "all") {
        baseQuery = baseQuery.eq("type", viewState.type);
    }

    if (viewState.featured) {
        baseQuery = baseQuery.eq("is_featured", true);
    }

    if (viewState.voice === "missing") {
        baseQuery = baseQuery.is("audio_url", null);
    } else if (viewState.voice === "stale") {
        baseQuery = baseQuery.eq("narration_status", "stale");
    }

    if (searchQuery) {
        const searchTerm = escapePostgrestLikeValue(searchQuery);
        baseQuery = baseQuery.or(`title.ilike.${searchTerm},author.ilike.${searchTerm}`);
    }

    if (viewState.ai !== "stale") {
        const { column, ascending } = getAdminContentSortOrder(viewState.sort);
        const buildOrderedQuery = () => {
            let orderedQuery = baseQuery.order(column, { ascending });

            if (column !== "created_at") {
                orderedQuery = orderedQuery.order("created_at", { ascending: false });
            }

            return orderedQuery.order("id", { ascending: true });
        };

        const { data, count, error } = await buildOrderedQuery()
            .range((requestedPage - 1) * viewState.pageSize, requestedPage * viewState.pageSize - 1);

        if (error) {
            throw error;
        }

        const totalItems = count ?? (data ?? []).length;
        const totalPages = Math.max(1, Math.ceil(totalItems / viewState.pageSize));
        const currentPage = Math.min(requestedPage, totalPages);
        let items = (data ?? []) as AdminContentWorkbenchItem[];

        if (currentPage !== requestedPage) {
            const fallbackResult = await buildOrderedQuery()
                .range((currentPage - 1) * viewState.pageSize, currentPage * viewState.pageSize - 1);

            if (fallbackResult.error) {
                throw fallbackResult.error;
            }

            items = (fallbackResult.data ?? []) as AdminContentWorkbenchItem[];
        }

        const [aiReadinessById, narrationEstimatesById] = await Promise.all([
            getAdminAiReadinessMap(
                supabase as any,
                items.map((item) => ({
                    id: item.id,
                    status: item.status,
                    embedding: item.embedding,
                }))
            ),
            getNarrationEstimatesByContentId(
                supabase as any,
                items.map((item) => item.id)
            ),
        ]);

        return {
            items,
            aiReadinessById,
            narrationEstimatesById,
            narrationWarning,
            totalItems,
            totalPages,
            currentPage,
            pageSize: viewState.pageSize,
            returnTo,
            searchQuery,
            viewState,
        };
    }

    let staleQuery = (supabase
        .from("admin_content_workbench_readiness") as any)
        .select(ADMIN_CONTENT_WORKBENCH_READINESS_SELECT, { count: "exact" })
        .is("deleted_at", null)
        .eq("ai_status", "stale");

    if (viewState.status !== "all") {
        staleQuery = staleQuery.eq("status", viewState.status);
    }

    if (viewState.type !== "all") {
        staleQuery = staleQuery.eq("type", viewState.type);
    }

    if (viewState.featured) {
        staleQuery = staleQuery.eq("is_featured", true);
    }

    if (viewState.voice === "missing") {
        staleQuery = staleQuery.is("audio_url", null);
    } else if (viewState.voice === "stale") {
        staleQuery = staleQuery.eq("narration_status", "stale");
    }

    if (searchQuery) {
        const searchTerm = escapePostgrestLikeValue(searchQuery);
        staleQuery = staleQuery.or(`title.ilike.${searchTerm},author.ilike.${searchTerm}`);
    }

    const { column, ascending } = getAdminContentSortOrder(viewState.sort);
    const buildOrderedStaleQuery = () => {
        let orderedQuery = staleQuery.order(column, { ascending });

        if (column !== "created_at") {
            orderedQuery = orderedQuery.order("created_at", { ascending: false });
        }

        return orderedQuery.order("id", { ascending: true });
    };

    const { data, count, error } = await buildOrderedStaleQuery()
        .range((requestedPage - 1) * viewState.pageSize, requestedPage * viewState.pageSize - 1);

    if (error) {
        throw error;
    }

    const totalItems = count ?? (data ?? []).length;
    const totalPages = Math.max(1, Math.ceil(totalItems / viewState.pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    let rows = (data ?? []) as AdminContentWorkbenchReadinessRow[];

    if (currentPage !== requestedPage) {
        const fallbackResult = await buildOrderedStaleQuery()
            .range((currentPage - 1) * viewState.pageSize, currentPage * viewState.pageSize - 1);

        if (fallbackResult.error) {
            throw fallbackResult.error;
        }

        rows = (fallbackResult.data ?? []) as AdminContentWorkbenchReadinessRow[];
    }

    const items = rows as AdminContentWorkbenchItem[];
    const aiReadinessById = toAiReadinessByIdFromRows(rows);
    const narrationEstimatesById = await getNarrationEstimatesByContentId(
        supabase as any,
        items.map((item) => item.id)
    );

    return {
        items,
        aiReadinessById,
        narrationEstimatesById,
        narrationWarning,
        totalItems,
        totalPages,
        currentPage,
        pageSize: viewState.pageSize,
        returnTo,
        searchQuery,
        viewState,
    };
}
