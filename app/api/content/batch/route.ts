import { createPublicServerClient } from "@/lib/supabase/public-server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";
import { createLibraryRouteTiming } from "@/lib/server/library-route-timing";
import { toContentCardData } from "@/lib/server/content-card-data";

const BatchRequestSchema = z.object({
    ids: z.array(z.guid()).min(1).max(50),
});

const CONTENT_BATCH_SELECT = "id, type, title, source_url, status, quick_mode_json, duration_seconds, author, cover_image_url, category, audio_url, created_at";

/**
 * POST /api/content/batch
 * 
 * Fetch multiple content items by their IDs.
 * Used for My Library pages to efficiently load reading history.
 */
export async function POST(request: NextRequest) {
    const timing = createLibraryRouteTiming();
    // Rate limit: 30 requests per 60 seconds per IP
    const rl = await timing.measure("admission", () => strictPublicRateLimit(request, {
        limit: 30,
        windowMs: 60_000,
        routeLabel: "/api/content/batch",
    }));
    if (!rl.success) {
        const response = rateLimitFailureResponse(rl, "Too many requests.");
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("Server-Timing", timing.header());
        return response;
    }

    try {
        const body = await request.json();
        const { ids } = BatchRequestSchema.parse(body);

        const supabase = createPublicServerClient();

        const { data, error } = await timing.measure("content", () => supabase
            .from("content_item")
            .select(CONTENT_BATCH_SELECT)
            .in("id", ids)
            .eq("status", "verified")
            .is("deleted_at", null));

        if (error) {
            console.error("Batch fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch content" },
                { status: 500, headers: { "Cache-Control": "no-store", "Server-Timing": timing.header() } }
            );
        }

        return NextResponse.json((data || []).map(toContentCardData), {
            headers: {
                "Cache-Control": "no-store",
                "Server-Timing": timing.header(),
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Invalid request", details: error.issues },
                { status: 400, headers: { "Cache-Control": "no-store", "Server-Timing": timing.header() } }
            );
        }
        console.error("Batch API error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500, headers: { "Cache-Control": "no-store", "Server-Timing": timing.header() } }
        );
    }
}
