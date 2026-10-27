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
async function finish(reason = 'stop', messageId = 'answer') {
    await act(async () => {
        for (const chunk of [{ type: 'start', messageId }, { type: 'text-start', id: 'text' },
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

it('reuses the failed user turn when Send retries the exact unchanged draft', async () => {
    streamFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await screen.findByRole('button', { name: 'Try again' });
    expect(composer()).toHaveValue(multiline);
    send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const bodies = streamFetch.mock.calls.map(([, options]) => JSON.parse(options!.body as string));
    expect(bodies.map(body => body.messages.filter((message: UIMessage) => message.role === 'user').length)).toEqual([1, 1]);
    expect(bodies[1].trigger).toBe('regenerate-message');
    expect(bodies[1].messages[0].id).toBe(bodies[0].messages[0].id);
    await finish();
    await waitFor(() => expect(composer()).toHaveValue(''));
});

it('keeps newer typing when a retry of the earlier question finishes', async () => {
    streamFetch.mockRejectedValueOnce(new TypeError('Network interrupted'));
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const newer = `${multiline}\nNewer unsent question.`;
    fireEvent.change(composer(), { target: { value: newer } });
    await finish();
    expect(composer()).toHaveValue(newer);
});

it('retains exact text and the same turn when retry also fails', async () => {
    streamFetch.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(new TypeError('Failed again'));
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await screen.findByRole('button', { name: 'Try again' }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'Try again' });
    expect(composer()).toHaveValue(multiline);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(3));
    const bodies = streamFetch.mock.calls.map(([, options]) => JSON.parse(options!.body as string));
    expect(bodies.map(body => body.messages.length)).toEqual([1, 1, 1]);
    expect(new Set(bodies.map(body => body.messages[0].id)).size).toBe(1);
    await finish();
    await waitFor(() => expect(composer()).toHaveValue(''));
});

it('locks rapid mixed Send/Try again clicks before status is rendered', async () => {
    streamFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    const retryButton = await screen.findByRole('button', { name: 'Try again' });
    const sendButton = screen.getByRole('button', { name: 'Send notes question' });
    act(() => { fireEvent.click(sendButton); fireEvent.click(retryButton); fireEvent.click(sendButton); });
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(streamFetch.mock.calls[1][1]!.body as string).messages).toHaveLength(1);
    await finish();
    expect(streamFetch).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(composer()).toHaveValue(''));
});

it.each([`${multiline} `, `${multiline}\nA different question.`])('treats edited text as a new turn, without global text deduplication: %s', async (edited) => {
    streamFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await screen.findByRole('button', { name: 'Try again' });
    fireEvent.change(composer(), { target: { value: edited } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(streamFetch.mock.calls[1][1]!.body as string);
    expect(body.trigger).toBe('submit-message');
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].id).not.toBe(body.messages[1].id);
    await finish();
});

it('permits intentional repeated wording after successful completion', async () => {
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce()); await finish();
    await waitFor(() => expect(composer()).toHaveValue(''));
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(streamFetch.mock.calls[1][1]!.body as string);
    expect(body.trigger).toBe('submit-message');
    expect(body.messages.filter((message: UIMessage) => message.role === 'user')).toHaveLength(2);
    await finish('stop', 'answer-two');
});

it('restores failed-turn matching when the same chat reopens in Full Ask', async () => {
    streamFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    let view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    const context = contextFromLink();
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await screen.findByRole('button', { name: 'Try again' });
    await waitFor(() => expect(readNotesChatContext(identity.owner, context)?.failedTurn?.text).toBe(multiline));
    const first = JSON.parse(streamFetch.mock.calls[0][1]!.body as string);
    view.unmount(); query.value = `notesContext=${context}`;
    view = render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    expect(composer()).toHaveValue(multiline); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(streamFetch.mock.calls[1][1]!.body as string);
    expect(body.trigger).toBe('regenerate-message');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe(first.messages[0].id);
    await finish();
    await waitFor(() => expect(composer()).toHaveValue(''));
});

it('retains the failed chat scope until the explicit scope switch creates a new chat', async () => {
    streamFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const other = createNotesChatScope({ version: 1, itemType: 'all', filterQuery: 'weekly' });
    const view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await screen.findByRole('button', { name: 'Try again' });
    view.rerender(<NotesAskPanel variant="sidebar" currentScope={other} onClose={vi.fn()} />);
    send(); await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const retained = JSON.parse(streamFetch.mock.calls[1][1]!.body as string);
    expect(retained.scope.filterQuery).toBe('focus');
    expect(retained.messages).toHaveLength(1);
    await finish(); await waitFor(() => expect(composer()).toHaveValue(''));
    fireEvent.change(composer(), { target: { value: multiline } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Use current filters' })[0]); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(3));
    const switched = JSON.parse(streamFetch.mock.calls[2][1]!.body as string);
    expect(switched.scope.filterQuery).toBe('weekly');
    expect(switched.trigger).toBe('submit-message');
    expect(switched.messages).toHaveLength(1);
    expect(switched.messages[0].id).not.toBe(retained.messages[0].id);
    await finish('stop', 'switched-answer');
});

it.each(['context', 'account'])('does not reuse another %s failed turn', async (boundary) => {
    streamFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    let view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    const context = contextFromLink();
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await screen.findByRole('button', { name: 'Try again' });
    const first = JSON.parse(streamFetch.mock.calls[0][1]!.body as string);
    view.unmount();
    if (boundary === 'account') identity.owner = 'different-account:session-2';
    query.value = `notesContext=${boundary === 'context' ? 'unrelated-context-0123456789' : context}`;
    view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    expect(composer()).toHaveValue('');
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const body = JSON.parse(streamFetch.mock.calls[1][1]!.body as string);
    expect(body.trigger).toBe('submit-message');
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).not.toBe(first.messages[0].id);
    await finish();
});

it.each(['chat', 'scope', 'message', 'text', 'completed'])('ignores an invalid %s retry hint without losing the stored draft', (mismatch) => {
    const context = newNotesChatContext(scope);
    context.draft = { text: multiline, revision: 2 };
    context.messages = [{ id: 'failed-user', role: 'user', parts: [{ type: 'text', text: multiline.trim() }] }];
    context.failedTurn = { chatId: context.chatId, scopeSignature: scope.signature, messageId: 'failed-user', text: multiline };
    if (mismatch === 'chat') context.failedTurn.chatId = 'other-chat-0123456789';
    if (mismatch === 'scope') context.failedTurn.scopeSignature = 'unrelated-scope';
    if (mismatch === 'message') context.failedTurn.messageId = 'different-user';
    if (mismatch === 'text') context.failedTurn.text = 'Different exact text';
    if (mismatch === 'completed') context.messages.push({ id: 'completed-answer', role: 'assistant', parts: [{ type: 'text', text: 'Complete.' }] });
    writeNotesChatContext(identity.owner, context);
    const restored = readNotesChatContext(identity.owner, context.contextId);
    expect(restored?.draft.text).toBe(multiline);
    expect(restored?.failedTurn).toBeUndefined();
});

it('releases the request lock after success so an edited question can be sent', async () => {
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce()); await finish();
    await waitFor(() => expect(composer()).toHaveValue(''));
    const edited = `${multiline}\nA subsequent question.`;
    fireEvent.change(composer(), { target: { value: edited } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(streamFetch.mock.calls[1][1]?.body)).messages.at(-1).parts[0].text).toBe(edited.trim());
    await finish('stop', 'subsequent-answer');
});

it('releases the request lock after repeated failure so an edited question can be sent', async () => {
    streamFetch.mockRejectedValueOnce(new TypeError('First failure')).mockRejectedValueOnce(new TypeError('Retry failure'));
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await screen.findByRole('button', { name: 'Try again' }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'Try again' });
    const edited = `${multiline}\nEdited after two failures.`;
    fireEvent.change(composer(), { target: { value: edited } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(3));
    const body = JSON.parse(String(streamFetch.mock.calls[2][1]?.body));
    expect(body.trigger).toBe('submit-message');
    expect(body.messages.filter((message: UIMessage) => message.role === 'user')).toHaveLength(2);
    expect(body.messages.at(-1).parts[0].text).toBe(edited.trim());
    await finish();
});

it('releases the request lock after transport cancellation and retains the exact question', async () => {
    streamFetch.mockRejectedValueOnce(new DOMException('Synthetic transport cancellation', 'AbortError'));
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send notes question' })).toBeEnabled());
    expect(composer()).toHaveValue(multiline);
    send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const bodies = streamFetch.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
    expect(bodies.map(body => body.messages.length)).toEqual([1, 1]);
    expect(bodies[1].messages[0].id).toBe(bodies[0].messages[0].id);
    await finish();
});

it('accepts Send after starting a new chat from a failed question', async () => {
    streamFetch.mockRejectedValueOnce(new TypeError('Failed old chat'));
    render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await screen.findByRole('button', { name: 'Try again' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /new chat/i }));
    expect(composer()).toHaveValue('');
    const edited = `${multiline}\nQuestion in the new chat.`;
    fireEvent.change(composer(), { target: { value: edited } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const first = JSON.parse(String(streamFetch.mock.calls[0][1]?.body));
    const second = JSON.parse(String(streamFetch.mock.calls[1][1]?.body));
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0].id).not.toBe(first.messages[0].id);
    await finish();
    await waitFor(() => expect(composer()).toHaveValue(''));
    fireEvent.change(composer(), { target: { value: 'After new-chat success.' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(3));
    await finish('stop', 'after-reset-answer');
});

it('accepts Send after scope cancellation even when old transport work finishes later', async () => {
    const view = render(<NotesAskPanel variant="sidebar" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    const oldSignal = streamFetch.mock.calls[0][1]?.signal;
    const oldController = controller;
    const other = createNotesChatScope({ version: 1, itemType: 'all', filterQuery: 'changed-scope' });
    view.rerender(<NotesAskPanel variant="sidebar" currentScope={other} onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Use current filters' })[0]);
    expect(oldSignal?.aborted).toBe(true);
    expect(composer()).toHaveValue(multiline);
    send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(streamFetch.mock.calls[1][1]?.body)).scope).toEqual(other.scope);
    await act(async () => oldController.close());
    expect(composer()).toHaveValue(multiline);
    await finish();
    await waitFor(() => expect(composer()).toHaveValue(''));
    fireEvent.change(composer(), { target: { value: 'After cancelled scope.' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(3));
    await finish('stop', 'after-scope-answer');
});

it('retains the draft through an enabled Send during session re-verification and accepts Send once verified', async () => {
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    fireEvent.change(composer(), { target: { value: multiline } });
    identity.valid = false;
    expect(screen.getByRole('button', { name: 'Send notes question' })).toBeEnabled();
    send();
    expect(streamFetch).not.toHaveBeenCalled();
    expect(composer()).toHaveValue(multiline);
    identity.valid = true; send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    await finish();
});
