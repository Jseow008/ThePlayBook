import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const MAX_SEGMENTS_PER_REQUEST = 50;

export const maxDuration = 300; // Allow 5 minutes max for syncing

async function getCoverageSummary(supabase: ReturnType<typeof getAdminClient>) {
    const { data, error } = await supabase.rpc("get_gemini_segment_embedding_coverage");

    if (error) {
        throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
        total_library_content_items: Number(row?.total_library_content_items ?? 0),
        embedded_content_items: Number(row?.embedded_content_items ?? 0),
        missing_segments: Number(row?.missing_segments ?? 0),
    };
}

export async function GET() {
    const requestId = getRequestId();

    try {
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
        }

        const supabase = getAdminClient();
        const summary = await getCoverageSummary(supabase);
        return NextResponse.json({ summary });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/embeddings/sync-segments",
            message: "Failed to load Gemini segment embedding coverage",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to load embedding coverage", 500, requestId);
    }
}

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

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return apiError("INTERNAL_ERROR", "GEMINI_API_KEY is not configured", 500, requestId);
        }

        const supabase = getAdminClient();
        const ai = new GoogleGenAI({ apiKey });

        const { data: segments, error: fetchError } = await supabase.rpc(
            "get_segments_missing_gemini_embeddings",
            { p_limit: MAX_SEGMENTS_PER_REQUEST }
        );

        if (fetchError) {
            logApiError({ requestId, route: "/api/admin/embeddings/sync-segments", message: "Failed to fetch segments", error: fetchError });
            return apiError("INTERNAL_ERROR", "Failed to fetch segments for embedding", 500, requestId);
        }

        const missingEmbeddings = segments || [];
        const initialSummary = await getCoverageSummary(supabase);

        if (missingEmbeddings.length === 0) {
            return NextResponse.json({
                results: { processed: 0, success: 0, failed: 0 },
                summary: initialSummary,
            });
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
                const response = await ai.models.embedContent({
                    model: EMBEDDING_MODEL,
                    contents: text,
                    config: { outputDimensionality: EMBEDDING_DIMENSIONS }
                });

                const embedding = response.embeddings?.[0]?.values;

                if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
                    throw new Error(`Invalid embedding length returned: ${embedding?.length}`);
                }

                const { error: insertError } = await supabase
                    .from("segment_embedding_gemini")
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

        const summary = await getCoverageSummary(supabase);

        return NextResponse.json({
            results: {
                processed: missingEmbeddings.length,
                success: successCount,
                failed: failedCount,
                has_more_to_process: missingEmbeddings.length === MAX_SEGMENTS_PER_REQUEST,
            },
            summary,
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
