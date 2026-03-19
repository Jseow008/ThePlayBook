import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";
import { GoogleGenAI } from "@google/genai";
import { buildLibraryMetadataContext, type LibraryItemRow } from "@/lib/server/library-snapshot";

export const maxDuration = 60; // Allow 60s max for AI response

const ChatMessageSchema = z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().trim().max(2_000).optional(),
    parts: z.array(z.any()).optional(),
});

const ChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1).max(20),
});

const MAX_HISTORY_MESSAGES = 6;
const MAX_TOTAL_MESSAGE_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 9_000;
const MAX_LIBRARY_CONTEXT_CHARS = 4_000;
const MAX_OUTPUT_TOKENS = {
    library_metadata: 250,
    content_synthesis: 450,
    hybrid: 500,
} as const;
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const PRIMARY_MATCH_THRESHOLD = 0.65;
const FALLBACK_MATCH_THRESHOLD = 0.55;
const MATCH_COUNT = 5;
type SegmentWithTitle = {
    id: string;
    markdown_body: string;
    content_item: { title: string | null } | Array<{ title: string | null }> | null;
};
type AskIntent = "library_metadata" | "content_synthesis" | "hybrid";

function getOutputTokenCap(intent: AskIntent): number {
    return MAX_OUTPUT_TOKENS[intent];
}

function getMessageText(message: Record<string, unknown>): string {
    if (Array.isArray(message.parts)) {
        return message.parts
            .filter((part: any) => part.type === "text" && typeof part.text === "string")
            .map((part: any) => part.text as string)
            .join("");
    }

    if (typeof message.content === "string") {
        return message.content;
    }

    return "";
}

function normalizeMessages(rawMessages: Array<Record<string, unknown>>): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    return rawMessages
        .filter((message): message is Record<string, unknown> & { role: "system" | "user" | "assistant" } =>
            message.role === "system" || message.role === "user" || message.role === "assistant"
        )
        .map((message) => ({
            role: message.role,
            content: getMessageText(message).trim(),
        }))
        .filter((message) => message.content.length > 0);
}

function detectAskIntent(query: string): AskIntent {
    const normalized = query.toLowerCase();
    const metadataPatterns = [
        /\bwhat have i read\b/,
        /\bwhat have i saved\b/,
        /\bcompleted\b/,
        /\bfinish(?:ed)?\b/,
        /\bhow many\b/,
        /\bwhich authors?\b/,
        /\blist\b/,
        /\bwhat books?\b/,
        /\bmy library\b/,
        /\bmy saved books?\b/,
        /\bin progress\b/,
    ];
    const synthesisPatterns = [
        /\btheme\b/,
        /\bthemes\b/,
        /\bcompare\b/,
        /\bperspective\b/,
        /\bperspectives\b/,
        /\bsummar(?:ize|ise)\b/,
        /\boverlap\b/,
        /\bcontrast\b/,
        /\brelevant\b/,
        /\bwhy\b/,
        /\bidea\b/,
        /\bideas\b/,
        /\bdiscipline\b/,
        /\bhabit\b/,
        /\bmeaning\b/,
        /\bconcept\b/,
        /\bpatterns?\b/,
    ];

    const metadataHits = metadataPatterns.filter((pattern) => pattern.test(normalized)).length;
    const synthesisHits = synthesisPatterns.filter((pattern) => pattern.test(normalized)).length;

    if (metadataHits > 0 && synthesisHits === 0) {
        return "library_metadata";
    }

    if (synthesisHits > 0 && metadataHits === 0) {
        return "content_synthesis";
    }

    return "hybrid";
}

async function fetchRelevantSegments(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    queryEmbedding: number[]
): Promise<{
    contextText: string;
    retrievalStatus: "matched" | "no_match" | "not_initialized";
}> {
    const thresholds = [PRIMARY_MATCH_THRESHOLD, FALLBACK_MATCH_THRESHOLD];
    let segmentResults: Array<{ segment_id: string; content_item_id: string; similarity: number }> = [];

    for (const threshold of thresholds) {
        const { data, error } = await (supabase.rpc as any)("match_library_segments_gemini", {
            query_embedding: JSON.stringify(queryEmbedding),
            match_threshold: threshold,
            match_count: MATCH_COUNT,
            p_user_id: userId,
        });

        if (error) {
            throw error;
        }

        const matches = (data ?? []) as Array<{ segment_id: string; content_item_id: string; similarity: number }>;
        if (matches.length > 0) {
            segmentResults = matches;
            break;
        }
    }

    if (segmentResults.length === 0) {
        const { count, error } = await supabase
            .from("segment_embedding_gemini")
            .select("id", { count: "exact", head: true });

        if (error) {
            throw error;
        }

        return {
            contextText: "",
            retrievalStatus: count ? "no_match" : "not_initialized",
        };
    }

    const segmentIds = segmentResults.map((segment) => segment.segment_id);
    const { data: segments, error: segFetchError } = await supabase
        .from("segment")
        .select("id, markdown_body, content_item ( title )")
        .in("id", segmentIds);

    if (segFetchError) {
        throw segFetchError;
    }

    const segmentRows = (segments ?? []) as SegmentWithTitle[];
    const segmentMap = new Map(segmentRows.map((segment) => [segment.id, segment]));

    const orderedContext = segmentResults
        .map((segmentResult, index) => {
            const segment = segmentMap.get(segmentResult.segment_id);
            if (!segment) {
                return null;
            }

            const contentItem = Array.isArray(segment.content_item)
                ? segment.content_item[0]
                : segment.content_item;
            const title = contentItem?.title || "Unknown Source";
            return `[Source ${index + 1}: "${title}"]\n${segment.markdown_body}`;
        })
        .filter((entry): entry is string => Boolean(entry))
        .join("\n\n---\n\n");

    return {
        contextText: orderedContext.length > MAX_CONTEXT_CHARS ? orderedContext.slice(0, MAX_CONTEXT_CHARS) : orderedContext,
        retrievalStatus: orderedContext ? "matched" : "no_match",
    };
}

export async function POST(req: NextRequest) {
    const requestId = getRequestId();

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
        const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, key: user.id });
        if (!rl.success) {
            return NextResponse.json(
                { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." } },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60000) / 1000)) },
                }
            );
        }

        // --- Parse & Validate Body ---
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON body", 400, requestId);
        }

        const parsed = ChatRequestSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid chat payload", 400, requestId);
        }

        const messages = normalizeMessages(parsed.data.messages as Array<Record<string, unknown>>);
        if (messages.length === 0) {
            return apiError("VALIDATION_ERROR", "No valid messages provided", 400, requestId);
        }

        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
        if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
            return apiError("VALIDATION_ERROR", "Conversation is too long. Please start a new chat.", 400, requestId);
        }

        const trimmedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
        const lastMessage = trimmedMessages[trimmedMessages.length - 1];
        if (!lastMessage || lastMessage.role !== "user") {
            return apiError("VALIDATION_ERROR", "Last message must be a user message with text content", 400, requestId);
        }

        const userQuery = lastMessage.content.trim();
        if (!userQuery || userQuery.length > 2000) {
            return apiError("VALIDATION_ERROR", "Query must be between 1 and 2000 characters", 400, requestId);
        }

        const intent = detectAskIntent(userQuery);
        const provider = process.env.AI_PROVIDER || "anthropic";
        const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
        const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
        const hasGemini = Boolean(process.env.GEMINI_API_KEY);

        if (!hasAnthropic && !hasOpenAI) {
            logApiError({ requestId, route: "/api/chat", message: "No AI provider configured", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "AI service is not configured. Please contact an administrator.", 500, requestId);
        }

        if (intent !== "library_metadata" && !hasGemini) {
            logApiError({ requestId, route: "/api/chat", message: "GEMINI_API_KEY not configured for retrieval embeddings", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "Ask My Library retrieval is not configured. Please contact an administrator.", 500, requestId);
        }

        const { data: libraryRows, error: libraryError } = await supabase
            .from("user_library")
            .select(`
                content_id,
                is_bookmarked,
                progress,
                last_interacted_at,
                content_item ( title, author )
            `)
            .eq("user_id", user.id)
            .order("last_interacted_at", { ascending: false });

        if (libraryError) {
            logApiError({ requestId, route: "/api/chat", message: "Failed to load library metadata", error: libraryError });
            return apiError("INTERNAL_ERROR", "Failed to load your library. Please try again.", 500, requestId);
        }

        const libraryItems = (libraryRows ?? []) as LibraryItemRow[];
        const metadataContext = buildLibraryMetadataContext(libraryItems, MAX_LIBRARY_CONTEXT_CHARS);

        let retrievalContext = "";
        let retrievalStatus: "skipped" | "matched" | "no_match" | "not_initialized" = "skipped";

        if (intent !== "library_metadata") {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
            let queryEmbedding: number[] | undefined;
            try {
                const embeddingResponse = await ai.models.embedContent({
                    model: EMBEDDING_MODEL,
                    contents: userQuery,
                    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
                });

                queryEmbedding = embeddingResponse.embeddings?.[0]?.values;
            } catch (error) {
                logApiError({ requestId, route: "/api/chat", message: "Gemini embedding API error", error });
                return apiError("INTERNAL_ERROR", "Ask My Library retrieval is temporarily unavailable. Please try again later.", 500, requestId);
            }

            if (!queryEmbedding || queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
                logApiError({
                    requestId,
                    route: "/api/chat",
                    message: "Invalid Gemini embedding response structure",
                    error: new Error(`Expected ${EMBEDDING_DIMENSIONS} dimensions`),
                });
                return apiError("INTERNAL_ERROR", "Ask My Library retrieval is temporarily unavailable. Please try again later.", 500, requestId);
            }

            try {
                const retrievalResult = await fetchRelevantSegments(supabase, user.id, queryEmbedding);
                retrievalContext = retrievalResult.contextText;
                retrievalStatus = retrievalResult.retrievalStatus;
            } catch (error) {
                logApiError({ requestId, route: "/api/chat", message: "Vector search or segment fetch failed", error });
                return apiError("INTERNAL_ERROR", "Failed to search your library. Please try again.", 500, requestId);
            }
        }

        if (intent !== "library_metadata" && retrievalStatus === "not_initialized" && libraryItems.length === 0) {
            return apiError(
                "INTERNAL_ERROR",
                "Ask My Library retrieval is not initialized yet. Please contact an administrator.",
                500,
                requestId
            );
        }

        const retrievalContextForPrompt = retrievalContext || (
            retrievalStatus === "not_initialized"
                ? "Retrieved passages are not initialized yet. Only library metadata is available for this request."
                : retrievalStatus === "no_match"
                    ? "Matching saved passages were limited for this topic. Answer from library metadata first and explicitly note that passage evidence is limited."
                    : "Retrieved passages were not needed for this question."
        );

        const systemPrompt = `You are Ask My Library.
Answer only from the evidence below.

Library metadata:
${metadataContext}

Retrieved passages:
${retrievalContextForPrompt}

Intent: ${intent}

Rules:
- Use metadata for inventory, counts, titles, authors, and reading status.
- Use retrieved passages for themes, comparisons, and content-based reasoning.
- For hybrid questions, combine both. If passages are limited, answer from metadata first and say passage evidence is limited.
- Never invent books, authors, progress, or themes.
- If metadata is empty, say so plainly.
- Keep answers short and structured. Use bullets for lists. Do not write a long essay unless asked.`;

        let aiModel;

        if (provider === "anthropic" && hasAnthropic) {
            const { anthropic } = await import("@ai-sdk/anthropic");
            aiModel = anthropic(process.env.AI_MODEL || "claude-sonnet-4-20250514");
        } else {
            const { openai } = await import("@ai-sdk/openai");
            aiModel = openai(process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini");
        }

        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages: trimmedMessages,
            maxOutputTokens: getOutputTokenCap(intent),
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
