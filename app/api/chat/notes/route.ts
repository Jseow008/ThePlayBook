import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { z } from "zod";
import { apiError, getRequestId, logApiError } from "@/lib/server/api";
import { rateLimit } from "@/lib/server/rate-limit";

export const maxDuration = 60;

const ChatMessageSchema = z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().trim().max(2_000).optional(),
    parts: z.array(z.any()).optional(),
});

const NotesChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1).max(20),
    highlightIds: z.array(z.string().uuid()).min(1).max(40),
    scopeLabel: z.string().trim().max(300).optional(),
});

const MAX_HISTORY_MESSAGES = 6;
const MAX_TOTAL_MESSAGE_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 9_000;
const NOTES_DEFAULT_MAX_OUTPUT_TOKENS = 350;
const NOTES_SYNTHESIS_MAX_OUTPUT_TOKENS = 450;

type HighlightContextRow = {
    id: string;
    highlighted_text: string;
    note_body: string | null;
    created_at: string | null;
    content_item: { title: string | null } | Array<{ title: string | null }> | null;
    segment: { title: string | null } | Array<{ title: string | null }> | null;
};

function getRelation<T>(value: T | T[] | null): T | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
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

function trimHighlightText(text: string, noteText: string | null): string {
    const maxChars = noteText ? 160 : 220;
    return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}...` : text;
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
            return apiError("UNAUTHORIZED", "Please log in to use Ask My Library", 401, requestId);
        }

        const rl = await rateLimit(req, { limit: 10, windowMs: 60_000, key: `${user.id}:notes` });
        if (!rl.success) {
            return NextResponse.json(
                { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment." } },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)) },
                }
            );
        }

        const provider = process.env.AI_PROVIDER || "anthropic";
        const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
        const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

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
            return apiError("VALIDATION_ERROR", "Invalid notes chat payload", 400, requestId);
        }

        const { highlightIds, scopeLabel } = parsed.data;
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
        const prefersLongerSynthesis = detectNotesSynthesisIntent(lastMessage.content);

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
        let contextText = rows
            .map((highlight, index) => {
                const contentItem = getRelation(highlight.content_item);
                const segment = getRelation(highlight.segment);
                const noteText = highlight.note_body?.trim();
                const title = contentItem?.title || "Unknown Source";
                const section = segment?.title?.trim();

                return [
                    `[Note ${index + 1}: "${title}"${section ? ` • ${section}` : ""}]`,
                    noteText ? `Note: ${noteText}` : null,
                    `Highlight: ${trimHighlightText(highlight.highlighted_text, noteText || null)}`,
                ]
                    .filter(Boolean)
                    .join("\n");
            })
            .join("\n\n---\n\n");

        if (contextText.length > MAX_CONTEXT_CHARS) {
            contextText = contextText.slice(0, MAX_CONTEXT_CHARS);
        }

        if (!contextText) {
            contextText = "No relevant note context is available for this request.";
        }

        const systemPrompt = `You are a notes assistant inside a personal reading app.
Answer only from the scoped note context below.

Notes context:
${contextText}

Scope: ${scopeLabel || "Current notes view"}
Items in scope: ${rows.length}
Written notes: ${noteBodyCount}
Highlight-only items: ${highlightOnlyCount}

Rules:
- Treat written notes as the strongest evidence. Use highlights as supporting context.
- If the scope is mostly clipped highlights, say that once and still extract the strongest themes available.
- If the notes are insufficient, say so clearly without repeating yourself.
- Cite source titles naturally.
- Keep answers short, structured, and practical. Use bullets when listing patterns or gaps.`;

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
            maxOutputTokens: prefersLongerSynthesis ? NOTES_SYNTHESIS_MAX_OUTPUT_TOKENS : NOTES_DEFAULT_MAX_OUTPUT_TOKENS,
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
