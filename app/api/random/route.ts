import { NextResponse } from "next/server";
import { createPublicServerClient } from "@/lib/supabase/public-server";

/**
 * GET /api/random
 * 
 * Returns a random published content item.
 */
export async function GET() {
    const supabase = createPublicServerClient();

    // Get total published count first (cheap head request)
    const { count, error: countError } = await supabase
        .from("content_item")
        .select("id", { head: true, count: "exact" })
        .eq("status", "verified")
        .is("deleted_at", null);

    if (countError || !count || count === 0) {
        return NextResponse.json({ error: "No content available" }, { status: 404 });
    }

    // Pick random offset and fetch only one row
    const randomIndex = Math.floor(Math.random() * count);
    const { data: randomRow, error: rowError } = await supabase
        .from("content_item")
        .select("id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, created_at")
        .eq("status", "verified")
        .is("deleted_at", null)
        .range(randomIndex, randomIndex)
        .single();

    if (rowError || !randomRow) {
        return NextResponse.json({ error: "Failed to fetch content" }, { status: 500 });
    }

    return NextResponse.json(randomRow, {
        headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
        }
    });
}
