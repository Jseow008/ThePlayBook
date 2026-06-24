import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { smoothStream, streamText } from "ai";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { captureServerAnalyticsEvent } from "@/lib/server/analytics";
import { rateLimit, rateLimitFailureResponseWithTelemetry } from "@/lib/server/rate-limit";
import { recordAiRouteAbuse } from "@/lib/server/security-telemetry";
import { checkAiUsageQuota, getQuotaExceededMessage, recordGeneratedAiMessage } from "@/lib/server/ai-usage-quota";

export const maxDuration = 60;

const AUTHENTICATED_LIMIT = { limit: 10, windowMs: 60_000 } as const;
const GUEST_LIMIT = { limit: 3, windowMs: 10 * 60_000 } as const;
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const AuthorChatBodySchema = z.object({
    contentId: z.string().uuid(),
    authorName: z.string().trim().min(1).max(200),
    contentTitle: z.string().trim().min(1).max(500).optional(),
    bookTitle: z.string().trim().min(1).max(500).optional(),
    messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().optional(),
        parts: z.array(z.any()).optional() // Since @ai-sdk/react uses parts or content
    })).min(1).max(30),
}).refine((body) => body.contentTitle || body.bookTitle, {
    message: "contentTitle is required",
    path: ["contentTitle"],
});

// ---------------------------------------------------------------------------
// Cost & Abuse Constants
// ---------------------------------------------------------------------------

/** Only send the last N messages as conversation history (sliding window). */
const MAX_HISTORY_MESSAGES = 4;

/** Max chars of source material injected into the system prompt. */
const MAX_CONTEXT_CHARS = 12_000;

/** Max output tokens the model is allowed to generate per response. */
const MAX_OUTPUT_TOKENS = 400;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract plain text from a message (handles both `parts` and legacy `content` formats). */
function getMessageText(msg: Record<string, unknown>): string {
    if (Array.isArray(msg.parts)) {
        return msg.parts
            .filter((p: any) => p.type === "text" && typeof p.text === "string")
            .map((p: any) => p.text as string)
            .join("");
    }
    if (typeof msg.content === "string") {
        return msg.content;
    }
    return "";
}

/** Convert UI messages (parts-based) to the simple {role, content} format that streamText accepts. */
function normalizeMessages(rawMessages: any[]): Array<{ role: "user" | "assistant"; content: string }> {
    return rawMessages
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({
            role: m.role as "user" | "assistant",
            content: getMessageText(m).trim(),
        }))
        .filter((m) => m.content.length > 0);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
    const requestId = getRequestId();

    try {
        // --- Optional Auth ---
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        // --- Rate Limiting ---
        const rl = user
            ? await rateLimit(req, {
                ...AUTHENTICATED_LIMIT,
                key: "author-chat:user",
                identifier: user.id,
            })
            : await rateLimit(req, {
                ...GUEST_LIMIT,
                key: "author-chat:guest",
            });
        if (!rl.success) {
            const retryAfterSeconds = Math.max(1, Math.ceil((rl.retryAfterMs ?? 60000) / 1000));
            return rateLimitFailureResponseWithTelemetry({
                request: req,
                requestId,
                result: rl,
                route: "/api/chat/author",
                category: "ai",
                userId: user?.id,
                authState: user ? "authenticated" : "anonymous",
                message: `Too many requests. Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"} and try again.`,
            });
        }

        // --- Validate API Key ---
        if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
            logApiError({ requestId, route: "/api/chat/author", message: "API Keys not configured", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "AI service is not configured.", 500, requestId);
        }

        // --- Parse & Validate Body ---
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON body", 400, requestId);
        }

        const parsed = AuthorChatBodySchema.safeParse(body);
        if (!parsed.success) {
            logApiError({ requestId, route: "/api/chat/author", message: "Validation failed", error: new Error(parsed.error.message) });
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat/author",
                userId: user?.id,
                authState: user ? "authenticated" : "anonymous",
                reason: "invalid_payload",
                metadata: { payload_kind: "author_chat" },
            });
            return apiError("VALIDATION_ERROR", "Invalid chat payload", 400, requestId);
        }

        const { contentId, authorName, messages: rawMessages } = parsed.data;
        const contentTitle = parsed.data.contentTitle ?? parsed.data.bookTitle ?? "this source";

        // --- Normalize messages from UI format to simple {role, content} ---
        const allMessages = normalizeMessages(rawMessages);

        if (allMessages.length === 0) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat/author",
                userId: user?.id,
                authState: user ? "authenticated" : "anonymous",
                reason: "empty_messages",
                metadata: { message_count: 0, payload_kind: "author_chat" },
            });
            return apiError("VALIDATION_ERROR", "No valid messages provided", 400, requestId);
        }

        // --- Validate last message is from user ---
        const lastMsg = allMessages[allMessages.length - 1];
        if (lastMsg.role !== "user") {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat/author",
                userId: user?.id,
                authState: user ? "authenticated" : "anonymous",
                reason: "last_message_not_user",
                metadata: { message_count: allMessages.length, payload_kind: "author_chat" },
            });
            return apiError("VALIDATION_ERROR", "Last message must be a user message", 400, requestId);
        }

        // --- Guard: max character length ---
        const totalTextChars = allMessages.reduce((sum, m) => sum + m.content.length, 0);
        if (totalTextChars > 20_000) {
            recordAiRouteAbuse({
                signal: "ai_invalid_payload",
                request: req,
                requestId,
                route: "/api/chat/author",
                userId: user?.id,
                authState: user ? "authenticated" : "anonymous",
                reason: "conversation_too_long",
                metadata: {
                    message_count: allMessages.length,
                    total_chars: totalTextChars,
                    payload_kind: "author_chat",
                },
            });
            return apiError("VALIDATION_ERROR", "Conversation is too long. Please start a new chat.", 400, requestId);
        }

        if (user) {
            const quota = await checkAiUsageQuota(supabase, user.id);
            if (!quota.allowed) {
                recordAiRouteAbuse({
                    signal: "ai_quota_exhausted",
                    request: req,
                    requestId,
                    route: "/api/chat/author",
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
        }

        // --- Sliding Context Window: only keep last N messages ---
        const messages = allMessages.slice(-MAX_HISTORY_MESSAGES);

        // --- Fetch Content Segments for Context ---
        const { data: segments, error: segError } = await supabase
            .from("segment")
            .select("title, markdown_body, order_index")
            .eq("item_id", contentId)
            .order("order_index", { ascending: true });

        if (segError) {
            logApiError({ requestId, route: "/api/chat/author", message: "Failed to fetch segments", error: segError });
            return apiError("INTERNAL_ERROR", "Failed to load source material.", 500, requestId);
        }

        let contextText = "";
        const segmentRows = (segments || []) as Array<{ title: string | null; markdown_body: string; order_index: number }>;
        if (segmentRows.length > 0) {
            contextText = segmentRows
                .map((seg, i) => {
                    const title = seg.title || `Section ${i + 1}`;
                    return `## ${title}\n${seg.markdown_body}`;
                })
                .join("\n\n---\n\n");

            if (contextText.length > MAX_CONTEXT_CHARS) {
                contextText = contextText.slice(0, MAX_CONTEXT_CHARS) + "\n\n[Content truncated for length]";
            }
        }

        // --- System Prompt (optimized for persona + cost control) ---
        const systemPrompt = `You are ${authorName}, speaking about "${contentTitle}".
Stay in character and answer from the source material below.

Source material:
${contextText}

Rules:
- Speak in first person as ${authorName}. Never mention being an AI.
- Stay on the ideas in this source. Decline unrelated tasks briefly.
- Be specific about concepts from the work.
- Keep replies short: 2-3 compact paragraphs max.
- Match ${authorName}'s tone and challenge weak thinking when appropriate.`;

        // --- Select Model Dynamically based on ENV vars ---
        let aiModel;
        const provider = process.env.AI_PROVIDER || "anthropic";

        if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
            aiModel = anthropic(process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL);
        } else if (process.env.OPENAI_API_KEY) {
            const { openai } = await import("@ai-sdk/openai");
            aiModel = openai(process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini");
        } else {
            aiModel = anthropic(process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL);
        }

        // --- Stream ---
        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            experimental_transform: smoothStream({ delayInMs: 6 }),
            onFinish: async () => {
                if (user) {
                    try {
                        await recordGeneratedAiMessage(supabase, { userId: user.id, feature: "author-chat" });
                    } catch (error) {
                        logApiError({ requestId, route: "/api/chat/author", message: "Failed to record AI usage", error });
                    }
                }

                if (allMessages.filter((message) => message.role === "user").length === 1) {
                    const distinctId = user?.id ?? `anonymous:${requestId}`;
                    await captureServerAnalyticsEvent({
                        event: "ai_chat_started",
                        distinctId,
                        insertId: `ai_chat_started:content:${distinctId}:${contentId}:${requestId}`,
                        properties: {
                            source: "author_chat",
                            route: "/api/chat/author",
                            chat_scope: "content",
                            content_id: contentId,
                            user_state: user ? "authenticated" : "anonymous",
                        },
                    });
                }
            },
        });

        return result.toTextStreamResponse();
    } catch (error: unknown) {
        logApiError({
            requestId,
            route: "/api/chat/author",
            message: "Unhandled error in Author Chat endpoint",
            error,
        });
        return apiError("INTERNAL_ERROR", "An unexpected error occurred. Please try again.", 500, requestId);
    }
}
