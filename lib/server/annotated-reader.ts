import "server-only";

import { z } from "zod";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ContentItemWithSegments } from "@/types/domain";

const readerFields = `
    id,title,type,source_url,status,category,quick_mode_json,duration_seconds,
    author,cover_image_url,audio_url,series_id,series_order,created_at,updated_at,reading_revision,
    segments:segment(id,item_id,order_index,title,markdown_body,start_time_sec,end_time_sec),
    artifacts:artifact(id,type,payload_schema,version)
` as const;

// Archived chapters are outside public RLS. The privileged read must establish
// ownership AND continued availability of the successor in the same statement.
// Empty annotation embeds check existence without returning any personal text.
function ownedVersions<const Fields extends string>(fields: Fields, userId: string) {
    return getAdminClient().from("content_replacement")
        .select(`
            source:content_item!content_replacement_source_id_fkey!inner(
                ${fields},highlights:user_highlights(),reflections:user_reflections()
            ),
            replacement:content_item!content_replacement_replacement_id_fkey!inner(id,title)
        ` as const)
        .eq("source.status", "verified").not("source.deleted_at", "is", null)
        .eq("replacement.status", "verified").is("replacement.deleted_at", null)
        .eq("source.highlights.user_id", userId).eq("source.reflections.user_id", userId)
        .or("highlights.not.is.null,reflections.not.is.null", { referencedTable: "source" });
}

async function currentReaderId(id: string) {
    if (!z.guid().safeParse(id).success) return null;
    const db = await createClient();
    const { data } = await db.auth.getUser();
    return data.user?.id ?? null;
}

export async function getAnnotatedArchiveReader(sourceId: string) {
    const userId = await currentReaderId(sourceId);
    if (!userId) return null;
    const { data, error } = await ownedVersions(readerFields, userId)
        .eq("source_id", sourceId)
        .is("source.segments.deleted_at", null)
        .order("order_index", { referencedTable: "source.segments" })
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { content: data.source as unknown as ContentItemWithSegments, replacement: data.replacement };
}

export async function getAnnotatedEarlierVersion(latestId: string) {
    const userId = await currentReaderId(latestId);
    if (!userId) return null;
    const { data, error } = await ownedVersions("id,title", userId)
        .eq("replacement_id", latestId)
        .order("created_at", { ascending: false }).order("source_id")
        .limit(1).maybeSingle();
    if (error) throw error;
    return data?.source ?? null;
}
