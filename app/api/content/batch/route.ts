import { createPublicServerClient } from "@/lib/supabase/public-server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const BatchRequestSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(50),
});

const CONTENT_BATCH_SELECT = "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, created_at";

/**
 * POST /api/content/batch
 * 
 * Fetch multiple content items by their IDs.
 * Used for My Library pages to efficiently load reading history.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { ids } = BatchRequestSchema.parse(body);

        const supabase = createPublicServerClient();

        const { data, error } = await supabase
            .from("content_item")
            .select(CONTENT_BATCH_SELECT)
            .in("id", ids)
            .eq("status", "verified")
            .is("deleted_at", null);

        if (error) {
            console.error("Batch fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch content" },
                { status: 500 }
            );
        }

        return NextResponse.json(data || [], {
            headers: {
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.errors },
                { status: 400 }
            );
        }
        console.error("Batch API error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
