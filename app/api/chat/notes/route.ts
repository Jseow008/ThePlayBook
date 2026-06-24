import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { smoothStream, streamText } from "ai";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { rateLimit, rateLimitFailureResponseWithTelemetry } from "@/lib/server/rate-limit";
import { recordAiRouteAbuse } from "@/lib/server/security-telemetry";
import { checkAiUsageQuota, getQuotaExceededMessage, recordGeneratedAiMessage } from "@/lib/server/ai-usage-quota";
import {
    buildNotesContextSelection,
    getRelevanceRankedHighlights,
    type HighlightContextRow,
} from "@/lib/server/notes-chat-context";

export const maxDuration = 60;

const ChatMessageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().max(2_000).optional(),
    parts: z.array(z.any()).optional(),
});

const NotesChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1).max(20),
    highlightIds: z.array(z.string().uuid()).max(40),
    scopeLabel: z.string().trim().max(300).optional(),
});

const MAX_HISTORY_MESSAGES = 4;
const MAX_TOTAL_MESSAGE_CHARS = 12_000;
const NOTES_DEFAULT_MAX_OUTPUT_TOKENS = 350;
const NOTES_SYNTHESIS_MAX_OUTPUT_TOKENS = 450;
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

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

function detectNotesSynthesisIntent(query: string): boolean {
    return /\b(compare|comparison|summar(?:ize|ise)|theme|themes|pattern|patterns|tension|contradiction|overlap|across)\b/i.test(query);
}

export async function POST(req: NextRequest) {
    const requestId = getRequestId();

    try {
        const supabase = await createClient();
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            return apiError("UNAUTHORIZED", "Please log in to use Ask These Notes", 401, requestId);
        }

        const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, key: `${user.id}:notes` });
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

        const provider = process.env.AI_PROVIDER || "anthropic";
        const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
        const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
        const hasGemini = Boolean(process.env.GEMINI_API_KEY);

        if (!hasAnthropic && !hasOpenAI) {
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

        const { highlightIds, scopeLabel } = parsed.data;
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

        const trimmedMessages = messages.slice(-MAX_HISTORY_MESSAGES);
        const lastMessage = trimmedMessages[trimmedMessages.length - 1];
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
        const prefersLongerSynthesis = detectNotesSynthesisIntent(lastMessage.content);

        const quota = await checkAiUsageQuota(supabase, user.id);
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

        const { data: highlights, error: highlightError } = await supabase
            .from("user_highlights")
            .select(`
                id,
                highlighted_text,
                note_body,
                created_at,
                content_item ( title ),
                segment ( title )
            `)
            .eq("user_id", user.id)
            .in("id", highlightIds)
            .order("created_at", { ascending: false });

        if (highlightError) {
            logApiError({ requestId, route: "/api/chat/notes", message: "Failed to fetch scoped highlights", error: highlightError });
            return apiError("INTERNAL_ERROR", "Failed to load note context. Please try again.", 500, requestId);
        }

        const rows = (highlights ?? []) as HighlightContextRow[];
        const noteBodyCount = rows.filter((highlight) => Boolean(highlight.note_body?.trim())).length;
        const highlightOnlyCount = rows.length - noteBodyCount;
        let rankedRows: HighlightContextRow[] | null = null;

        if (hasGemini && rows.length > 1) {
            try {
                rankedRows = await getRelevanceRankedHighlights(lastMessage.content, rows, process.env.GEMINI_API_KEY!);
            } catch (error) {
                logApiError({
                    requestId,
                    route: "/api/chat/notes",
                    message: "Notes relevance ranking failed; falling back to scope order",
                    error,
                });
            }
        }

        const contextSelection = buildNotesContextSelection(rankedRows ?? rows, {
            selectionMode: rankedRows ? "relevance_ranked" : "scope_order",
        });

        const systemPrompt = `You are a notes assistant inside a personal reading app.
Answer only from the scoped note context below.

Notes context:
${contextSelection.contextText}

Scope: ${scopeLabel || "Current notes view"}
Items in scope: ${rows.length}
Written notes: ${noteBodyCount}
Highlight-only items: ${highlightOnlyCount}
Context selection: ${contextSelection.selectionMode === "relevance_ranked" ? "relevance-ranked from current notes scope" : "current notes scope order"}
Notes included in context: ${contextSelection.includedCount} of ${rows.length}
Notes omitted due to context budget: ${contextSelection.omittedCount}

Rules:
- Treat written notes as the strongest evidence. Use highlights as supporting context.
- The current notes scope is the hard boundary. Do not infer from notes outside this scope.
- If the scope is mostly clipped highlights, say that once and still extract the strongest themes available.
- If the notes are insufficient, say so clearly without repeating yourself.
- Cite source titles naturally.
- Keep answers short, structured, and practical. Use bullets when listing patterns or gaps.`;

        let aiModel;

        if (provider === "anthropic" && hasAnthropic) {
            const { anthropic } = await import("@ai-sdk/anthropic");
            aiModel = anthropic(process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL);
        } else if (hasOpenAI) {
            const { openai } = await import("@ai-sdk/openai");
            aiModel = openai(process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini");
        } else {
            const { anthropic } = await import("@ai-sdk/anthropic");
            aiModel = anthropic(process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL);
        }

        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages: trimmedMessages,
            maxOutputTokens: prefersLongerSynthesis ? NOTES_SYNTHESIS_MAX_OUTPUT_TOKENS : NOTES_DEFAULT_MAX_OUTPUT_TOKENS,
            experimental_transform: smoothStream({ delayInMs: 6 }),
            onFinish: async () => {
                try {
                    await recordGeneratedAiMessage(supabase, { userId: user.id, feature: "ask-notes" });
                } catch (error) {
                    logApiError({ requestId, route: "/api/chat/notes", message: "Failed to record AI usage", error });
                }

                if (messages.filter((message) => message.role === "user").length === 1) {
                    await captureServerAnalyticsEvent({
                        event: "ai_chat_started",
                        distinctId: user.id,
                        insertId: `ai_chat_started:notes:${user.id}:${requestId}`,
                        properties: {
                            source: "ask_notes",
                            route: "/api/chat/notes",
                            chat_scope: "notes",
                            note_count: rows.length,
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
            route: "/api/chat/notes",
            message: "Unhandled error in notes chat endpoint",
            error,
        });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred. Please try again.", 500, requestId);
    }
}
