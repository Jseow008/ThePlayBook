import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import type { Database } from "@/types/database";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/** Point lookup uses the caller session, RLS, and an explicit ownership predicate. */
export async function GET(request: NextRequest, { params }: RouteParams) {
    const requestId = getRequestId();
    const { id } = await params;
    if (!z.guid().safeParse(id).success) return apiError("VALIDATION_ERROR", "Invalid highlight ID.", 400, requestId);
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return apiError("UNAUTHORIZED", "Sign in to open this saved passage.", 401, requestId);
        const { data, error } = await supabase.from("user_highlights")
            .select("*, content_item(id,title,author,cover_image_url), segment(id,title)")
            .eq("id", id).eq("user_id", user.id).maybeSingle();
        if (error) return apiError("INTERNAL_ERROR", "Could not load this saved passage. Please retry.", 500, requestId);
        const highlight = data as (Database["public"]["Tables"]["user_highlights"]["Row"] & { content_item: { id: string } | null }) | null;
        if (highlight && !highlight.content_item) {
            const source = await supabase.from("content_replacement")
                .select("source_title").eq("source_id", highlight.content_item_id)
                .maybeSingle<{ source_title: string }>();
            if (source.error) throw source.error;
            if (source.data) {
                return NextResponse.json({ data: { ...highlight, content_item: {
                    id: highlight.content_item_id, title: source.data.source_title, author: null, cover_image_url: null,
                } } }, { headers: { "Cache-Control": "private, no-store" } });
            }
        }
        if (!highlight || !highlight.content_item) return apiError("NOT_FOUND", "This saved passage was deleted or is no longer accessible.", 404, requestId);
        return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        logApiError({ requestId, route: "GET /api/reader/highlights/[id]", message: "Saved passage lookup failed", error });
        return apiError("INTERNAL_ERROR", "Could not load this saved passage. Please retry.", 500, requestId);
    }
}
