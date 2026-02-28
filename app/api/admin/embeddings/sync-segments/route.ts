import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

const EMBEDDING_DIMENSIONS = 1536;

export const maxDuration = 300; // Allow 5 minutes max for syncing

export async function POST(request: NextRequest) {
    const requestId = getRequestId();

    // Rate limit: 3 requests per 60 seconds per IP (expensive AI operation)
    const rl = await rateLimit(request, { limit: 3, windowMs: 60_000 });
    if (!rl.success) {
        return NextResponse.json(
            { error: { code: "RATE_LIMITED", message: "Too many requests." } },
            { status: 429, headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) } }
        );
    }

    try {
        // Verify admin session
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return apiError("INTERNAL_ERROR", "OPENAI_API_KEY is not configured", 500, requestId);
        }

        const supabase = getAdminClient();

        const { data: segments, error: fetchError } = await supabase.rpc(
            "get_segments_missing_embeddings",
            { p_limit: 50 }
        );

        if (fetchError) {
            logApiError({ requestId, route: "/api/admin/embeddings/sync-segments", message: "Failed to fetch segments", error: fetchError });
            return apiError("INTERNAL_ERROR", "Failed to fetch segments for embedding", 500, requestId);
        }

        const missingEmbeddings = segments || [];

        if (missingEmbeddings.length === 0) {
            return NextResponse.json({ results: { processed: 0, success: 0, failed: 0 } });
        }

        let successCount = 0;
        let failedCount = 0;

        // Process embeddings for each segment
        for (const segment of missingEmbeddings) {
            const text = segment.markdown_body?.trim();
            if (!text) {
                failedCount++;
                continue;
            }

            try {
                // Call OpenAI API for segment embedding
                const response = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        input: text,
                        model: 'text-embedding-3-small'
                    })
                });

                if (!response.ok) {
                    throw new Error(`OpenAI API error: ${await response.text()}`);
                }

                const embeddingData = await response.json();
                const embedding = embeddingData.data[0].embedding;

                if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
                    throw new Error(`Invalid embedding length returned: ${embedding?.length}`);
                }

                // Insert into segment_embedding table
                const { error: insertError } = await supabase
                    .from("segment_embedding")
                    .insert({
                        segment_id: segment.id,
                        content_item_id: segment.content_item_id,
                        embedding
                    });

                if (insertError) {
                    throw insertError;
                }

                successCount++;
            } catch (err) {
                logApiError({
                    requestId,
                    route: "/api/admin/embeddings/sync-segments",
                    message: `Error embedding segment ${segment.id}`,
                    error: err,
                });
                failedCount++;
            }
        }

        return NextResponse.json({
            results: {
                processed: missingEmbeddings.length,
                success: successCount,
                failed: failedCount
            }
        });

    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/embeddings/sync-segments",
            message: "Segment embedding sync error",
            error,
        });
        return apiError("INTERNAL_ERROR", "Internal server error during sync", 500, requestId);
    }
}
