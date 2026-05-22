import type { ContentType } from "@/types/database";

export const CONTENT_REQUEST_STATUSES = ["pending", "processing", "published", "skipped", "failed"] as const;

export type ContentRequestStatus = typeof CONTENT_REQUEST_STATUSES[number];

export function normalizeContentRequestStatus(value: unknown): ContentRequestStatus {
    if (value === "pending" || value === "processing" || value === "published" || value === "skipped" || value === "failed") {
        return value;
    }

    if (value === "under_review" || value === "in_progress") {
        return "processing";
    }

    if (value === "source_unavailable" || value === "archived") {
        return "skipped";
    }

    return "pending";
}

export interface ContentRequestBoardItem {
    id: string;
    title: string;
    author: string | null;
    source_url: string | null;
    content_type: ContentType;
    thumbnail_url: string | null;
    status: ContentRequestStatus;
    source_availability_note: string | null;
    vote_count: number;
    created_at: string;
    updated_at: string;
    published_content: {
        id: string;
        title: string;
    } | null;
}

export interface ContentRequestMutationResult {
    request: ContentRequestBoardItem;
    voted: boolean;
    duplicate: boolean;
}
