import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import { NotesAskPanel } from '@/components/notes/NotesAskPanel';
import { createNotesChatScope, serializeNotesChatScope } from '@/lib/notes-chat-scope';
import { clearAllNotesChatSessions, clearNotesChatOwner } from '@/lib/notes-chat-session';
import { newNotesChatContext, readNotesChatContext, writeNotesChatContext } from '@/lib/notes-chat-context';

const { streamFetch, identity, query } = vi.hoisted(() => ({ streamFetch: vi.fn<typeof fetch>(),
    identity: { owner: 'draft-account-a:session-1', valid: true }, query: { value: 'ask=1' } }));
vi.mock('@/hooks/useVerifiedChatSession', () => ({
    useVerifiedChatSession: () => ({ ownerKey: identity.owner || null, isCurrent: () => identity.valid, resolved: true }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/notes', useSearchParams: () => new URLSearchParams(query.value) }));
vi.mock('next/link', () => ({ default: ({ onNavigate, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: () => void }) =>
    <a {...props} onClick={(event) => { event.preventDefault(); onNavigate?.(); }}>{children}</a> }));
vi.mock('ai', async (original) => {
    const actual = await original<typeof import('ai')>();
    return { ...actual, DefaultChatTransport: class extends actual.DefaultChatTransport<UIMessage> {
        constructor(options: ConstructorParameters<typeof actual.DefaultChatTransport<UIMessage>>[0]) { super({ ...options, fetch: streamFetch }); }
    } };
});
const scope = createNotesChatScope({ version: 1, itemType: 'all', filterQuery: 'focus' });
const multiline = '  Synthetic exact question 🌱\nSecond line\n\n  Keep spaces and **Markdown**.  ';
let controller: ReadableStreamDefaultController<Uint8Array>;
const encoder = new TextEncoder();
const composer = () => screen.getByRole('textbox');
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send notes question' }));
function contextFromLink() {
    const href = screen.getByRole('link', { name: 'Open Ask These Notes in full screen' }).getAttribute('href')!;
    return new URL(href, 'https://netflux.blog').searchParams.get('notesContext')!;
}
async function finish(reason = 'stop') {
    await act(async () => {
        for (const chunk of [{ type: 'start', messageId: 'answer' }, { type: 'text-start', id: 'text' },
            { type: 'text-delta', id: 'text', delta: 'Synthetic successful response.' },
            { type: 'text-end', id: 'text' }, { type: 'finish', finishReason: reason }]) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
    });
}
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }));
beforeEach(() => {
    clearAllNotesChatSessions(); window.sessionStorage.clear(); vi.restoreAllMocks();
    identity.owner = 'draft-account-a:session-1'; identity.valid = true; query.value = 'ask=1';
    window.history.replaceState(null, '', '/notes?ask=1');
    streamFetch.mockReset();
    streamFetch.mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } }),
        { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } }));
});

it('carries exact provisional text into Full Ask, restores the latest edited text on return, and reopens/reloads', () => {
    let view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } });
    const context = contextFromLink();
    fireEvent.click(screen.getByRole('link', { name: 'Open Ask These Notes in full screen' }));
    expect(new URL(window.location.href).searchParams.get('notesContext')).toBe(context);
    view.unmount(); query.value = `notesContext=${context}`;
    view = render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    expect(composer()).toHaveValue(multiline);
    const edited = `${multiline}\nNew text from Full Ask.`;
    fireEvent.change(composer(), { target: { value: edited } });
    view.unmount();
    view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    expect(composer()).toHaveValue(edited);
    view.unmount();
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    expect(composer()).toHaveValue(edited);
    expect(streamFetch).not.toHaveBeenCalled();
});
it('uses the explicit return context after Library navigation instead of another same-scope chat', () => {
    let view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); const first = contextFromLink();
    view.unmount();
    view = render(<NotesAskPanel variant="sidebar" contextId="different-context-0123456789" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: 'Unrelated context question' } });
    view.unmount();
    query.value = new URLSearchParams({ scope: 'notes', returnTo: `/notes?notesContext=${first}` }).toString();
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    expect(composer()).toHaveValue(multiline);
});
it('retains an exact draft after an HTTP failure, including after reopening', async () => {
    streamFetch.mockResolvedValue(new Response('Synthetic rejection', { status: 503 }));
    const view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Notes response status' })).toHaveTextContent('Request failed'));
    expect(composer()).toHaveValue(multiline);
    view.unmount(); render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    expect(composer()).toHaveValue(multiline);
});
it('retains newer typing when a pending submission fails', async () => {
    let rejectRequest!: (response: Response) => void;
    streamFetch.mockImplementation(() => new Promise<Response>((resolve) => { rejectRequest = resolve; }));
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    const newer = `${multiline}\nNewer question after sending`;
    fireEvent.change(composer(), { target: { value: newer } });
    await act(async () => rejectRequest(new Response('Synthetic rejection', { status: 503 })));
    await waitFor(() => expect(screen.getByRole('status', { name: 'Notes response status' })).toHaveTextContent('Request failed'));
    expect(composer()).toHaveValue(newer);
});
it.each(['stop', 'length'])('only a successful complete finish clears the submitted revision: %s', async (reason) => {
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    expect(composer()).toHaveValue(multiline);
    await finish(reason);
    await waitFor(() => expect(composer()).toHaveValue(reason === 'stop' ? '' : multiline));
});
it('never clears newer multiline typing when the earlier request succeeds', async () => {
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    expect(composer()).toBeEnabled();
    const newer = 'Next question\nwith different wording 🌱';
    fireEvent.change(composer(), { target: { value: newer } });
    await finish();
    await waitFor(() => expect(screen.getByText('Synthetic successful response.')).toBeInTheDocument());
    expect(composer()).toHaveValue(newer);
});
it('gives New chat an empty independent draft, confirms discard, and does not resurrect the earlier question', async () => {
    const view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } });
    const context = contextFromLink();
    send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    await finish();
    fireEvent.change(composer(), { target: { value: multiline } });
    const before = readNotesChatContext(identity.owner, context)!;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: /new chat/i }));
    expect(composer()).toHaveValue(multiline);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /new chat/i }));
    expect(composer()).toHaveValue('');
    expect(readNotesChatContext(identity.owner, context)!.chatId).not.toBe(before.chatId);
    view.unmount(); render(<NotesAskPanel variant="page" currentScope={scope} contextId={context} onClose={vi.fn()} />);
    expect(composer()).toHaveValue('');
});
it('keeps unrelated contexts, accounts and auth sessions isolated, and clears recovery on sign-out', () => {
    let view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); const context = contextFromLink();
    view.unmount();
    view = render(<NotesAskPanel variant="page" currentScope={scope} contextId="unknown-context-0123456789" onClose={vi.fn()} />);
    expect(composer()).toHaveValue(''); view.unmount();
    for (const owner of ['draft-account-b:session-1', 'draft-account-a:session-2']) {
        identity.owner = owner;
        view = render(<NotesAskPanel variant="page" currentScope={scope} contextId={context} onClose={vi.fn()} />);
        expect(composer()).toHaveValue(''); view.unmount();
    }
    clearNotesChatOwner('draft-account-a:session-1');
    identity.owner = 'draft-account-a:session-1';
    render(<NotesAskPanel variant="page" currentScope={scope} contextId={context} onClose={vi.fn()} />);
    expect(composer()).toHaveValue('');
    expect(readNotesChatContext(identity.owner, context)?.draft.text).toBe('');
});
it('rejects another owner even if stored JSON is copied under their key', () => {
    const view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); const context = contextFromLink();
    const raw = window.sessionStorage.getItem(`netflux_notes_chat_context:v1:${encodeURIComponent(identity.owner)}:${context}`)!;
    window.sessionStorage.setItem(`netflux_notes_chat_context:v1:other-owner:${context}`, raw);
    expect(readNotesChatContext('other-owner', context)).toBeNull(); view.unmount();
});
it('preserves text through temporary same-account verification and flushes it only when verified', () => {
    const view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    const context = contextFromLink(); identity.valid = false;
    fireEvent.change(composer(), { target: { value: multiline } });
    expect(composer()).toHaveValue(multiline);
    expect(readNotesChatContext(identity.owner, context)!.draft.text).toBe('');
    identity.valid = true;
    view.rerender(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    expect(readNotesChatContext(identity.owner, context)!.draft.text).toBe(multiline);
});
it('retains the newest text in memory if storage writes fail and protects unloading', () => {
    const view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    const context = contextFromLink();
    const setItem = vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    fireEvent.change(composer(), { target: { value: multiline } });
    expect(screen.getByText(/Reload recovery is unavailable/)).toBeInTheDocument();
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(readNotesChatContext(identity.owner, context)!.draft.text).toBe(multiline);
    view.unmount();
    render(<NotesAskPanel variant="page" contextId={context} currentScope={scope} onClose={vi.fn()} />);
    expect(composer()).toHaveValue(multiline);
    setItem.mockRestore();
});

it('keeps the desktop filter warning through expansion/reload, sends with the earlier scope until explicitly switching, and preserves the draft', async () => {
    const changed = createNotesChatScope({ version: 1, itemType: 'note', color: 'blue', filterQuery: 'beta' }, 'notes only • blue highlights • search: "beta"');
    let view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: 'Start a scoped conversation' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce()); await finish();
    fireEvent.change(composer(), { target: { value: multiline } });
    view.rerender(<NotesAskPanel variant="sidebar" currentScope={changed} returnTo="/notes?q=beta&type=note&color=blue&ask=1" onClose={vi.fn()} />);
    expect(screen.getAllByText(/This chat still searches using its earlier filters/).length).toBeGreaterThan(0);
    const href = new URL(screen.getByRole('link', { name: 'Open Ask These Notes in full screen' }).getAttribute('href')!, window.location.origin);
    expect(href.searchParams.get('notesScope')).toBe(serializeNotesChatScope(scope));
    expect(href.searchParams.get('notesFilters')).toBe(serializeNotesChatScope(changed));
    view.unmount(); query.value = href.search.slice(1);
    view = render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    expect(screen.getAllByText(/This chat still searches using its earlier filters/).length).toBeGreaterThan(0);
    expect(composer()).toHaveValue(multiline);
    view.unmount(); view = render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    expect(screen.getAllByText(/This chat still searches using its earlier filters/).length).toBeGreaterThan(0);
    expect(composer()).toHaveValue(multiline);
    send(); await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(streamFetch.mock.calls.at(-1)![1]?.body)).scope).toEqual(scope.scope);
    const newer = `${multiline}\nNewest draft after expansion.`;
    fireEvent.change(composer(), { target: { value: newer } }); await finish();
    fireEvent.click(screen.getAllByRole('button', { name: 'Use current filters' })[0]);
    expect(screen.queryByText(/This chat still searches using its earlier filters/)).not.toBeInTheDocument();
    expect(composer()).toHaveValue(newer);
    view.unmount(); view = render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    expect(screen.queryByText(/This chat still searches using its earlier filters/)).not.toBeInTheDocument();
    expect(composer()).toHaveValue(newer);
    send(); await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(3));
    expect(JSON.parse(String(streamFetch.mock.calls.at(-1)![1]?.body)).scope).toEqual(changed.scope);
    await finish(); view.unmount();
});

it.each([
    { label: 'matching filters', snapshot: serializeNotesChatScope(scope) },
    { label: 'matching filters with another label', snapshot: serializeNotesChatScope({ ...scope, summary: 'Different label' }) },
    { label: 'malformed comparison metadata', snapshot: '{' },
    { label: 'missing comparison metadata', snapshot: '' },
])('does not show a false page warning for $label', ({ snapshot }) => {
    const context = newNotesChatContext(scope);
    context.messages = [{ id: 'q', role: 'user', parts: [{ type: 'text', text: 'Earlier question' }] }];
    context.draft = { text: multiline, revision: 1 };
    writeNotesChatContext(identity.owner, context);
    query.value = new URLSearchParams({ notesContext: context.contextId, ...(snapshot ? { notesFilters: snapshot } : {}) }).toString();
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    expect(screen.queryByText(/This chat still searches using its earlier filters/)).not.toBeInTheDocument();
    expect(composer()).toHaveValue(multiline);
});
it('keeps a fresh chat following Notes filters without generating a mismatch snapshot', () => {
    const nextScope = createNotesChatScope({ version: 1, itemType: 'all', filterQuery: 'beta' });
    const view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } });
    view.rerender(<NotesAskPanel variant="sidebar" currentScope={nextScope} onClose={vi.fn()} />);
    const href = new URL(screen.getByRole('link', { name: 'Open Ask These Notes in full screen' }).getAttribute('href')!, window.location.origin);
    expect(href.searchParams.get('notesScope')).toBe(serializeNotesChatScope(nextScope));
    expect(href.searchParams.has('notesFilters')).toBe(false);
    expect(screen.queryByText(/This chat still searches using its earlier filters/)).not.toBeInTheDocument();
    expect(composer()).toHaveValue(multiline);
});
it('does not broaden the active scope or discard a draft when the comparison describes invalid Notes filters', () => {
    const invalid = createNotesChatScope({ version: 1, itemType: 'all', filterQuery: 'x'.repeat(161) });
    query.value = new URLSearchParams({ notesFilters: serializeNotesChatScope(invalid) }).toString();
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } });
    expect(screen.getAllByText(/This chat still searches using its earlier filters/).length).toBeGreaterThan(0);
    for (const button of screen.getAllByRole('button', { name: 'Use current filters' })) expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send notes question' })).toBeEnabled();
    expect(composer()).toHaveValue(multiline);
});

it('does not broaden a recovered draft scope when comparison metadata is malformed', async () => {
    const context = newNotesChatContext(scope);
    context.draft = { text: multiline, revision: 1 };
    writeNotesChatContext(identity.owner, context);
    query.value = new URLSearchParams({ notesContext: context.contextId, notesFilters: '{' }).toString();
    const broad = createNotesChatScope({ version: 1, itemType: 'all' });
    render(<NotesAskPanel variant="page" currentScope={broad} onClose={vi.fn()} />);
    expect(composer()).toHaveValue(multiline);
    send(); await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    expect(JSON.parse(String(streamFetch.mock.calls[0][1]?.body)).scope).toEqual(scope.scope);
    await finish();
});
