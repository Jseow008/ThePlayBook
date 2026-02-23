import { createClient } from "@/lib/supabase/server";
import { type NextRequest } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";
import { apiError, logApiError } from "@/lib/server/api";

export const maxDuration = 30; // Allow 30s max for AI response

export async function POST(req: NextRequest) {
    const requestId = crypto.randomUUID();

    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Please log in to use Ask My Library", 401, requestId);
        }

        const { messages } = await req.json();

        // Get the last user message
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'user') {
            return apiError("VALIDATION_ERROR", "No user query provided", 400, requestId);
        }
        const userQuery = lastMessage.content;

        // 1. Generate an embedding for the user's question
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: userQuery,
                model: 'text-embedding-3-small'
            })
        });

        if (!embeddingResponse.ok) {
            console.error("Embedding API error:", await embeddingResponse.text());
            return apiError("INTERNAL_ERROR", "Failed to generate question embedding", 500, requestId);
        }

        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        // 2. Perform Vector Search (RAG)
        // Call the RPC to find the most relevant segments in the user's library
        // @ts-ignore - Supabase generated types cache mismatch for this RPC
        const { data: relevantSegmentIds, error: rpcError } = await supabase.rpc(
            "match_library_segments",
            {
                query_embedding: JSON.stringify(queryEmbedding), // Cast array to string for pgvector type mismatch
                match_threshold: 0.7, // Adjust based on testing
                match_count: 5,       // Top 5 chunks
                p_user_id: user.id,
            }
        );

        if (rpcError) {
            logApiError({
                requestId,
                route: "/api/chat",
                message: "AskMyLibrary - vector search failed",
                error: rpcError,
            });
            return apiError("INTERNAL_ERROR", "Failed to search library", 500, requestId);
        }

        // 3. Prepare the Context
        let contextText = "";

        if (relevantSegmentIds && (relevantSegmentIds as any[]).length > 0) {
            // Fetch the actual text for these segments
            const segmentIds = (relevantSegmentIds as any[]).map((s: any) => s.segment_id);

            const { data: segments } = await supabase
                .from("segment")
                .select(`
                    markdown_body,
                    content_item ( title )
                `)
                .in("id", segmentIds);

            if (segments && segments.length > 0) {
                contextText = segments.map((seg: any, i: number) => {
                    const title = seg.content_item?.title || "Unknown Book";
                    return `[Source ${i + 1}: ${title}]\n${seg.markdown_body}`;
                }).join("\n\n---\n\n");
            } else {
                contextText = "No direct information found in the user's library for this query.";
            }
        } else {
            contextText = "No direct information found in the user's library for this query.";
        }

        // 4. Call LLM to Answer
        const systemPrompt = `You are a helpful, intelligent "Second Brain" assistant. 
Your primary goal is to answer the user's question based strictly on the provided context, which are excerpts from books the user has saved in their personal library.

Context Excerpts from User's Library:
===
${contextText}
===

Instructions:
1. Try to answer the question using ONLY the provided context.
2. If the context does not contain the answer, politely inform the user that their current library does not contain information to answer this question. Do NOT hallucinate or answer from external general knowledge unless explicitly asked to expand.
3. Keep the answer concise, insightful, and formatted cleanly in Markdown.
4. When you use information from the context, please cite the source book title if it's naturally fitting.
`;

        const result = streamText({
            model: openai("gpt-4o-mini"),
            system: systemPrompt,
            messages,
        });

        return result.toTextStreamResponse();

    } catch (error: any) {
        logApiError({
            requestId,
            route: "/api/chat",
            message: "AskMyLibrary Endpoint Error",
            error: error,
        });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred", 500, requestId);
    }
}
