export const ADMIN_CONTENT_SORT_OPTIONS = [
    "created_desc",
    "created_asc",
    "updated_desc",
    "updated_asc",
] as const;

export type AdminContentSort = (typeof ADMIN_CONTENT_SORT_OPTIONS)[number];

export const DEFAULT_ADMIN_CONTENT_SORT: AdminContentSort = "created_desc";

export const ADMIN_CONTENT_SORT_LABELS: Record<AdminContentSort, string> = {
    created_desc: "Newest Created",
    created_asc: "Oldest Created",
    updated_desc: "Recently Updated",
    updated_asc: "Least Recently Updated",
};

export function normalizeAdminContentSort(value: string | null | undefined): AdminContentSort {
    if (!value) {
        return DEFAULT_ADMIN_CONTENT_SORT;
    }

    return ADMIN_CONTENT_SORT_OPTIONS.includes(value as AdminContentSort)
        ? (value as AdminContentSort)
        : DEFAULT_ADMIN_CONTENT_SORT;
}

export function getAdminContentSortOrder(sort: AdminContentSort): {
    column: "created_at" | "updated_at";
    ascending: boolean;
} {
    switch (sort) {
        case "created_asc":
            return { column: "created_at", ascending: true };
        case "updated_desc":
            return { column: "updated_at", ascending: false };
        case "updated_asc":
            return { column: "updated_at", ascending: true };
        case "created_desc":
        default:
            return { column: "created_at", ascending: false };
    }
}
