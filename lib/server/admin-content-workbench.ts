import { getAdminContentSortOrder } from "@/lib/admin-content-sort";
import {
    DEFAULT_ADMIN_CONTENT_PAGE_SIZE,
    DEFAULT_ADMIN_CONTENT_VIEW_STATE,
    getAdminContentViewStateFromSearchParams,
} from "@/lib/admin-content-query";
import { getAdminAiReadinessMap } from "@/lib/server/admin-ai-readiness";
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
    embedding: unknown;
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

function toTimestamp(value: string | null | undefined) {
    return value ? new Date(value).getTime() : 0;
}

function sortItems(items: AdminContentWorkbenchItem[], sort: ReturnType<typeof getAdminContentViewStateFromSearchParams>["sort"]) {
    const { column, ascending } = getAdminContentSortOrder(sort);

    return [...items].sort((left, right) => {
        const primaryDifference = toTimestamp(left[column]) - toTimestamp(right[column]);
        if (primaryDifference !== 0) {
            return ascending ? primaryDifference : -primaryDifference;
        }

        const createdDifference = toTimestamp(left.created_at) - toTimestamp(right.created_at);
        if (createdDifference !== 0) {
            return -createdDifference;
        }

        return left.id.localeCompare(right.id);
    });
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
        .select("id, title, type, author, status, is_featured, embedding, audio_url, narration_status, narration_error, narration_requested_at, narration_started_at, narration_completed_at, created_at, updated_at, deleted_at", { count: "exact" })
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

        const aiReadinessById = await getAdminAiReadinessMap(
            supabase as any,
            items.map((item) => ({
                id: item.id,
                status: item.status,
                embedding: item.embedding,
            }))
        );
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

    const { data: allData, error } = await baseQuery;

    if (error) {
        throw error;
    }

    const allItems = (allData ?? []) as AdminContentWorkbenchItem[];
    const aiReadinessById = await getAdminAiReadinessMap(
        supabase as any,
        allItems.map((item) => ({
            id: item.id,
            status: item.status,
            embedding: item.embedding,
        }))
    );
    const filteredItems = sortItems(
        allItems.filter((item) => aiReadinessById[item.id]?.status === "stale"),
        viewState.sort
    );
    const totalItems = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / viewState.pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const from = (currentPage - 1) * viewState.pageSize;
    const items = filteredItems.slice(from, from + viewState.pageSize);
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
