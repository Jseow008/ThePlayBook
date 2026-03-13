import { POST } from "@/app/api/chat/notes/route";
import { NextRequest } from "next/server";
import { vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server/rate-limit";
import { streamText } from "ai";

vi.mock("@/lib/supabase/server", () => ({
    createClient: vi.fn(),
}));

vi.mock("@/lib/server/rate-limit", () => ({
    rateLimit: vi.fn(),
}));

vi.mock("ai", () => ({
    streamText: vi.fn().mockImplementation(() => ({
        toTextStreamResponse: () => new Response("mocked-stream"),
    })),
}));

vi.mock("@ai-sdk/anthropic", () => ({
    anthropic: vi.fn().mockReturnValue("mock-anthropic-model"),
}));

describe("Notes chat API", () => {
    const mockUser = { id: "user-123" };
    const mockAuthUser = vi.fn();
    const highlightQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn(),
    };

    const mockSupabaseClient = {
        auth: { getUser: mockAuthUser },
        from: vi.fn().mockReturnValue(highlightQuery),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.ANTHROPIC_API_KEY = "test-key";
        delete process.env.OPENAI_API_KEY;
        delete process.env.AI_PROVIDER;

        (createClient as any).mockResolvedValue(mockSupabaseClient);
        (rateLimit as any).mockResolvedValue({ success: true, retryAfterMs: 0 });
        mockAuthUser.mockResolvedValue({ data: { user: mockUser } });
        highlightQuery.then.mockImplementation((resolve: any) =>
            resolve({
                data: [
                    {
                        id: "123e4567-e89b-12d3-a456-426614174000",
                        highlighted_text: "Discipline equals freedom",
                        note_body: "Revisit this idea",
                        created_at: "2026-03-11T12:00:00.000Z",
                        content_item: { title: "Can't Hurt Me" },
                        segment: { title: "Introduction" },
                    },
                ],
                error: null,
            })
        );
    });

    it("requires authentication", async () => {
        mockAuthUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("unauth") });

        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages: [{ role: "user", content: "Summarize these notes" }],
                highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(401);
    });

    it("validates the scoped payload", async () => {
        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages: [],
                highlightIds: [],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error.code).toBe("VALIDATION_ERROR");
    });

    it("fetches only the requested user highlights and streams a response", async () => {
        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages: [
                    {
                        role: "user",
                        parts: [{ type: "text", text: "Summarize these notes" }],
                    },
                ],
                highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
                scopeLabel: "1 matching note • Can't Hurt Me",
            }),
        });

        const res = await POST(req);

        expect(mockSupabaseClient.from).toHaveBeenCalledWith("user_highlights");
        expect(highlightQuery.eq).toHaveBeenCalledWith("user_id", "user-123");
        expect(highlightQuery.in).toHaveBeenCalledWith("id", ["123e4567-e89b-12d3-a456-426614174000"]);
        expect(res.status).toBe(200);
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            maxOutputTokens: 450,
            system: expect.stringContaining("Treat written notes as the strongest evidence"),
        }));
    });

    it("accepts legacy content-only notes messages", async () => {
        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages: [{ role: "user", content: "Legacy note payload" }],
                highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
    });

    it("rejects requests when normalization produces no usable note text", async () => {
        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages: [
                    {
                        role: "user",
                        parts: [{ type: "tool-invocation", toolName: "search", args: {} }],
                    },
                ],
                highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error.message).toContain("No valid messages");
    });

    it("rejects requests when the final normalized message is not from the user", async () => {
        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages: [
                    { role: "user", parts: [{ type: "text", text: "Hello" }] },
                    { role: "assistant", parts: [{ type: "text", text: "Hi there" }] },
                ],
                highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error.message).toContain("Last message must be a user message");
    });

    it("returns 500 only when no AI provider key is configured", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.OPENAI_API_KEY;

        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages: [{ role: "user", content: "Summarize these notes" }],
                highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(500);
    });

    it("uses the higher output cap for synthesis-style note questions", async () => {
        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages: [{ role: "user", content: "Summarize the key ideas across these notes" }],
                highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            maxOutputTokens: 450,
        }));
    });

    it("keeps only the last 6 normalized note messages", async () => {
        const messages = Array.from({ length: 7 }, (_, index) => ({
            role: index % 2 === 0 ? "user" : "assistant",
            content: `note-message-${index + 1}`,
        }));

        const req = new NextRequest(new URL("http://localhost/api/chat/notes"), {
            method: "POST",
            body: JSON.stringify({
                messages,
                highlightIds: ["123e4567-e89b-12d3-a456-426614174000"],
            }),
        });

        const res = await POST(req);
        expect(res.status).toBe(200);
        expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
            messages: messages.slice(-6),
        }));
    });
});
