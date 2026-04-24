import {
    type AdminContentSort,
    DEFAULT_ADMIN_CONTENT_SORT,
    normalizeAdminContentSort,
} from "@/lib/admin-content-sort";

export const ADMIN_CONTENT_TYPE_OPTIONS = [
    "all",
    "book",
    "podcast",
    "article",
    "video",
] as const;

export type AdminContentTypeFilter = (typeof ADMIN_CONTENT_TYPE_OPTIONS)[number];

export const ADMIN_CONTENT_AI_FILTER_OPTIONS = [
    "all",
    "stale",
] as const;

export type AdminContentAiFilter = (typeof ADMIN_CONTENT_AI_FILTER_OPTIONS)[number];

export const ADMIN_CONTENT_VOICE_FILTER_OPTIONS = [
    "all",
    "missing",
    "stale",
] as const;

export type AdminContentVoiceFilter = (typeof ADMIN_CONTENT_VOICE_FILTER_OPTIONS)[number];

export const ADMIN_CONTENT_PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;

export type AdminContentPageSize = (typeof ADMIN_CONTENT_PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_ADMIN_CONTENT_PAGE_SIZE: AdminContentPageSize = 5;

export type AdminContentViewState = {
    status: "all" | "verified" | "draft";
    type: AdminContentTypeFilter;
    featured: boolean;
    sort: AdminContentSort;
    ai: AdminContentAiFilter;
    voice: AdminContentVoiceFilter;
    pageSize: AdminContentPageSize;
};

export const DEFAULT_ADMIN_CONTENT_VIEW_STATE: AdminContentViewState = {
    status: "all",
    type: "all",
    featured: false,
    sort: DEFAULT_ADMIN_CONTENT_SORT,
    ai: "all",
    voice: "all",
    pageSize: DEFAULT_ADMIN_CONTENT_PAGE_SIZE,
};

export function normalizeAdminContentStatus(value: string | null | undefined): AdminContentViewState["status"] {
    return value === "verified" || value === "draft" ? value : "all";
}

export function normalizeAdminContentType(value: string | null | undefined): AdminContentTypeFilter {
    return ADMIN_CONTENT_TYPE_OPTIONS.includes(value as AdminContentTypeFilter)
        ? (value as AdminContentTypeFilter)
        : "all";
}

export function normalizeAdminContentAiFilter(value: string | null | undefined): AdminContentAiFilter {
    return ADMIN_CONTENT_AI_FILTER_OPTIONS.includes(value as AdminContentAiFilter)
        ? (value as AdminContentAiFilter)
        : "all";
}

export function normalizeAdminContentVoiceFilter(value: string | null | undefined): AdminContentVoiceFilter {
    return ADMIN_CONTENT_VOICE_FILTER_OPTIONS.includes(value as AdminContentVoiceFilter)
        ? (value as AdminContentVoiceFilter)
        : "all";
}

export function normalizeAdminContentPageSize(value: string | number | null | undefined): AdminContentPageSize {
    const numericValue = typeof value === "number" ? value : Number(value);

    return ADMIN_CONTENT_PAGE_SIZE_OPTIONS.includes(numericValue as AdminContentPageSize)
        ? (numericValue as AdminContentPageSize)
        : DEFAULT_ADMIN_CONTENT_PAGE_SIZE;
}

export function getAdminContentViewStateFromSearchParams(params: {
    status?: string | null;
    type?: string | null;
    featured?: string | null;
    sort?: string | null;
    ai?: string | null;
    voice?: string | null;
    page_size?: string | null;
}): AdminContentViewState {
    return {
        status: normalizeAdminContentStatus(params.status),
        type: normalizeAdminContentType(params.type),
        featured: params.featured === "true",
        sort: normalizeAdminContentSort(params.sort),
        ai: normalizeAdminContentAiFilter(params.ai),
        voice: normalizeAdminContentVoiceFilter(params.voice),
        pageSize: normalizeAdminContentPageSize(params.page_size),
    };
}
