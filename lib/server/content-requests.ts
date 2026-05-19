import { getAdminClient } from "@/lib/supabase/admin";
import type { ContentRequestBoardItem } from "@/types/content-requests";

export interface AdminContentRequest extends ContentRequestBoardItem {
    hidden_at: string | null;
    hidden_reason: string | null;
    updated_at: string;
}

const REQUEST_SELECT = `
  id,
  title,
  author,
  source_url,
  content_type,
  thumbnail_url,
  status,
  vote_count,
  created_at,
  published_content:content_item!content_requests_published_content_id_fkey (
    id,
    title
  )
`;

function isMissingContentRequestTable(error: unknown) {
    return Boolean(
        error
        && typeof error === "object"
        && "code" in error
        && (error as { code?: unknown }).code === "PGRST205"
    );
}

function getRelation<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value;
}

export function mapRequestRow(row: any): ContentRequestBoardItem {
    const publishedContent = getRelation(row.published_content);

    return {
        id: row.id,
        title: row.title,
        author: row.author ?? null,
        source_url: row.source_url ?? null,
        content_type: row.content_type,
        thumbnail_url: row.thumbnail_url ?? null,
        status: row.status,
        vote_count: Number(row.vote_count ?? 0),
        created_at: row.created_at,
        published_content: publishedContent
            ? {
                id: publishedContent.id,
                title: publishedContent.title,
            }
            : null,
    };
}

export async function fetchVisibleContentRequests() {
    const supabase = getAdminClient();
    const { data, error } = await (supabase as any).from("content_requests")
        .select(REQUEST_SELECT)
        .is("hidden_at", null)
        .neq("status", "archived")
        .order("vote_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) {
        if (isMissingContentRequestTable(error)) {
            return [];
        }
        throw error;
    }

    return (data ?? []).map(mapRequestRow);
}

export async function fetchAdminContentRequests(): Promise<AdminContentRequest[]> {
    const supabase = getAdminClient();
    const { data, error } = await (supabase as any).from("content_requests")
        .select(`${REQUEST_SELECT}, hidden_at, hidden_reason, updated_at`)
        .order("created_at", { ascending: false })
        .limit(200);

    if (error) {
        if (isMissingContentRequestTable(error)) {
            return [];
        }
        throw error;
    }

    return (data ?? []).map((row: any) => ({
        ...mapRequestRow(row),
        hidden_at: row.hidden_at ?? null,
        hidden_reason: row.hidden_reason ?? null,
        updated_at: row.updated_at,
    }));
}

export async function fetchContentRequestById(id: string) {
    const supabase = getAdminClient();
    const { data, error } = await (supabase as any).from("content_requests")
        .select(REQUEST_SELECT)
        .eq("id", id)
        .maybeSingle();

    if (error) {
        if (isMissingContentRequestTable(error)) {
            return null;
        }
        throw error;
    }

    return data ? mapRequestRow(data) : null;
}

export async function fetchUserRequestVoteIds(userId: string) {
    const supabase = getAdminClient();
    const { data, error } = await (supabase as any).from("content_request_votes")
        .select("request_id")
        .eq("user_id", userId);

    if (error) {
        if (isMissingContentRequestTable(error)) {
            return new Set<string>();
        }
        throw error;
    }

    return new Set<string>((data ?? []).map((row: { request_id: string }) => row.request_id));
}
