import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import {
    classifyHighlightRange,
    type HighlightRangeRelationship,
} from "@/lib/highlight-ranges";

type HighlightRow = Database["public"]["Tables"]["user_highlights"]["Row"];
type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface HighlightOverlap {
    highlight: HighlightRow;
    relationship: Exclude<HighlightRangeRelationship, "distinct">;
}

interface FindHighlightOverlapArgs {
    supabase: ServerSupabaseClient;
    userId: string;
    contentItemId: string;
    segmentId: string;
    anchorStart: number;
    anchorEnd: number;
    excludeHighlightId?: string;
}

export async function findHighlightOverlap({
    supabase,
    userId,
    contentItemId,
    segmentId,
    anchorStart,
    anchorEnd,
    excludeHighlightId,
}: FindHighlightOverlapArgs): Promise<{ overlap: HighlightOverlap | null; error: unknown }> {
    let query = supabase
        .from("user_highlights")
        .select("*")
        .eq("user_id", userId)
        .eq("content_item_id", contentItemId)
        .eq("segment_id", segmentId)
        .lt("anchor_start", anchorEnd)
        .gt("anchor_end", anchorStart)
        .order("created_at", { ascending: true })
        .limit(1);

    if (excludeHighlightId) {
        query = query.neq("id", excludeHighlightId);
    }

    const result = await query.maybeSingle();
    const data = result.data as HighlightRow | null;
    const { error } = result;

    if (error || !data) {
        return { overlap: null, error };
    }

    if (data.anchor_start === null || data.anchor_end === null) {
        return { overlap: null, error: null };
    }

    const relationship = classifyHighlightRange(
        { start: data.anchor_start, end: data.anchor_end },
        { start: anchorStart, end: anchorEnd }
    );

    if (relationship === "distinct") {
        return { overlap: null, error: null };
    }

    return {
        overlap: {
            highlight: data,
            relationship,
        },
        error: null,
    };
}

export function isHighlightOverlapConstraintError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? (error as { code?: unknown }).code : null;
    return code === "23P01";
}
