import { act, renderHook, waitFor } from '@testing-library/react';
import { DefaultChatTransport } from 'ai';
import { useReliableChat } from '@/hooks/useReliableChat';

function response(chunks: object[]) {
    return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
    });
}
const partial = [
    { type: 'start', messageId: 'answer' },
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: 'Unfinished claim' },
    { type: 'text-end', id: 'text' },
];

describe('useReliableChat', () => {
    it.each([
        ['early EOF', []],
        ['provider error', [{ type: 'error', errorText: 'Unavailable' }]],
        ['abort', [{ type: 'abort' }]],
        ['output limit', [{ type: 'finish', finishReason: 'length' }]],
    ])('discards an incomplete answer after %s and retries the same question', async (_name, ending) => {
        const requests: Array<{ messages: Array<{ role: string }> }> = [];
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            requests.push(JSON.parse(init!.body as string));
            return requests.length === 1 ? response([...partial, ...ending]) : response([...partial, { type: 'finish', finishReason: 'stop' }]);
        });
        const transport = new DefaultChatTransport({ fetch: fetchMock });
        const { result } = renderHook(() => useReliableChat({ transport }));
        await act(async () => { await result.current.sendMessage({ text: 'Keep this question' }); });
        await waitFor(() => expect(result.current.error).toBeDefined());
        expect(result.current.messages.map((message) => message.role)).toEqual(['user']);
        expect(result.current.completedMessages.map((message) => message.role)).toEqual(['user']);
        await act(async () => { await result.current.regenerate(); });
        expect(requests[1].messages.map((message) => message.role)).toEqual(['user']);
        expect(result.current.error).toBeUndefined();
        expect(result.current.completedMessages.map((message) => message.role)).toEqual(['user', 'assistant']);
    });

    it('preserves earlier completed answers when a new question fails before streaming', async () => {
        let attempt = 0;
        const transport = new DefaultChatTransport({ fetch: async () => ++attempt === 1
            ? response([...partial, { type: 'finish', finishReason: 'stop' }])
            : new Response('Unavailable', { status: 503 }) });
        const { result } = renderHook(() => useReliableChat({ transport }));
        await act(async () => { await result.current.sendMessage({ text: 'First question' }); });
        await act(async () => { await result.current.sendMessage({ text: 'Second question' }); });
        expect(result.current.error).toBeDefined();
        expect(result.current.completedMessages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
    });

    it('ignores a late aborted finish after replacing the Notes chat instance', async () => {
        let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
        const transport = new DefaultChatTransport({ fetch: async () => new Response(new ReadableStream({ start(streamController) {
            controller = streamController;
            streamController.enqueue(new TextEncoder().encode(partial.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')));
        } }), { headers: { 'content-type': 'text/event-stream' } }) });
        const { result, rerender } = renderHook(({ id }) => useReliableChat({ id, transport }), { initialProps: { id: 'old-scope' } });
        let pending: Promise<void>;
        act(() => { pending = result.current.sendMessage({ text: 'Old question' }); });
        await waitFor(() => expect(result.current.messages).toHaveLength(2));
        rerender({ id: 'new-scope' });
        await act(async () => { controller!.close(); await pending; });
        expect(result.current.messages).toEqual([]);
        expect(result.current.error).toBeUndefined();
    });

    it('treats an empty completed stream as failure', async () => {
        const transport = new DefaultChatTransport({ fetch: async () => response([{ type: 'finish', finishReason: 'stop' }]) });
        const { result } = renderHook(() => useReliableChat({ transport }));
        await act(async () => { await result.current.sendMessage({ text: 'Question' }); });
        expect(result.current.error).toBeDefined();
        expect(result.current.completedMessages).toHaveLength(1);
    });

    it('does not persist an in-flight answer and aborts on unmount', async () => {
        let signal: AbortSignal | null | undefined;
        const transport = new DefaultChatTransport({ fetch: async (_url, init) => {
            signal = init?.signal;
            return new Response(new ReadableStream({ start(controller) {
                controller.enqueue(new TextEncoder().encode(partial.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')));
                signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
            } }), { headers: { 'content-type': 'text/event-stream' } });
        } });
        const { result, unmount } = renderHook(() => useReliableChat({ transport }));
        act(() => { void result.current.sendMessage({ text: 'Question' }); });
        await waitFor(() => expect(result.current.messages).toHaveLength(2));
        expect(result.current.completedMessages).toHaveLength(1);
        unmount();
        expect(signal?.aborted).toBe(true);
    });
});
