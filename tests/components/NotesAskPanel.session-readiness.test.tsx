import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import { NotesAskPanel } from '@/components/notes/NotesAskPanel';
import { createNotesChatScope } from '@/lib/notes-chat-scope';

const auth = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn(), getClaims: vi.fn(), getUser: vi.fn(),
    callback: null as null | ((event: string, session: unknown) => void), fetch: vi.fn<typeof fetch>() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: auth.rpc, auth: {
    getSession: auth.getSession, getClaims: auth.getClaims, getUser: auth.getUser,
    onAuthStateChange: (callback: typeof auth.callback) => { auth.callback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
} }) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/notes', useSearchParams: () => new URLSearchParams('notesContext=readiness-test-context-12345678') }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock('ai', async original => { const actual = await original<typeof import('ai')>(); return { ...actual,
    DefaultChatTransport: class extends actual.DefaultChatTransport<UIMessage> {
        constructor(options: ConstructorParameters<typeof actual.DefaultChatTransport<UIMessage>>[0]) { super({ ...options, fetch: auth.fetch }); }
    },
}; });
const scope = createNotesChatScope({ version: 1, itemType: 'all' });
const question = '  Synthetic readiness question 🌱\nSecond line\n\nKeep exact spacing.  ';
const session = (user = 'a') => ({ user: { id: user }, access_token: `token-${user}` });
const claims = (user = 'a', id = 'session-one') => ({ data: { claims: { sub: user, session_id: id } }, error: null });
const composer = () => screen.getByRole('textbox');
const send = () => screen.getByRole('button', { name: 'Send notes question' });
const emit = async (event: string, value: unknown) => { await act(async () => { auth.callback?.(event, value); }); };
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() }));
beforeEach(() => {
    vi.clearAllMocks(); window.sessionStorage.clear();
    auth.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    auth.getClaims.mockResolvedValue(claims()); auth.getUser.mockResolvedValue({ data: { user: { id: 'a' } }, error: null });
    auth.rpc.mockResolvedValue({ data: {}, error: null }); auth.fetch.mockImplementation(async () => new Response('Synthetic failure', { status: 503 }));
});

it.each(['page', 'sidebar'] as const)('blocks every submission path during a %s recheck without losing newer typing', async variant => {
    render(<NotesAskPanel variant={variant} currentScope={scope} onClose={vi.fn()} />);
    await screen.findByRole('textbox'); fireEvent.change(composer(), { target: { value: question } });
    let finish!: (value: ReturnType<typeof claims>) => void;
    auth.getClaims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await emit('SIGNED_IN', session());
    expect(send()).toBeDisabled();
    expect(screen.getByText('Checking your session…')).toBeVisible();
    for (const prompt of screen.getAllByRole('button', { name: /patterns show up|Summarize the key ideas|same theme|tensions or contradictions/ })) expect(prompt).toBeDisabled();
    const newer = `${question}\nNewer typing while checking.`;
    fireEvent.change(composer(), { target: { value: newer } });
    fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: false });
    fireEvent.submit(composer().closest('form')!);
    expect(auth.fetch).not.toHaveBeenCalled(); expect(composer()).toHaveValue(newer);
    await act(async () => { finish(claims()); });
    expect(screen.queryByText('Checking your session…')).not.toBeInTheDocument(); expect(send()).toBeEnabled();
    expect(auth.fetch).not.toHaveBeenCalled(); fireEvent.click(send());
    await waitFor(() => expect(auth.fetch).toHaveBeenCalledOnce());
    await screen.findByRole('button', { name: 'Try again' }); expect(composer()).toHaveValue(newer);
    auth.getClaims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await emit('TOKEN_REFRESHED', session());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(auth.fetch).toHaveBeenCalledOnce();
    await act(async () => { finish(claims()); });
});

it.each(['page', 'sidebar'] as const)('preserves newer %s drafts after service failure without sending on recovery', async variant => {
    render(<NotesAskPanel variant={variant} currentScope={scope} onClose={vi.fn()} />);
    await screen.findByRole('textbox'); fireEvent.change(composer(), { target: { value: question } });
    auth.rpc.mockResolvedValueOnce({ data: null, error: { code: '503' } }); await emit('TOKEN_REFRESHED', session());
    expect(screen.getByText('Your session could not be checked. Check your connection and try again.')).toBeVisible();
    expect(send()).toBeDisabled();
    const newer = `${question}\nTyping after the failed check.`;
    fireEvent.change(composer(), { target: { value: newer } });
    fireEvent.keyDown(composer(), { key: 'Enter' }); expect(auth.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(send()).toBeEnabled()); expect(composer()).toHaveValue(newer);
    expect(auth.fetch).not.toHaveBeenCalled();
});

it.each(['account', 'session'] as const)('never submits or restores the previous draft when recovery changes %s', async boundary => {
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    await screen.findByRole('textbox'); fireEvent.change(composer(), { target: { value: question } });
    auth.rpc.mockResolvedValueOnce({ data: null, error: { code: '503' } }); await emit('SIGNED_IN', session());
    const user = boundary === 'account' ? 'b' : 'a';
    auth.getSession.mockResolvedValueOnce({ data: { session: session(user) }, error: null });
    auth.getClaims.mockResolvedValueOnce(claims(user, 'replacement-session'));
    auth.getUser.mockResolvedValueOnce({ data: { user: { id: user } }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(composer()).toHaveValue(''));
    expect(send()).toBeDisabled(); expect(auth.fetch).not.toHaveBeenCalled();
    const ownQuestion = 'Different identity, different draft.';
    fireEvent.change(composer(), { target: { value: ownQuestion } }); fireEvent.click(send());
    await waitFor(() => expect(auth.fetch).toHaveBeenCalledOnce());
    const payload = JSON.parse(String(auth.fetch.mock.calls[0][1]?.body));
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].parts).toEqual([{ type: 'text', text: ownQuestion }]);
    expect(JSON.stringify(payload)).not.toContain(question.trim());
    await screen.findByRole('button', { name: 'Try again' });
});

it('offers slow-check recovery after ten seconds without declaring failure or automatically sending', async () => {
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    await screen.findByRole('textbox'); fireEvent.change(composer(), { target: { value: question } });
    auth.getClaims.mockImplementationOnce(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
        await emit('SIGNED_IN', session());
        await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
        expect(screen.getByText('Your session check is taking longer than expected.')).toBeVisible();
        expect(screen.queryByText('Checking your session…')).not.toBeInTheDocument();
        expect(send()).toBeDisabled(); expect(composer()).toHaveValue(question);
        fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
        await act(async () => {});
        expect(send()).toBeEnabled(); expect(composer()).toHaveValue(question); expect(auth.fetch).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
});


it('offers explicit recovery after initial session lookup fails without submitting any question', async () => {
    auth.getSession.mockRejectedValueOnce(new TypeError('Synthetic connection failure'));
    render(<NotesAskPanel variant="page" currentScope={scope} onClose={vi.fn()} />);
    await screen.findByText('Your session could not be checked. Check your connection and try again.');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    await screen.findByRole('textbox'); expect(composer()).toHaveValue(''); expect(auth.fetch).not.toHaveBeenCalled();
});
