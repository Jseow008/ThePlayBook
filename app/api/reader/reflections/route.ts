import { NextRequest, NextResponse } from "next/server";
import { GET as loadReflections } from "@/app/api/library/reflections/route";
import { createClient } from "@/lib/supabase/server";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import type { ReflectionWithContent } from "@/hooks/useReflections";

export async function GET(request: NextRequest) {
    const response = await loadReflections(request);
    if (!response.ok) return response;

    try {
        const { data: rows }: { data: ReflectionWithContent[] } = await response.json();
        const missing = rows.filter(row => !row.content_item).map(row => row.content_item_id);
        if (!missing.length) return NextResponse.json({ data: rows });

        const supabase = await createClient();
        const replacements = await supabase.from("content_replacement")
            .select("source_id, source_title").in("source_id", missing).returns<{ source_id: string; source_title: string }[]>();
        if (replacements.error) throw replacements.error;
        const titles = new Map(replacements.data.map(row => [row.source_id, row.source_title]));
        return NextResponse.json({ data: rows.map(row => {
            const title = titles.get(row.content_item_id);
            return !row.content_item && title
                ? { ...row, content_item: { id: row.content_item_id, title, author: null, cover_image_url: null } }
                : row;
        }) });
    } catch (error) {
        const requestId = getRequestId();
        logApiError({ requestId, route: "GET /api/reader/reflections", message: "Unexpected error loading reflections", error });
        return apiError("INTERNAL_ERROR", "Failed to load reflections.", 500, requestId);
    }
}
