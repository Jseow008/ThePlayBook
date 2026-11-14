import { getCachedContentBatch } from "@/lib/server/content-batch-cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimitFailureResponse, strictPublicRateLimit } from "@/lib/server/rate-limit";
import { createLibraryRouteTiming } from "@/lib/server/library-route-timing";

const BatchRequestSchema = z.object({
    ids: z.array(z.guid()).min(1).max(50),
});

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

        const { items, cache, checkedAt } = await timing.measure("content", () => getCachedContentBatch(ids));

        return NextResponse.json(items, {
            headers: {
                "Cache-Control": "no-store",
                "X-Content-Cache": cache,
                "X-Content-Fresh-For": String(Math.max(0, 60_000 - (Date.now() - checkedAt))),
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
