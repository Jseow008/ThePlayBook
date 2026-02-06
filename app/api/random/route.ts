import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/random
 * 
 * Returns a random published content item.
 */
export async function GET() {
    const supabase = await createClient();

    // Get all published content IDs
    const { data: items, error } = await supabase
        .from("content_item")
        .select("id")
        .eq("status", "verified")
        .is("deleted_at", null);

    if (error || !items || items.length === 0) {
        return NextResponse.json({ error: "No content available" }, { status: 404 });
    }

    // Pick a random one
    const randomIndex = Math.floor(Math.random() * items.length);
    const randomItem = items[randomIndex];

    return NextResponse.json({ id: randomItem.id });
}
