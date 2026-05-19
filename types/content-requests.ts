import type { ContentType } from "@/types/database";

export type ContentRequestStatus =
    | "requested"
    | "under_review"
    | "in_progress"
    | "published"
    | "source_unavailable"
    | "archived";

export interface ContentRequestBoardItem {
    id: string;
    title: string;
    author: string | null;
    source_url: string | null;
    content_type: ContentType;
    thumbnail_url: string | null;
    status: ContentRequestStatus;
    vote_count: number;
    created_at: string;
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
