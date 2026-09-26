import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import { NotesAskPanel } from '@/components/notes/NotesAskPanel';
import { createNotesChatScope } from '@/lib/notes-chat-scope';
import { readNotesChatSession } from '@/lib/notes-chat-session';

const { streamFetch } = vi.hoisted(() => ({ streamFetch: vi.fn<typeof fetch>() }));
const ownerKey = 'scope-test-account:scope-test-session';
vi.mock('@/hooks/useVerifiedChatSession', () => ({
    useVerifiedChatSession: () => ({ ownerKey: 'scope-test-account:scope-test-session', isCurrent: () => true, resolved: true }),
}));
vi.mock('next/navigation', () => ({
    usePathname: () => '/notes', useSearchParams: () => new URLSearchParams('ask=1'),
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock('ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('ai')>();
    return {
        ...actual,
        DefaultChatTransport: class extends actual.DefaultChatTransport<UIMessage> {
            constructor(options: ConstructorParameters<typeof actual.DefaultChatTransport<UIMessage>>[0]) {
                super({ ...options, fetch: streamFetch });
            }
        },
    };
});

type ControlledResponse = {
    controller: ReadableStreamDefaultController<Uint8Array>;
    signal: AbortSignal | null | undefined;
    body: { scope: unknown };
};
const responses: ControlledResponse[] = [];
const encoder = new TextEncoder();
beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
beforeEach(() => {
    window.sessionStorage.clear();
    responses.length = 0;
    streamFetch.mockReset();
    streamFetch.mockImplementation(async (_url, options) => {
        // Deliberately ignore abort so late SDK updates exercise the ownership
        // fence, not just a compliant network transport's cancellation.
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                responses.push({ controller, signal: options?.signal, body: JSON.parse(String(options?.body)) });
            },
        });
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
    });
});

it.each([
    { variant: 'sidebar' as const, mobile: false },
    { variant: 'default' as const, mobile: true },
])('fences late old-scope chunks from the $variant transcript and storage', async (props) => {
    const firstScope = createNotesChatScope({ version: 1, itemType: 'all', filterQuery: 'ceramics' });
    const secondScope = createNotesChatScope({ version: 1, itemType: 'reflection', filterQuery: 'language' });
    const { rerender } = render(<NotesAskPanel {...props} currentScope={firstScope} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'What patterns show up across these notes?' }));
    await waitFor(() => expect(responses).toHaveLength(1));
    expect(responses[0].body.scope).toEqual(firstScope.scope);
    await act(async () => { responses[0].controller.enqueue(encoder.encode('data: '+JSON.stringify({type:'text-start',id:'answer'})+'\n\ndata: '+JSON.stringify({type:'text-delta',id:'answer',delta:'Earlier scope content'})+'\n\n')); });
    await screen.findByText('Earlier scope content');

    rerender(<NotesAskPanel {...props} currentScope={secondScope} onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /use current filters/i })[0]);
    expect(responses[0].signal?.aborted).toBe(true);
    expect(screen.queryByText('Earlier scope content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'What patterns show up across these notes?' }));
    await waitFor(() => expect(responses).toHaveLength(2));
    expect(responses[1].body.scope).toEqual(secondScope.scope);
    await act(async () => {
        responses[1].controller.enqueue(encoder.encode('data: '+JSON.stringify({type:'text-start',id:'answer'})+'\n\ndata: '+JSON.stringify({type:'text-delta',id:'answer',delta:'Only the current reflection scope.'})+'\n\n'));
        responses[1].controller.close();
    });
    await screen.findByText('Only the current reflection scope.');
    await act(async () => {
        responses[0].controller.enqueue(encoder.encode('data: '+JSON.stringify({type:'text-delta',id:'answer',delta:' Late response from the old scope.'})+'\n\n'));
        responses[0].controller.close();
    });

    expect(screen.queryByText(/Earlier scope content|Late response from the old scope/)).not.toBeInTheDocument();
    expect(screen.getByText('Only the current reflection scope.')).toBeInTheDocument();
    await waitFor(() => {
        const stored = readNotesChatSession(ownerKey, secondScope.signature);
        expect(stored?.activeScope.signature).toBe(secondScope.signature);
        expect(JSON.stringify(stored?.messages)).toContain('Only the current reflection scope.');
        expect(JSON.stringify(stored?.messages)).not.toMatch(/Earlier scope content|Late response from the old scope/);
    });
});
