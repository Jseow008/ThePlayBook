import "server-only";

import { cache } from "react";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";

/** Uses the public policy, so a draft/withdrawn destination is never disclosed. */
export const getContentReplacement = cache(async (id: string) => {
    if (!z.string().uuid().safeParse(id).success) return null;
    const db = createPublicServerClient();
    const { data: notice, error } = await db.from("content_replacement")
        .select("source_id, source_title, replacement_id").eq("source_id", id).maybeSingle();
    // Rolling application deployment can precede this additive migration. A
    // missing table means no notice yet; other failures must not look like 404s.
    if (error?.code === "42P01" || error?.code === "PGRST205") return null;
    if (error) throw error;
    if (!notice) return null;
    const { data: target, error: targetError } = await db.from("content_item")
        .select("id, title").eq("id", notice.replacement_id)
        .eq("status", "verified").is("deleted_at", null).maybeSingle();
    if (targetError) throw targetError;
    return target ? { sourceId: notice.source_id, sourceTitle: notice.source_title, replacement: target } : null;
});
