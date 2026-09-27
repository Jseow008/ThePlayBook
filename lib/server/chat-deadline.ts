import "server-only";
import { NextRequest } from "next/server";

// Leave time to deliver a failure before the platform's 60-second hard limit.
export const CHAT_DEADLINE_MS = 50_000;
export const CHAT_INCOMPLETE_MESSAGE = "The answer could not finish. Please try again; any partial response may be incomplete.";

function untilAbort<T>(work: PromiseLike<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        Promise.resolve(work).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
}

/** Bounds both preparation and streamed delivery, including uncooperative upstream waits. */
export async function withChatDeadline(request: NextRequest, run: (request: NextRequest) => Promise<Response>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Chat deadline exceeded", "TimeoutError")), CHAT_DEADLINE_MS);
    timer.unref?.();
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const cleanup = () => clearTimeout(timer);
    try {
        signal.throwIfAborted();
        const work = run(new NextRequest(request, { signal }));
        // A late result must not continue streaming after the deadline response was sent.
        void work.then(response => { if (signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
        const response = await untilAbort(work, signal);
        signal.throwIfAborted();
        if (!response.body) { cleanup(); return response; }
        const reader = response.body.getReader();
        const isUI = response.headers.get("x-vercel-ai-ui-message-stream") === "v1";
        const body = new ReadableStream<Uint8Array>({
            async pull(output) {
                try {
                    const chunk = await untilAbort(reader.read(), signal);
                    signal.throwIfAborted();
                    if (chunk.done) { cleanup(); output.close(); }
                    else output.enqueue(chunk.value);
                } catch (error) {
                    cleanup();
                    void reader.cancel().catch(() => {});
                    if (isUI && !request.signal.aborted) {
                        output.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", errorText: CHAT_INCOMPLETE_MESSAGE })}\n\ndata: [DONE]\n\n`));
                        output.close();
                    } else output.error(error);
                }
            },
            cancel(reason) {
                cleanup();
                controller.abort(reason);
                return reader.cancel(reason);
            },
        });
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
        cleanup();
        if (!signal.aborted) throw error;
        return Response.json({ error: {
            code: request.signal.aborted ? "REQUEST_CANCELLED" : "CHAT_TIMEOUT",
            message: request.signal.aborted ? "The request was cancelled." : "The request took too long. Please try again.",
        } }, { status: request.signal.aborted ? 499 : 504, headers: { "Cache-Control": "no-store" } });
    }
}
