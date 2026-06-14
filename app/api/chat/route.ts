import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { smoothStream, streamText } from "ai";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { rateLimit } from "@/lib/server/rate-limit";
import { checkAiUsageQuota, getQuotaExceededMessage, recordGeneratedAiMessage } from "@/lib/server/ai-usage-quota";
import { GoogleGenAI } from "@google/genai";
import { buildLibraryMetadataContext, getLibraryItemStatus, type LibraryItemRow } from "@/lib/server/library-snapshot";

export const maxDuration = 60; // Allow 60s max for AI response

const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().max(2_000).optional(),
    parts: z.array(z.any()).optional(),
});

const ChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1).max(20),
});

const MAX_HISTORY_MESSAGES = 4;
const MAX_TOTAL_MESSAGE_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 9_000;
const MAX_LIBRARY_CONTEXT_CHARS = 6_000;
const MAX_OUTPUT_TOKENS = {
    library_metadata: 250,
    content_synthesis: 450,
    hybrid: 500,
    reading_advisor: 550,
} as const;
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_COMPLEX_ASK_MODEL = "claude-sonnet-4-20250514";
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const PRIMARY_MATCH_THRESHOLD = 0.65;
const FALLBACK_MATCH_THRESHOLD = 0.55;
const MATCH_COUNT = 3;
const ADVISOR_MATCH_COUNT = 12;
type SegmentWithTitle = {
    id: string;
    markdown_body: string;
    content_item: { title: string | null } | Array<{ title: string | null }> | null;
};
type AskIntent = "library_metadata" | "content_synthesis" | "hybrid" | "reading_advisor";

function getOutputTokenCap(intent: AskIntent): number {
    return MAX_OUTPUT_TOKENS[intent];
}

function shouldUseComplexAskModel(intent: AskIntent) {
    return intent === "content_synthesis" || intent === "hybrid" || intent === "reading_advisor";
}

function getAnthropicModelName(intent: AskIntent) {
    if (shouldUseComplexAskModel(intent)) {
        return process.env.AI_COMPLEX_MODEL || DEFAULT_COMPLEX_ASK_MODEL;
    }

    return process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL;
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

function normalizeMessages(rawMessages: Array<Record<string, unknown>>): Array<{ role: "user" | "assistant"; content: string }> {
    return rawMessages
        .filter((message): message is Record<string, unknown> & { role: "user" | "assistant" } =>
            message.role === "user" || message.role === "assistant"
        )
        .map((message) => ({
            role: message.role,
            content: getMessageText(message).trim(),
        }))
        .filter((message) => message.content.length > 0);
}

function detectAskIntent(query: string): AskIntent {
    const normalized = query.toLowerCase();
    const advisorPatterns = [
        /\brecommend\b/,
        /\brecommendation\b/,
        /\bsuggest\b/,
        /\bsuggestion\b/,
        /\bnext (?:book|read|item|source)\b/,
        /\bwhat should i read next\b/,
        /\bwhat (?:book|item|source) should i read\b/,
        /\bbased on my completed\b/,
        /\bbased on what i(?:'ve| have) (?:read|completed|finished)\b/,
        /\bwhat does my library say about me\b/,
        /\bmy interests\b/,
        /\bmy taste\b/,
        /\breading taste\b/,
        /\breader profile\b/,
        /\brecurring themes\b/,
    ];
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
        /\bmy saved items?\b/,
        /\bsaved sources?\b/,
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

    const advisorHits = advisorPatterns.filter((pattern) => pattern.test(normalized)).length;
    if (advisorHits > 0) {
        return "reading_advisor";
    }

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
    queryEmbedding: number[],
    options: {
        matchCount?: number;
        boostCompleted?: boolean;
        libraryItems?: LibraryItemRow[];
    } = {}
): Promise<{
    contextText: string;
    retrievalStatus: "matched" | "no_match" | "not_initialized";
}> {
    const matchCount = options.matchCount ?? MATCH_COUNT;
    const thresholds = [PRIMARY_MATCH_THRESHOLD, FALLBACK_MATCH_THRESHOLD];
    let segmentResults: Array<{ segment_id: string; content_item_id: string; similarity: number }> = [];

    for (const threshold of thresholds) {
        const { data, error } = await (supabase.rpc as any)("match_library_segments_gemini", {
            query_embedding: JSON.stringify(queryEmbedding),
            match_threshold: threshold,
            match_count: matchCount,
            p_user_id: userId,
            p_boost_completed: Boolean(options.boostCompleted),
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
    const libraryItemMap = new Map((options.libraryItems ?? []).map((item) => [item.content_id, item]));

    let orderedContext = "";
    let includedCount = 0;

    for (const segmentResult of segmentResults) {
        const segment = segmentMap.get(segmentResult.segment_id);
        if (!segment) {
            continue;
        }

        const contentItem = Array.isArray(segment.content_item)
            ? segment.content_item[0]
            : segment.content_item;
        const title = contentItem?.title || "Unknown Source";
        const libraryItem = libraryItemMap.get(segmentResult.content_item_id);
        const status = libraryItem ? getLibraryItemStatus(libraryItem) : "saved";
        const entry = [
            `[Source ${includedCount + 1}: "${title}" | status: ${status} | similarity: ${segmentResult.similarity.toFixed(3)}]`,
            segment.markdown_body,
        ].join("\n");
        const separator = orderedContext ? "\n\n---\n\n" : "";
        const remainingChars = MAX_CONTEXT_CHARS - orderedContext.length - separator.length;

        if (remainingChars <= 0) {
            break;
        }

        orderedContext += `${separator}${entry.length > remainingChars ? entry.slice(0, remainingChars).trimEnd() : entry}`;
        includedCount += 1;

        if (entry.length > remainingChars) {
            break;
        }
    }

    return {
        contextText: orderedContext,
        retrievalStatus: orderedContext ? "matched" : "no_match",
    };
}

function shouldBoostCompletedForIntent(intent: AskIntent, query: string) {
    return intent === "reading_advisor" && /\bcompleted|finished|read\b/i.test(query);
}

function buildRetrievalFallbackText(retrievalStatus: "skipped" | "matched" | "no_match" | "not_initialized", intent: AskIntent) {
    if (retrievalStatus === "skipped" && intent === "reading_advisor") {
        return "Retrieved passages were not available for this recommendation request. Answer from library metadata and clearly say the recommendation is based on titles, authors, statuses, and categories.";
    }

    if (retrievalStatus === "not_initialized") {
        return "Retrieved passages are not initialized yet. Only library metadata is available for this request.";
    }

    if (retrievalStatus === "no_match") {
        return intent === "reading_advisor"
            ? "Matching saved passages were limited for this recommendation request. Still answer from library metadata and clearly say the recommendation is based mostly on titles, authors, statuses, and categories."
            : "Matching saved passages were limited for this topic. Answer from library metadata first and explicitly note that passage evidence is limited.";
    }

    return "Retrieved passages were not needed for this question.";
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

        const provider = process.env.AI_PROVIDER || "anthropic";
        const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
        const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
        const hasGemini = Boolean(process.env.GEMINI_API_KEY);
        const intent = detectAskIntent(userQuery);

        if (!hasAnthropic && !hasOpenAI) {
            logApiError({ requestId, route: "/api/chat", message: "No AI provider configured", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "AI service is not configured. Please contact an administrator.", 500, requestId);
        }

        if (intent !== "library_metadata" && intent !== "reading_advisor" && !hasGemini) {
            logApiError({ requestId, route: "/api/chat", message: "GEMINI_API_KEY not configured for retrieval embeddings", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "Ask My Library retrieval is not configured. Please contact an administrator.", 500, requestId);
        }

        const quota = await checkAiUsageQuota(supabase, user.id);
        if (!quota.allowed) {
            return NextResponse.json(
                { error: { code: "AI_QUOTA_EXCEEDED", message: getQuotaExceededMessage(quota) } },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000))) },
                }
            );
        }

        const { data: libraryRows, error: libraryError } = await supabase
            .from("user_library")
            .select(`
                content_id,
                is_bookmarked,
                progress,
                last_interacted_at,
                content_item ( title, author, category )
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

        if (intent !== "library_metadata" && hasGemini) {
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
                const retrievalResult = await fetchRelevantSegments(supabase, user.id, queryEmbedding, {
                    matchCount: intent === "reading_advisor" ? ADVISOR_MATCH_COUNT : MATCH_COUNT,
                    boostCompleted: shouldBoostCompletedForIntent(intent, userQuery),
                    libraryItems,
                });
                retrievalContext = retrievalResult.contextText;
                retrievalStatus = retrievalResult.retrievalStatus;
            } catch (error) {
                logApiError({ requestId, route: "/api/chat", message: "Vector search or segment fetch failed", error });
                return apiError("INTERNAL_ERROR", "Failed to search your library. Please try again.", 500, requestId);
            }
        }

        const retrievalContextForPrompt = retrievalContext || buildRetrievalFallbackText(retrievalStatus, intent);

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
- For reading_advisor questions, recommend only from eligible next-read candidates explicitly listed in Library metadata.
- UNDER NO CIRCUMSTANCES recommend a book, article, author, or source that is not explicitly listed in the provided library metadata.
- If there are no good internal-library matches, say so and ask the user whether they want broader discovery outside their library.
- If passage evidence is thin for a reading_advisor question, still make a qualified recommendation from metadata, statuses, authors, and categories instead of repeatedly apologizing.
- Never invent sources, authors, progress, or themes.
- If metadata is empty, say so plainly.
- Keep answers short and structured. Use bullets for lists. Do not write a long essay unless asked.`;

        let aiModel;

        if (provider === "anthropic" && hasAnthropic) {
            const { anthropic } = await import("@ai-sdk/anthropic");
            aiModel = anthropic(getAnthropicModelName(intent));
        } else if (hasOpenAI) {
            const { openai } = await import("@ai-sdk/openai");
            aiModel = openai(process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini");
        } else {
            const { anthropic } = await import("@ai-sdk/anthropic");
            aiModel = anthropic(getAnthropicModelName(intent));
        }

        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages: trimmedMessages,
            maxOutputTokens: getOutputTokenCap(intent),
            experimental_transform: smoothStream({ delayInMs: 6 }),
            onFinish: async () => {
                try {
                    await recordGeneratedAiMessage(supabase, { userId: user.id, feature: "ask-library" });
                } catch (error) {
                    logApiError({ requestId, route: "/api/chat", message: "Failed to record AI usage", error });
                }

                if (messages.filter((message) => message.role === "user").length === 1) {
                    await captureServerAnalyticsEvent({
                        event: "ai_chat_started",
                        distinctId: user.id,
                        insertId: `ai_chat_started:library:${user.id}:${requestId}`,
                        properties: {
                            source: "ask_library",
                            route: "/api/chat",
                            chat_scope: "library",
                            user_state: "authenticated",
                        },
                    });
                }
            },
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
