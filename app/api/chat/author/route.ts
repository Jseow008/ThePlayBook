import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 60;

const ChatMessageSchema = z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().trim().min(1).max(2_000),
});

const AuthorChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1).max(20),
    contentId: z.string().uuid(),
    authorName: z.string().trim().min(1).max(200),
    bookTitle: z.string().trim().min(1).max(500),
});

const MAX_TOTAL_MESSAGE_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 16_000;

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

        // --- Rate Limiting ---
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
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            logApiError({ requestId, route: "/api/chat/author", message: "OPENAI_API_KEY not configured", error: new Error("Missing env") });
            return apiError("INTERNAL_ERROR", "AI service is not configured.", 500, requestId);
        }

        // --- Parse & Validate Body ---
        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return apiError("INVALID_JSON", "Invalid JSON body", 400, requestId);
        }

        const parsed = AuthorChatRequestSchema.safeParse(body);
        if (!parsed.success) {
            return apiError("VALIDATION_ERROR", "Invalid chat payload", 400, requestId);
        }

        const { messages, contentId, authorName, bookTitle } = parsed.data;
        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
        if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
            return apiError("VALIDATION_ERROR", "Conversation is too long. Please start a new chat.", 400, requestId);
        }

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== "user") {
            return apiError("VALIDATION_ERROR", "Last message must be a user message", 400, requestId);
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

        // --- Stream LLM Response with Author Persona ---
        const systemPrompt = `You are ${authorName}, the author of "${bookTitle}". The user has just finished reading your work and wants to discuss it with you.

Your Complete Work:
===
${contextText}
===

Rules:
1. Stay fully in character as ${authorName}. Speak in the first person as the author. Never break character or refer to yourself as an AI.
2. Answer questions based on the ideas, arguments, and framework presented in your book above.
3. If asked about topics beyond the scope of the book, you may offer your perspective as ${authorName} would, but clearly note when you're extrapolating beyond what's written.
4. Be conversational, intellectually engaging, and thought-provoking. Challenge the user's thinking when appropriate.
5. Use ${authorName}'s characteristic communication style and vocabulary as much as possible.
6. Keep responses concise but substantive. Format in clean Markdown when helpful.
7. If the user highlights a specific passage or concept, reference it directly and expand on it.`;

        const result = streamText({
            model: openai("gpt-4o-mini"),
            system: systemPrompt,
            messages,
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
