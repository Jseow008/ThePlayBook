import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { apiError, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 60; // Allow 60s max for AI response

export async function POST(req: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        // --- Auth ---
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Please log in to use Ask My Library", 401, requestId);
        }

        // --- Rate Limiting ---
        const rl = rateLimit(req, { limit: 10, windowMs: 60_000 });
        if (!rl.success) {
            return NextResponse.json(
                { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." } },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)) },
                }
            );
        }

        // --- Validate API Key ---
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            logApiError({ requestId, route: "/api/chat", message: "OPENAI_API_KEY not configured", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "AI service is not configured. Please contact an administrator.", 500, requestId);
        }

        // --- Parse & Validate Body ---
        let body: { messages?: any[] };
        try {
            body = await req.json();
        } catch {
            return apiError("VALIDATION_ERROR", "Invalid JSON body", 400, requestId);
        }

        const { messages } = body;
        if (!Array.isArray(messages) || messages.length === 0) {
            return apiError("VALIDATION_ERROR", "Messages array is required", 400, requestId);
        }

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== "user" || typeof lastMessage.content !== "string") {
            return apiError("VALIDATION_ERROR", "Last message must be a user message with text content", 400, requestId);
        }

        const userQuery = lastMessage.content.trim();
        if (!userQuery || userQuery.length > 2000) {
            return apiError("VALIDATION_ERROR", "Query must be between 1 and 2000 characters", 400, requestId);
        }

        // --- Step 1: Generate Embedding for Question ---
        const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${openaiApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: userQuery,
                model: "text-embedding-3-small",
            }),
        });

        if (!embeddingResponse.ok) {
            const errText = await embeddingResponse.text();
            logApiError({ requestId, route: "/api/chat", message: "OpenAI Embedding API error", error: new Error(errText) });
            return apiError("INTERNAL_ERROR", "Failed to process your question. Please try again.", 500, requestId);
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData?.data?.[0]?.embedding;

        if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
            logApiError({ requestId, route: "/api/chat", message: "Invalid embedding response structure", error: new Error("No embedding data") });
            return apiError("INTERNAL_ERROR", "Failed to process your question. Please try again.", 500, requestId);
        }

        // --- Step 2: Vector Search (RAG) ---
        // @ts-ignore — Supabase generated types may lag behind the actual RPC signature
        const { data: matchedSegments, error: rpcError } = await supabase.rpc("match_library_segments", {
            query_embedding: JSON.stringify(queryEmbedding),
            match_threshold: 0.65,
            match_count: 5,
            p_user_id: user.id,
        });

        if (rpcError) {
            logApiError({ requestId, route: "/api/chat", message: "Vector search RPC failed", error: rpcError });
            return apiError("INTERNAL_ERROR", "Failed to search your library. Please try again.", 500, requestId);
        }

        // --- Step 3: Fetch Segment Content ---
        let contextText = "";

        const segmentResults = matchedSegments as Array<{ segment_id: string; content_item_id: string; similarity: number }> | null;

        if (segmentResults && segmentResults.length > 0) {
            const segmentIds = segmentResults.map((s) => s.segment_id);

            const { data: segments, error: segFetchError } = await supabase
                .from("segment")
                .select("id, markdown_body, content_item ( title )")
                .in("id", segmentIds);

            if (segFetchError) {
                logApiError({ requestId, route: "/api/chat", message: "Failed to fetch segment content", error: segFetchError });
                // Non-fatal — continue with empty context
            }

            if (segments && segments.length > 0) {
                contextText = segments
                    .map((seg: any, i: number) => {
                        const title = seg.content_item?.title || "Unknown Source";
                        return `[Source ${i + 1}: "${title}"]\n${seg.markdown_body}`;
                    })
                    .join("\n\n---\n\n");
            }
        }

        if (!contextText) {
            contextText = "No relevant information was found in the user's saved library for this question.";
        }

        // --- Step 4: Stream LLM Response ---
        const systemPrompt = `You are a helpful and knowledgeable "Second Brain" assistant for a personal reading platform.
Your role is to answer the user's questions based STRICTLY on the provided context excerpts from their saved library.

Context Excerpts from User's Library:
===
${contextText}
===

Rules:
1. Answer ONLY based on the provided context. Never fabricate or use information from outside the context.
2. If the context does not contain enough information to answer the question, say so honestly and suggest the user save more relevant content to their library.
3. Keep answers concise, well-structured, and formatted in clean Markdown.
4. Naturally cite the source title when referencing information (e.g., "According to *Atomic Habits*...").
5. Be conversational and encouraging — help the user feel like their library is a powerful knowledge base.`;

        const result = streamText({
            model: openai("gpt-4o-mini"),
            system: systemPrompt,
            messages,
        });

        return result.toTextStreamResponse();
    } catch (error: unknown) {
        logApiError({
            requestId,
            route: "/api/chat",
            message: "Unhandled error in Ask My Library endpoint",
            error,
        });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred. Please try again.", 500, requestId);
    }
}
