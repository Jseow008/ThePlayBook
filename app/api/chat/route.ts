import { aiRateLimit } from "@/lib/server/ai-rate-limit";
import { issueEvidenceCitations } from "@/lib/server/evidence-citation";
import { renderEvidenceExtracts } from "@/lib/server/evidence-extract-response";
import { MAX_LIBRARY_CONTEXT_CHARS, getOutputTokenCap, getAnthropicModelName, detectAskIntent, shouldBoostCompletedForIntent, buildRetrievalFallbackText, LIBRARY_NO_EVIDENCE } from "@/lib/server/retrieval-generation";
import { assertActiveChatSession, assertActivePersonalRetrievalSession, ChatSessionValidationError } from "@/lib/server/personal-retrieval-session";
import { afterResponse } from "@/lib/server/after-response";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { smoothStream, streamText } from "ai";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { rateLimitFailureResponseWithTelemetry } from "@/lib/server/rate-limit";
import { recordAiRouteAbuse } from "@/lib/server/security-telemetry";
import { admitAiUsage, getQuotaExceededMessage } from "@/lib/server/ai-usage-quota";
import { GoogleGenAI } from "@google/genai";
import { buildLibraryMetadataContext, type LibraryItemRow } from "@/lib/server/library-snapshot";

import { retrievePersonalEvidence, PersonalEvidenceIndexNotReady, ALL_PERSONAL_EVIDENCE } from "@/lib/server/personal-retrieval";
import { loadLibrarySourceEvidence, rankLibrarySourceSpans, selectLibraryEvidence, buildLibraryEvidencePrompt } from "@/lib/server/library-evidence";
import { recheckPersonalEvidenceCandidates } from "@/lib/server/personal-evidence-candidates";
import { retrievalTextResponse } from "@/lib/server/retrieval-response";
import { contextualizeUserQuestion, FOLLOW_UP_CLARIFICATION } from "@/lib/server/retrieval-user-context";

export const maxDuration = 60; // Allow 60s max for AI response

const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().max(2_000).optional(),
    parts: z.array(z.any()).optional(),
});

const ChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1).max(20),
});

const MAX_TOTAL_MESSAGE_CHARS = 12_000;
const CHAT_STREAM_ERROR_MESSAGE = "Something went wrong. Please try asking again.";
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
function getMessageText(message: Record<string, unknown>): string {
    if (Array.isArray(message.parts)) {
        return message.parts
            .filter(isTextPart)
            .map((part) => part.text)
            .join("");
    }

    if (typeof message.content === "string") {
        return message.content;
    }

    return "";
}

type TextPart = { type: "text"; text: string };

function isTextPart(part: unknown): part is TextPart {
    return Boolean(
        part
        && typeof part === "object"
        && "type" in part
        && "text" in part
        && part.type === "text"
        && typeof part.text === "string"
    );
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
        const rl = await aiRateLimit(req, user.id);
        if (!rl.success) {
            return rateLimitFailureResponseWithTelemetry({
                request: req,
                requestId,
                result: rl,
                route: "/api/chat",
                category: "ai",
                userId: user.id,
                authState: "authenticated",
                message: "Too many requests. Please wait a moment.",
            });
        }

        // getUser can accept a revoked but unexpired JWT. Every private branch,
        // including inventory and metadata-only recommendations, needs a live session.
        const validateChatSession = async () => {
            try {
                await assertActiveChatSession({ supabase, signal: req.signal });
                return null;
            } catch (error) {
                if (error instanceof ChatSessionValidationError && error.code === "UNAUTHORIZED") {
                    return apiError("UNAUTHORIZED", "Your chat session has ended. Please sign in again.", 401, requestId);
                }
                logApiError({ requestId, route: "/api/chat", message: "Could not verify the live chat session", error });
                return apiError("RETRIEVAL_UNAVAILABLE", "Your chat session could not be verified. Please retry.", 503, requestId);
            }
        };
        const sessionFailure = await validateChatSession();
        if (sessionFailure) return sessionFailure;

        // --- Parse & Validate Body ---
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON body", 400, requestId);
        }

        const parsed = ChatRequestSchema.safeParse(body);
        if (!parsed.success) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat",
                userId: user.id,
                reason: "invalid_payload",
                metadata: { payload_kind: "chat" },
            });
            return apiError("VALIDATION_ERROR", "Invalid chat payload", 400, requestId);
        }

        const messages = normalizeMessages(parsed.data.messages as Array<Record<string, unknown>>);
        if (messages.length === 0) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat",
                userId: user.id,
                reason: "empty_messages",
                metadata: { message_count: 0, payload_kind: "chat" },
            });
            return apiError("VALIDATION_ERROR", "No valid messages provided", 400, requestId);
        }

        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
        if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat",
                userId: user.id,
                reason: "conversation_too_long",
                metadata: {
                    message_count: messages.length,
                    total_chars: totalChars,
                    payload_kind: "chat",
                },
            });
            return apiError("VALIDATION_ERROR", "Conversation is too long. Please start a new chat.", 400, requestId);
        }

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== "user") {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat",
                userId: user.id,
                reason: "last_message_not_user",
                metadata: { message_count: messages.length, payload_kind: "chat" },
            });
            return apiError("VALIDATION_ERROR", "Last message must be a user message with text content", 400, requestId);
        }

        const userQuery = lastMessage.content.trim();
        if (!userQuery || userQuery.length > 2000) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat",
                userId: user.id,
                reason: "query_length_invalid",
                metadata: {
                    message_count: messages.length,
                    total_chars: totalChars,
                    payload_kind: "chat",
                },
            });
            return apiError("VALIDATION_ERROR", "Query must be between 1 and 2000 characters", 400, requestId);
        }

        const questionContext = contextualizeUserQuestion(messages);
        if (questionContext.contextMissing) return retrievalTextResponse(FOLLOW_UP_CLARIFICATION, "ui");
        const provider = process.env.AI_PROVIDER || "anthropic";
        const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
        const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
        const hasGemini = Boolean(process.env.GEMINI_API_KEY);
        const detectedIntent = detectAskIntent(userQuery);
        const intent = questionContext.requiresPassageEvidence && detectedIntent === "library_metadata" ? "hybrid" : detectedIntent;

        if (!hasAnthropic && !hasOpenAI) {
            logApiError({ requestId, route: "/api/chat", message: "No AI provider configured", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "AI service is not configured. Please contact an administrator.", 500, requestId);
        }

        if (intent !== "library_metadata" && intent !== "reading_advisor" && !hasGemini) {
            logApiError({ requestId, route: "/api/chat", message: "GEMINI_API_KEY not configured for retrieval embeddings", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "Ask My Library retrieval is not configured. Please contact an administrator.", 500, requestId);
        }

        const admit = async () => {
            const quota = await admitAiUsage(user.id, "ask-library", req.signal);
            if (!quota.allowed) {
                recordAiRouteAbuse({
                    signal: "ai_quota_exhausted",
                    request: req,
                    requestId,
                    route: "/api/chat",
                    userId: user.id,
                    reason: "quota_exhausted",
                    retryAfterMs: quota.retryAfterMs,
                    metadata: {
                        blocked_window: quota.blockedWindow,
                        limit: quota.limit,
                        used: quota.used,
                        reset_after_seconds: Math.max(1, Math.ceil(quota.retryAfterMs / 1000)),
                    },
                });
                return NextResponse.json(
                    { error: { code: "AI_QUOTA_EXCEEDED", message: getQuotaExceededMessage(quota) } },
                    {
                        status: 429,
                        headers: { "Retry-After": String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000))) },
                    }
                );
            }
            return null;
        };
        const usesEmbedding = intent !== "library_metadata" && hasGemini;
        if (usesEmbedding) {
            const failure = await admit();
            if (failure) return failure;
        }
        req.signal.throwIfAborted();
        const retrievalSignal = AbortSignal.any([req.signal, AbortSignal.timeout(35_000)]);
        const libraryPromise = supabase
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
        const embeddingPromise = intent !== "library_metadata" && hasGemini
            ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { retryOptions: { attempts: 1 } } }).models.embedContent({
                model: EMBEDDING_MODEL,
                contents: questionContext.semanticQuestion,
                config: { outputDimensionality: EMBEDDING_DIMENSIONS, abortSignal: retrievalSignal },
            }).then(
                (response) => ({ response, error: null as unknown }),
                (error: unknown) => ({ response: null, error }),
            )
            : Promise.resolve({ response: null, error: null as unknown });
        const [
            { data: libraryRows, error: libraryError },
            embeddingResult,
        ] = await Promise.all([libraryPromise, embeddingPromise]);

        if (libraryError) {
            logApiError({ requestId, route: "/api/chat", message: "Failed to load library metadata", error: libraryError });
            return apiError("INTERNAL_ERROR", "Failed to load your library. Please try again.", 500, requestId);
        }

        const libraryItems = (libraryRows ?? []) as LibraryItemRow[];
        const metadataContext = buildLibraryMetadataContext(libraryItems, MAX_LIBRARY_CONTEXT_CHARS);

        const retrievalContext = "";
        let retrievalStatus: "skipped" | "matched" | "no_match" | "not_initialized" = "skipped";
        if (intent !== "library_metadata" && hasGemini) {
            if (embeddingResult.error) {
                logApiError({ requestId, route: "/api/chat", message: "Gemini embedding API error", error: embeddingResult.error });
                return apiError("RETRIEVAL_UNAVAILABLE", "Ask My Library retrieval is temporarily unavailable. Please retry.", 503, requestId);
            }
            const queryEmbedding = embeddingResult.response?.embeddings?.[0]?.values;
            if (!queryEmbedding || queryEmbedding.length !== EMBEDDING_DIMENSIONS || !queryEmbedding.every(Number.isFinite)) {
                return apiError("RETRIEVAL_UNAVAILABLE", "Ask My Library retrieval is temporarily unavailable. Please retry.", 503, requestId);
            }
            try {
                const signal = retrievalSignal;
                const personal = await retrievePersonalEvidence({
                    supabase, userId: user.id, scope: ALL_PERSONAL_EVIDENCE,
                    question: userQuery, semanticQuestion: questionContext.semanticQuestion,
                    queryEmbedding, signal, implicitHighlightQuote: false, deferSelection: true,
                });
                // Query current source membership after personal ranking, so a reset,
                // removal, or withdrawal during retrieval does not reuse old passages.
                const sources = await loadLibrarySourceEvidence({
                    supabase, userId: user.id, queryEmbedding,
                    boostCompleted: shouldBoostCompletedForIntent(intent, userQuery), signal,
                });
                const rankedSources = await rankLibrarySourceSpans({ sources, userId: user.id, queryEmbedding, signal });
                const selected = await selectLibraryEvidence({ personal, sources: rankedSources, question: userQuery,
                    semanticQuestion: questionContext.semanticQuestion, signal });
                // Embedding and selection may be slow: revalidate both classes at the final delivery boundary.
                await recheckPersonalEvidenceCandidates({ supabase, userId: user.id, scope: ALL_PERSONAL_EVIDENCE,
                    candidates: selected.personal.items.map((item) => item.evidence), signal });
                const freshSources = await loadLibrarySourceEvidence({ supabase, userId: user.id, queryEmbedding,
                    boostCompleted: shouldBoostCompletedForIntent(intent, userQuery), signal });
                if (selected.sources.some((source) => !freshSources.some((fresh) => fresh.id === source.id && fresh.fingerprint === source.fingerprint))) {
                    throw new Error("Source evidence changed during retrieval");
                }
                await assertActivePersonalRetrievalSession({ supabase, scope: ALL_PERSONAL_EVIDENCE, signal });
                const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
                signal.throwIfAborted();
                if (authError || currentUser?.id !== user.id) throw new Error("RETRIEVAL_AUTH_CHANGED");
                if (selected.exactQuote !== null && !selected.quotedEvidenceId) throw new Error("Quoted evidence identity missing");
                if (selected.exactQuote !== null) return retrievalTextResponse(selected.exactQuote, "ui", issueEvidenceCitations({ userId: user.id, personal: selected.personal.items, sources: selected.sources, evidenceIds: selected.quotedEvidenceId ? [selected.quotedEvidenceId] : [], exactQuote: true }), true);
                if (selected.quoteTooLarge) return retrievalTextResponse("The matching stored passage is too long to quote completely here. Open the source to read its full text.", "ui");
                if (selected.evidenceIds.length === 0) {
                    if (intent !== "reading_advisor") return retrievalTextResponse(LIBRARY_NO_EVIDENCE, "ui");
                    retrievalStatus = "no_match";
                } else {
                    const text = renderEvidenceExtracts({
                        personal: selected.personal.items, sources: selected.sources, evidenceIds: selected.evidenceIds,
                    });
                    if (messages.filter((message) => message.role === "user").length === 1) {
                        afterResponse(() => captureServerAnalyticsEvent({ event: "ai_chat_started", distinctId: user.id,
                            insertId: `ai_chat_started:library:${user.id}:${requestId}`,
                            properties: { source: "ask_library", route: "/api/chat", chat_scope: "library", user_state: "authenticated" },
                        }));
                    }
                    return retrievalTextResponse(text, "ui", issueEvidenceCitations({ userId: user.id, personal: selected.personal.items, sources: selected.sources, evidenceIds: selected.evidenceIds }));
                }
            } catch (error) {
                if (error instanceof PersonalEvidenceIndexNotReady) return apiError("RETRIEVAL_NOT_READY", error.message, 503, requestId);
                logApiError({ requestId, route: "/api/chat", message: "Complete library evidence retrieval failed", error });
                return apiError("RETRIEVAL_UNAVAILABLE", "Your library evidence could not be searched completely. Please retry or ask a more specific question.", 503, requestId);
            }
        }

        // Retrieval already rechecks its session at delivery. Metadata branches
        // must also reject revocation that happened while loading the library.
        if (retrievalStatus === "skipped") {
            const finalSessionFailure = await validateChatSession();
            if (finalSessionFailure) return finalSessionFailure;
        }
        const retrievalContextForPrompt = retrievalContext || buildRetrievalFallbackText(retrievalStatus, intent);

        const systemPrompt = buildLibraryEvidencePrompt(metadataContext, retrievalContextForPrompt, intent);

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

        if (!usesEmbedding) {
            const failure = await admit();
            if (failure) return failure;
        }
        req.signal.throwIfAborted();
        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages: [{ role: "user", content: questionContext.semanticQuestion }],
            abortSignal: req.signal,
            maxOutputTokens: getOutputTokenCap(intent),
            experimental_transform: smoothStream({ delayInMs: 6 }),
            onFinish: async () => {
                if (messages.filter((message) => message.role === "user").length === 1) {
                    afterResponse(() => captureServerAnalyticsEvent({
                        event: "ai_chat_started",
                        distinctId: user.id,
                        insertId: `ai_chat_started:library:${user.id}:${requestId}`,
                        properties: {
                            source: "ask_library",
                            route: "/api/chat",
                            chat_scope: "library",
                            user_state: "authenticated",
                        },
                    }));
                }
            },
        });

        return result.toUIMessageStreamResponse({
            onError: (error) => {
                logApiError({ requestId, route: "/api/chat", message: "AI generation stream failed", error });
                return CHAT_STREAM_ERROR_MESSAGE;
            },
        });
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
