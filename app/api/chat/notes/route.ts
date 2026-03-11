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

const NotesChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema).min(1).max(20),
    highlightIds: z.array(z.string().uuid()).max(40),
    scopeLabel: z.string().trim().max(300).optional(),
});

const MAX_TOTAL_MESSAGE_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 12_000;

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

        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            logApiError({ requestId, route: "/api/chat/notes", message: "OPENAI_API_KEY not configured", error: new Error("Missing env") });
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

        const { messages, highlightIds, scopeLabel } = parsed.data;
        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
        if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
            return apiError("VALIDATION_ERROR", "Conversation is too long. Please start a new chat.", 400, requestId);
        }

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== "user") {
            return apiError("VALIDATION_ERROR", "Last message must be a user message with text content", 400, requestId);
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
        let contextText = rows
            .map((highlight, index) => {
                const contentItem = getRelation(highlight.content_item);
                const segment = getRelation(highlight.segment);
                const noteText = highlight.note_body?.trim();
                const title = contentItem?.title || "Unknown Source";
                const section = segment?.title?.trim();

                return [
                    `[Note ${index + 1}: "${title}"${section ? ` • ${section}` : ""}]`,
                    `Highlight: ${highlight.highlighted_text}`,
                    noteText ? `Note: ${noteText}` : null,
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

        const systemPrompt = `You are a helpful notes assistant inside a personal reading app.
Your role is to answer the user's question using ONLY the provided notes context.

Scoped Notes Context:
===
${contextText}
===

Current scope:
${scopeLabel || "Current notes view"}

Rules:
1. Answer ONLY from the provided note context. Never use outside knowledge.
2. If the notes do not contain enough information, say so clearly.
3. Cite source titles naturally when referencing a point.
4. Keep answers concise, structured, and useful for someone reviewing their notes.
5. Focus on synthesis, comparison, retrieval, and pattern-finding across the notes in scope.`;

        const provider = process.env.AI_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai");
        let aiModel;

        if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
            const { anthropic } = await import("@ai-sdk/anthropic");
            aiModel = anthropic(process.env.AI_MODEL || "claude-sonnet-4-20250514");
        } else {
            aiModel = openai(process.env.AI_MODEL || "gpt-4o-mini");
        }

        const result = streamText({
            model: aiModel,
            system: systemPrompt,
            messages,
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
