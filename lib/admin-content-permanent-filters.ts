import {
    DEFAULT_ADMIN_CONTENT_VIEW_STATE,
    getAdminContentViewStateFromSearchParams,
    type AdminContentViewState,
} from "@/lib/admin-content-query";

export const ADMIN_CONTENT_PERMANENT_FILTERS_COOKIE = "admin_content_permanent_filters_v1";

const FILTER_PARAM_KEYS = [
    "page",
    "page_size",
    "status",
    "type",
    "featured",
    "q",
    "sort",
    "ai",
    "voice",
] as const;

export function hasExplicitAdminContentParams(params: Record<string, string | undefined>) {
    return FILTER_PARAM_KEYS.some((key) => Boolean(params[key]));
}

export function isDefaultAdminContentViewState(state: AdminContentViewState) {
    return state.status === DEFAULT_ADMIN_CONTENT_VIEW_STATE.status
        && state.type === DEFAULT_ADMIN_CONTENT_VIEW_STATE.type
        && state.featured === DEFAULT_ADMIN_CONTENT_VIEW_STATE.featured
        && state.sort === DEFAULT_ADMIN_CONTENT_VIEW_STATE.sort
        && state.ai === DEFAULT_ADMIN_CONTENT_VIEW_STATE.ai
        && state.voice === DEFAULT_ADMIN_CONTENT_VIEW_STATE.voice
        && state.pageSize === DEFAULT_ADMIN_CONTENT_VIEW_STATE.pageSize;
}

export function serializeAdminContentPermanentFilters(state: AdminContentViewState) {
    return encodeURIComponent(JSON.stringify(state));
}

export function parseAdminContentPermanentFilters(value: string | null | undefined) {
    if (!value) {
        return null;
    }

    try {
        const decodedValue = decodeURIComponent(value);
        const parsed = JSON.parse(decodedValue) as Partial<AdminContentViewState>;

        return getAdminContentViewStateFromSearchParams({
            status: parsed.status,
            type: parsed.type,
            featured: parsed.featured ? "true" : null,
            sort: parsed.sort,
            ai: parsed.ai,
            voice: parsed.voice,
            page_size: parsed.pageSize ? String(parsed.pageSize) : null,
        });
    } catch {
        return null;
    }
}

export function applyAdminContentViewStateToParams(params: URLSearchParams, state: AdminContentViewState) {
    params.delete("page");
    params.delete("status");
    params.delete("type");
    params.delete("featured");
    params.delete("sort");
    params.delete("ai");
    params.delete("voice");
    params.delete("page_size");

    if (state.status !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.status) {
        params.set("status", state.status);
    }
    if (state.type !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.type) {
        params.set("type", state.type);
    }
    if (state.featured) {
        params.set("featured", "true");
    }
    if (state.sort !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.sort) {
        params.set("sort", state.sort);
    }
    if (state.ai !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.ai) {
        params.set("ai", state.ai);
    }
    if (state.voice !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.voice) {
        params.set("voice", state.voice);
    }
    if (state.pageSize !== DEFAULT_ADMIN_CONTENT_VIEW_STATE.pageSize) {
        params.set("page_size", String(state.pageSize));
    }
}
