import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { GoogleGenAI } from "@google/genai";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

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

export async function POST(req: NextRequest) {
    const requestId = getRequestId();

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
            .is("embedding", null);

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

        // Process sequentially to respect rate limits (or do batching if needed)
        // With Edge Functions/Serverless, we must be mindful of timeouts.
        // If there are many items, processing 10-20 should be fine within the timeout.
        for (const item of items) {
            const text = buildEmbeddingText(item);
            if (!text.trim()) {
                failedCount++;
                continue;
            }

            try {
                // Call Gemini API
                const response = await ai.models.embedContent({
                    model: EMBEDDING_MODEL,
                    contents: text,
                    config: { outputDimensionality: EMBEDDING_DIMENSIONS }
                });

                const embedding = response.embeddings?.[0]?.values;
                if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
                    throw new Error(`Invalid embedding returned: expected ${EMBEDDING_DIMENSIONS} dims`);
                }

                // Update row
                const { error: updateError } = await supabase
                    .from("content_item")
                    .update({ embedding })
                    .eq("id", item.id);

                if (updateError) {
                    throw updateError;
                }

                successCount++;
            } catch (err) {
                console.error(`Error embedding item ${item.id}:`, err);
                failedCount++;
            }
        }

        return NextResponse.json({
            results: {
                processed: items.length,
                success: successCount,
                failed: failedCount
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
