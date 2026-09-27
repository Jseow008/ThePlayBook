import { afterEach, describe, expect, it, vi } from "vitest";
import { streamText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { NextRequest } from "next/server";
import { CHAT_DEADLINE_MS, withChatDeadline } from "@/lib/server/chat-deadline";
import { retrievalTextResponse } from "@/lib/server/retrieval-response";

const request = (signal?: AbortSignal) => new NextRequest("https://example.test/api/chat", { method: "POST", body: "{}", signal });
afterEach(() => vi.useRealTimers());

describe("chat deadline and delivery", () => {
    it("bounds an upstream that ignores cancellation and cancels its late response", async () => {
        vi.useFakeTimers();
        let finish!: (response: Response) => void;
        let signal!: AbortSignal;
        const response = withChatDeadline(request(), async req => {
            signal = req.signal;
            return new Promise(resolve => { finish = resolve; });
        });
        await vi.advanceTimersByTimeAsync(CHAT_DEADLINE_MS);
        const timedOut = await response;
        expect(timedOut.status).toBe(504);
        expect((await timedOut.json()).error.code).toBe("CHAT_TIMEOUT");
        expect(signal.aborted).toBe(true);
        const cancel = vi.fn();
        finish(new Response(new ReadableStream({ cancel })));
        await vi.advanceTimersByTimeAsync(0);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it("never starts a cancelled request", async () => {
        const controller = new AbortController(); controller.abort();
        const run = vi.fn();
        expect((await withChatDeadline(request(controller.signal), run)).status).toBe(499);
        expect(run).not.toHaveBeenCalled();
    });

    it("cancels preparation immediately on disconnect", async () => {
        const controller = new AbortController();
        const pending = withChatDeadline(request(controller.signal), () => new Promise(() => {}));
        controller.abort();
        expect((await pending).status).toBe(499);
    });

    it("reports interrupted UI streams without pretending the partial answer finished", async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const response = await withChatDeadline(request(), async () => new Response(new ReadableStream({
            start(output) { output.enqueue(new TextEncoder().encode('data: {"type":"text-delta","id":"a","delta":"Partial"}\n\n')); }, cancel,
        }), { headers: { "x-vercel-ai-ui-message-stream": "v1" } }));
        const text = response.text();
        await vi.advanceTimersByTimeAsync(CHAT_DEADLINE_MS);
        const body = await text;
        expect(body).toContain('"type":"error"');
        expect(body).not.toContain('"type":"finish"');
        expect(cancel).toHaveBeenCalledOnce();
    });

    it("propagates downstream cancellation to provider work", async () => {
        let signal!: AbortSignal;
        const cancel = vi.fn();
        const response = await withChatDeadline(request(), async req => {
            signal = req.signal;
            return new Response(new ReadableStream({ cancel }));
        });
        await response.body!.cancel();
        expect(signal.aborted).toBe(true);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it("preserves successful extracts and their explicit completion marker", async () => {
        vi.useFakeTimers();
        const response = await withChatDeadline(request(), async () => retrievalTextResponse("Exact evidence", "ui"));
        const body = await response.text();
        expect(body).toContain('"delta":"Exact evidence"');
        expect(body).toContain('"finishReason":"stop"');
        expect(vi.getTimerCount()).toBe(0);
    });
    it("delivers a safe error through the real SDK after a provider sends partial text", async () => {
        const model = new MockLanguageModelV3({ doStream: async () => ({
            stream: new ReadableStream({ start(output) {
                output.enqueue({ type: "stream-start", warnings: [] });
                output.enqueue({ type: "text-start", id: "a" });
                output.enqueue({ type: "text-delta", id: "a", delta: "Unfinished" });
                output.enqueue({ type: "error", error: new Error("private provider credentials") });
                output.close();
            } }),
        }) });
        const response = await withChatDeadline(request(), async req => streamText({
            model, prompt: "question", abortSignal: req.signal, maxRetries: 0,
        }).toUIMessageStreamResponse({ onError: () => "The answer could not finish. Please retry." }));
        const text = await response.text();
        expect(text).toContain('"delta":"Unfinished"');
        expect(text).toContain('"type":"error"');
        expect(text).not.toContain("private provider credentials");
        expect(text).not.toContain('"finishReason":"stop"');
        expect(model.doStreamCalls).toHaveLength(1);
    });

});
