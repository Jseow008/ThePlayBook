import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Validation — only validate the extra fields we need; messages are handled
// by the AI SDK's own `convertToModelMessages()` which understands the
// `parts`-based UI format natively.
// ---------------------------------------------------------------------------

const AuthorChatBodySchema = z.object({
    contentId: z.string().uuid(),
    authorName: z.string().trim().min(1).max(200),
    bookTitle: z.string().trim().min(1).max(500),
    // messages validated structurally below, not via Zod
    messages: z.array(z.any()).min(1).max(30),
});

// ---------------------------------------------------------------------------
// Cost & Abuse Constants
// ---------------------------------------------------------------------------

/** Only send the last N messages as conversation history (sliding window).
 *  This caps input tokens on long chats and keeps costs predictable. */
const MAX_HISTORY_MESSAGES = 6;

/** Max chars of book content injected into the system prompt. */
const MAX_CONTEXT_CHARS = 12_000;

/** Max output tokens the model is allowed to generate per response.
 *  Forces brevity and controls cost per completion. */
const MAX_OUTPUT_TOKENS = 600;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract plain text from a UI message (handles both `parts` and legacy `content` formats). */
function getMessageText(msg: Record<string, unknown>): string {
    // Newer format: parts array with { type: "text", text: "..." }
    if (Array.isArray(msg.parts)) {
        return msg.parts
            .filter((p: any) => p.type === "text" && typeof p.text === "string")
            .map((p: any) => p.text as string)
            .join("");
    }
    // Legacy format: { content: "..." }
    if (typeof msg.content === "string") {
        return msg.content;
    }
    return "";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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
            return apiError("UNAUTHORIZED", "Please log in to use this feature", 401, requestId);
        }

        // --- Rate Limiting (10 messages / minute / user) ---
        const rl = rateLimit(req, { limit: 10, windowMs: 60_000, key: user.id });
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
        if (!process.env.ANTHROPIC_API_KEY) {
            logApiError({ requestId, route: "/api/chat/author", message: "ANTHROPIC_API_KEY not configured", error: new Error("Missing env") });
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
            return apiError("VALIDATION_ERROR", "Invalid chat payload", 400, requestId);
        }

        const { contentId, authorName, bookTitle, messages: rawMessages } = parsed.data;

        // --- Validate last message is from user ---
        const lastRaw = rawMessages[rawMessages.length - 1];
        if (!lastRaw || lastRaw.role !== "user") {
            return apiError("VALIDATION_ERROR", "Last message must be a user message", 400, requestId);
        }

        // --- Guard: max character length across all messages ---
        const totalTextChars = rawMessages.reduce((sum: number, m: any) => sum + getMessageText(m).length, 0);
        if (totalTextChars > 20_000) {
            return apiError("VALIDATION_ERROR", "Conversation is too long. Please start a new chat.", 400, requestId);
        }

        // --- Sliding Context Window: only keep last N messages ---
        const recentMessages = rawMessages.slice(-MAX_HISTORY_MESSAGES);

        // --- Convert UI messages → Model messages using AI SDK utility ---
        let modelMessages;
        try {
            modelMessages = await convertToModelMessages(recentMessages as UIMessage[]);
        } catch (convErr: unknown) {
            logApiError({ requestId, route: "/api/chat/author", message: "Message conversion failed", error: convErr });
            return apiError("VALIDATION_ERROR", "Invalid message format", 400, requestId);
        }

        // --- Fetch Book Segments for Context ---
        const { data: segments, error: segError } = await supabase
            .from("segment")
            .select("title, markdown_body, order_index")
            .eq("item_id", contentId)
            .order("order_index", { ascending: true });

        if (segError) {
            logApiError({ requestId, route: "/api/chat/author", message: "Failed to fetch segments", error: segError });
            return apiError("INTERNAL_ERROR", "Failed to load book content.", 500, requestId);
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
        const systemPrompt = `You are ${authorName}, the author of "${bookTitle}". The reader has just finished your work and wants to discuss it with you.

<your_work>
${contextText}
</your_work>

<rules>
1. STAY IN CHARACTER at all times. You are ${authorName}. Speak in the first person. Never mention being an AI, a language model, or an assistant.
2. Draw answers from the ideas, arguments, and frameworks in your work above. When referencing a concept, be specific.
3. If asked about topics unrelated to your book (e.g., writing code, composing emails, homework help), politely decline: "That's outside the scope of what I write about. Let's stay on the ideas in my book."
4. Keep responses SHORT — 2-3 paragraphs maximum. This is a lively intellectual conversation, not a lecture.
5. Be intellectually challenging. Ask the reader follow-up questions. Push back on lazy thinking.
6. Match ${authorName}'s real-world communication style, vocabulary, and tone as closely as possible.
</rules>`;

        // --- Stream with Claude 3.5 Haiku ---
        const result = streamText({
            model: anthropic("claude-3-5-haiku-latest"),
            system: systemPrompt,
            messages: modelMessages,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
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
