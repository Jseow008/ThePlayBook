import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { GoogleGenAI } from "@google/genai";
import { rateLimit } from "@/lib/server/rate-limit";
import {
    CONTENT_EMBEDDING_SYNC_METHOD,
    CONTENT_EMBEDDING_SYNC_PATH,
    getAdminAiReadinessMap,
    getAdminAiReadinessWorkflow,
    summarizeAdminAiReadiness,
} from "@/lib/server/admin-ai-readiness";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const EMBEDDING_CONCURRENCY = 5;
const MAX_ITEMS_PER_REQUEST = 25;

function buildEmbeddingText(item: any): string {
    const parts: string[] = [];

    if (item.title) parts.push(`Title: ${item.title}`);
    if (item.author) parts.push(`Author: ${item.author}`);
    if (item.type) parts.push(`Type: ${item.type}`);
    if (item.category) parts.push(`Category: ${item.category}`);

    const qm = item.quick_mode_json;
    if (qm && typeof qm === "object") {
        if (qm.hook) parts.push(`Hook: ${qm.hook}`);
        if (qm.big_idea) parts.push(`Big Idea: ${qm.big_idea}`);
        if (qm.key_takeaways && Array.isArray(qm.key_takeaways)) {
            parts.push("Key Takeaways: " + qm.key_takeaways.join("; "));
        }
    }

    return parts.join("\n");
}

export async function GET() {
    const requestId = getRequestId();

    try {
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            return apiError("UNAUTHORIZED", "Unauthorized", 401, requestId);
        }

        const supabase = getAdminClient();
        const { data: items, error } = await supabase
            .from("content_item")
            .select("id, status, embedding")
            .eq("status", "verified")
            .is("deleted_at", null);

        if (error) {
            throw error;
        }

        const aiReadinessById = await getAdminAiReadinessMap(supabase as any, (items ?? []).map((item) => ({
            id: item.id,
            status: item.status,
            embedding: item.embedding,
        })));
        const aiReadiness = summarizeAdminAiReadiness(Object.values(aiReadinessById));

        return NextResponse.json({
            summary: {
                verified_items: aiReadiness.verified_items,
                content_embedding_ready_items: aiReadiness.verified_items - aiReadiness.stale_content_embeddings,
                missing_content_embeddings: aiReadiness.stale_content_embeddings,
            },
            ai_readiness: aiReadiness,
            sync_action: {
                method: CONTENT_EMBEDDING_SYNC_METHOD,
                path: CONTENT_EMBEDDING_SYNC_PATH,
            },
            workflow: getAdminAiReadinessWorkflow(),
        });
    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/embeddings/sync",
            message: "Failed to load content embedding readiness",
            error,
        });
        return apiError("INTERNAL_ERROR", "Failed to load content embedding readiness", 500, requestId);
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

        // Fetch content items that need embeddings
        const { data: items, error: fetchError } = await supabase
            .from("content_item")
            .select("id, title, author, type, category, quick_mode_json")
            .eq("status", "verified")
            .is("deleted_at", null)
            .is("embedding", null)
            .limit(MAX_ITEMS_PER_REQUEST);

        if (fetchError) {
            logApiError({ requestId, route: "/api/admin/embeddings/sync", message: "Failed to fetch content items", error: fetchError });
            return apiError("INTERNAL_ERROR", "Failed to fetch content items", 500, requestId);
        }

        if (!items || items.length === 0) {
            return NextResponse.json({ results: { processed: 0, success: 0, failed: 0 } });
        }

        const ai = new GoogleGenAI({ apiKey });
        let successCount = 0;
        let failedCount = 0;
        for (let offset = 0; offset < items.length; offset += EMBEDDING_CONCURRENCY) {
            const batch = items.slice(offset, offset + EMBEDDING_CONCURRENCY);
            const results = await Promise.allSettled(batch.map(async (item) => {
                const text = buildEmbeddingText(item);
                if (!text.trim()) {
                    throw new Error("Content has no text to embed");
                }
                const response = await ai.models.embedContent({
                    model: EMBEDDING_MODEL,
                    contents: text,
                    config: { outputDimensionality: EMBEDDING_DIMENSIONS }
                });
                const embedding = response.embeddings?.[0]?.values;
                if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
                    throw new Error(`Invalid embedding returned: expected ${EMBEDDING_DIMENSIONS} dims`);
                }
                const { error: updateError } = await supabase
                    .from("content_item")
                    .update({ embedding: JSON.stringify(embedding) })
                    .eq("id", item.id);
                if (updateError) throw updateError;
            }));
            results.forEach((result, index) => {
                if (result.status === "fulfilled") {
                    successCount += 1;
                } else {
                    failedCount += 1;
                    console.error(`Error embedding item ${batch[index].id}:`, result.reason);
                }
            });
        }

        return NextResponse.json({
            results: {
                processed: items.length,
                success: successCount,
                failed: failedCount,
                has_more_to_process: items.length === MAX_ITEMS_PER_REQUEST,
            }
        });

    } catch (error) {
        logApiError({
            requestId,
            route: "/api/admin/embeddings/sync",
            message: "Embedding sync error",
            error,
        });
        return apiError("INTERNAL_ERROR", "Internal server error during sync", 500, requestId);
    }
}
