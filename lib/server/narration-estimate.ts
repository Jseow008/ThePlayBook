import type { NarrationCostEstimate } from "@/lib/narration-cost";
import { NarrationError, estimateNarrationCost } from "@/lib/server/ai-narration";

type SegmentRow = {
    id: string;
    order_index: number;
    title: string | null;
    markdown_body: string;
    deleted_at?: string | null;
};

type ContentNarrationSourceRow = {
    id: string;
    title: string;
    author: string | null;
    quick_mode_json?: {
        hook?: string | null;
        big_idea?: string | null;
        key_takeaways?: string[] | null;
    } | null;
    segments?: SegmentRow[] | null;
};

type NarrationEstimateSupabaseClient = {
    from: (table: string) => {
        select: (columns: string) => any;
    };
};

function toNarrationEstimate(row: ContentNarrationSourceRow): NarrationCostEstimate | null {
    const segments = (row.segments ?? []).filter((segment) => !segment.deleted_at);

    try {
        return estimateNarrationCost({
            title: row.title,
            author: row.author,
            quick_mode_json: row.quick_mode_json ?? null,
            segments,
        });
    } catch (error) {
        if (error instanceof NarrationError && error.code === "NARRATION_EMPTY") {
            return null;
        }

        throw error;
    }
}

export async function getNarrationEstimateByContentId(
    supabase: NarrationEstimateSupabaseClient,
    contentId: string
) {
    const { data, error } = await (supabase.from("content_item") as any)
        .select(`
            id,
            title,
            author,
            quick_mode_json,
            segments:segment(id, order_index, title, markdown_body, deleted_at)
        `)
        .eq("id", contentId)
        .is("deleted_at", null)
        .order("order_index", { referencedTable: "segment" })
        .single();

    if (error) {
        throw error;
    }

    if (!data) {
        return null;
    }

    return toNarrationEstimate(data as ContentNarrationSourceRow);
}

export async function getNarrationEstimatesByContentId(
    supabase: NarrationEstimateSupabaseClient,
    contentIds: string[]
) {
    const uniqueIds = [...new Set(contentIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
        return {} as Record<string, NarrationCostEstimate | null>;
    }

    const { data, error } = await (supabase.from("content_item") as any)
        .select(`
            id,
            title,
            author,
            quick_mode_json,
            segments:segment(id, order_index, title, markdown_body, deleted_at)
        `)
        .in("id", uniqueIds)
        .is("deleted_at", null)
        .order("order_index", { referencedTable: "segment" });

    if (error) {
        throw error;
    }

    const rows = (data ?? []) as ContentNarrationSourceRow[];
    const estimateById = uniqueIds.reduce<Record<string, NarrationCostEstimate | null>>((accumulator, id) => {
        accumulator[id] = null;
        return accumulator;
    }, {});

    for (const row of rows) {
        estimateById[row.id] = toNarrationEstimate(row);
    }

    return estimateById;
}
