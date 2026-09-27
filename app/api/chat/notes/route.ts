import { withChatDeadline } from "@/lib/server/chat-deadline";
import { withAiSpendingScope, markAiSpendingAuthenticated, aiSpendingFailureResponse } from "@/lib/server/ai-spending";
import { aiRateLimit } from "@/lib/server/ai-rate-limit";
import { issueEvidenceCitations } from "@/lib/server/evidence-citation";
import { renderEvidenceExtracts } from "@/lib/server/evidence-extract-response";
import { NOTES_NO_EVIDENCE } from "@/lib/server/retrieval-generation";
import { afterResponse } from "@/lib/server/after-response";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { rateLimitFailureResponseWithTelemetry } from "@/lib/server/rate-limit";
import { recordAiRouteAbuse } from "@/lib/server/security-telemetry";
import { admitAiUsage, getQuotaExceededMessage } from "@/lib/server/ai-usage-quota";
import { PersonalEvidenceScopeSchema } from "@/lib/personal-evidence";
import { retrievePersonalEvidence, PersonalEvidenceIndexNotReady } from "@/lib/server/personal-retrieval";
import { retrievalTextResponse } from "@/lib/server/retrieval-response";
import { contextualizeUserQuestion, FOLLOW_UP_CLARIFICATION } from "@/lib/server/retrieval-user-context";
import { assertActiveChatSession, ChatSessionValidationError } from "@/lib/server/personal-retrieval-session";

export const maxDuration = 60;

const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().max(2_000).optional(),
    parts: z.array(z.unknown()).optional(),
});

const NotesChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1).max(20),
    scope: PersonalEvidenceScopeSchema,
    scopeLabel: z.string().trim().max(300).optional(),
});

const MAX_TOTAL_MESSAGE_CHARS = 12_000;

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
    return withChatDeadline(req, (boundedRequest) => withAiSpendingScope(boundedRequest, "ask-notes", () => handlePost(boundedRequest)));
}

async function handlePost(req: NextRequest) {
    const requestId = getRequestId();
    const protocol = req.headers.get("x-evidence-protocol") === "ui" ? "ui" : "text";

    try {
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();
        req.signal.throwIfAborted();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Please log in to use Ask These Notes", 401, requestId);
        }

        markAiSpendingAuthenticated();

        const rl = await aiRateLimit(req, user.id);
        if (!rl.success) {
            return rateLimitFailureResponseWithTelemetry({
                request: req,
                requestId,
                result: rl,
                route: "/api/chat/notes",
                category: "ai",
                userId: user.id,
                authState: "authenticated",
                message: "Too many requests. Please wait a moment.",
            });
        }

        // getUser can accept a revoked but unexpired JWT. Verify the live
        // session before quota admission, usage charging, or provider work.
        try {
            await assertActiveChatSession({ supabase, signal: req.signal });
        } catch (error) {
            if (error instanceof ChatSessionValidationError && error.code === "UNAUTHORIZED") {
                return apiError("UNAUTHORIZED", "Your chat session has ended. Please sign in again.", 401, requestId);
            }
            logApiError({ requestId, route: "/api/chat/notes", message: "Could not verify the live chat session", error });
            return apiError("RETRIEVAL_UNAVAILABLE", "Your chat session could not be verified. Please retry.", 503, requestId);
        }

        const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
        const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
        const hasGemini = Boolean(process.env.GEMINI_API_KEY);

        if ((!hasAnthropic && !hasOpenAI) || !hasGemini) {
            logApiError({ requestId, route: "/api/chat/notes", message: "No AI provider configured", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "AI service is not configured. Please contact an administrator.", 500, requestId);
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON body", 400, requestId);
        }

        const parsed = NotesChatRequestSchema.safeParse(body);
        if (!parsed.success) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat/notes",
                userId: user.id,
                reason: "invalid_payload",
                metadata: { payload_kind: "notes_chat" },
            });
            return apiError("VALIDATION_ERROR", "Invalid notes chat payload", 400, requestId);
        }

        const { scope } = parsed.data;
        const messages = normalizeMessages(parsed.data.messages as Array<Record<string, unknown>>);
        if (messages.length === 0) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat/notes",
                userId: user.id,
                reason: "empty_messages",
                metadata: { message_count: 0, payload_kind: "notes_chat" },
            });
            return apiError("VALIDATION_ERROR", "No valid messages provided", 400, requestId);
        }

        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
        if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat/notes",
                userId: user.id,
                reason: "conversation_too_long",
                metadata: {
                    message_count: messages.length,
                    total_chars: totalChars,
                    payload_kind: "notes_chat",
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
                route: "/api/chat/notes",
                userId: user.id,
                reason: "last_message_not_user",
                metadata: { message_count: messages.length, payload_kind: "notes_chat" },
            });
            return apiError("VALIDATION_ERROR", "Last message must be a user message with text content", 400, requestId);
        }
        if (lastMessage.content.length > 2_000) return apiError("VALIDATION_ERROR", "Query must be between 1 and 2000 characters", 400, requestId);
        const questionContext = contextualizeUserQuestion(messages);
        if (questionContext.contextMissing) return retrievalTextResponse(FOLLOW_UP_CLARIFICATION, protocol);

        const quota = await admitAiUsage(user.id, "ask-notes", req.signal);
        if (!quota.allowed) {
            recordAiRouteAbuse({
                signal: "ai_quota_exhausted",
                request: req,
                requestId,
                route: "/api/chat/notes",
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

        req.signal.throwIfAborted();
        let evidence;
        try {
            evidence = await retrievePersonalEvidence({
                supabase, userId: user.id, scope, question: lastMessage.content,
                semanticQuestion: questionContext.semanticQuestion, signal: req.signal,
            });
        } catch (error) {
            const spendingFailure = aiSpendingFailureResponse(error);
            if (spendingFailure) return spendingFailure;
            if (error instanceof PersonalEvidenceIndexNotReady) return apiError("RETRIEVAL_NOT_READY", error.message, 503, requestId);
            logApiError({ requestId, route: "/api/chat/notes", message: "Personal retrieval did not complete", error });
            return apiError("RETRIEVAL_UNAVAILABLE", "Your notes could not be searched completely. Please retry or narrow your filters.", 503, requestId);
        }
        if (evidence.items.length === 0) {
            return retrievalTextResponse(NOTES_NO_EVIDENCE, protocol);
        }
        const quoted = evidence.items.find((item) => item.exactQuote !== null);
        if (quoted?.exactQuote !== null && quoted?.exactQuote !== undefined) {
            return retrievalTextResponse(quoted.exactQuote, protocol, protocol === "ui" ? issueEvidenceCitations({ userId: user.id, personal: [quoted] }) : [], true);
        }

        req.signal.throwIfAborted();
        const text = renderEvidenceExtracts({ personal: evidence.items });
        if (messages.filter((message) => message.role === "user").length === 1) {
            afterResponse(() => captureServerAnalyticsEvent({
                event: "ai_chat_started", distinctId: user.id,
                insertId: `ai_chat_started:notes:${user.id}:${requestId}`,
                properties: { source: "ask_notes", route: "/api/chat/notes", chat_scope: "notes",
                    note_count: evidence.candidateCount, user_state: "authenticated" },
            }));
        }
        return retrievalTextResponse(text, protocol, protocol === "ui" ? issueEvidenceCitations({ userId: user.id, personal: evidence.items }) : []);
    } catch (error: unknown) {
        req.signal.throwIfAborted();
        const spendingFailure = aiSpendingFailureResponse(error);
        if (spendingFailure) return spendingFailure;
        logApiError({
            requestId,
            route: "/api/chat/notes",
            message: "Unhandled error in notes chat endpoint",
            error,
        });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred. Please try again.", 500, requestId);
    }
}
