import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { AskClientPage } from '@/app/(public)/ask/client-page';
import { clearLibraryChatSessions, readLibraryChatSession } from '@/lib/library-chat-session';

const { identity, streamFetch } = vi.hoisted(() => ({
    identity: { owner: JSON.stringify(['account-a', 'session-one']), valid: true }, streamFetch: vi.fn<typeof fetch>(),
}));
vi.mock('@/hooks/useVerifiedChatSession', () => ({ useVerifiedChatSession: () => ({
    ownerKey: identity.owner || null, isCurrent: (owner: string) => identity.valid && owner === identity.owner, resolved: true,
}) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/components/notes/NotesAskPanel', () => ({ NotesAskPanel: () => <div>Separate Notes chat</div> }));
const exact = '  User-written draft 🌱\nSecond line\n\n  Preserve spaces and **Markdown**.  ';
const composer = () => screen.getByRole('textbox', { name: 'Ask a question about your library' });
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
let controller: ReadableStreamDefaultController<Uint8Array>;
const encoder = new TextEncoder();
function responseStream() {
    return new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } }),
        { headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
}
async function finish(reason = 'stop', questions?: unknown) {
    await act(async () => {
        for (const chunk of [{ type: 'start', messageId: 'answer' }, { type: 'text-start', id: 'text' },
            { type: 'text-delta', id: 'text', delta: 'Synthetic completed Library answer.' },
            { type: 'text-end', id: 'text' },
            ...(questions !== undefined ? [{ type: 'data-library-followups', id: 'library-followups', data: { status: 'ready', questions } }] : []),
            { type: 'finish', finishReason: reason }]) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close();
    });
}
beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});

it('recovers AI questions with the answer and sends the selected full question without changing newer typing', async () => {
    let view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'What did I save about habits?' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    fireEvent.change(composer(), { target: { value: exact } });
    const questions = ['What else have I saved about making habits easier to start?', 'What have I saved about arranging my environment?'];
    await finish('stop', questions);
    await screen.findByRole('button', { name: questions[0] });
    expect(screen.queryByRole('button', { name: 'Summarize the overlap' })).not.toBeInTheDocument();
    expect(composer()).toHaveValue(exact);
    view.unmount(); view = render(<AskClientPage />);
    expect(streamFetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: questions[1] })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: questions[0] }));
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(String(streamFetch.mock.calls[1][1]?.body));
    expect(payload.messages.at(-1).parts).toEqual([{ type: 'text', text: questions[0] }]);
    expect(composer()).toHaveValue(exact); await finish('stop', []); view.unmount();
});

it('keeps the answer visible while suggestions are pending, then shows only completed questions', async () => {
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Question about routines' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    await act(async () => {
        for (const chunk of [{ type: 'start', messageId: 'answer' },
            { type: 'data-library-followups', id: 'library-followups', data: { status: 'pending', questions: [] } },
            { type: 'text-start', id: 'text' }, { type: 'text-delta', id: 'text', delta: 'The complete answer is readable now.' }]) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
    });
    expect(await screen.findByText('The complete answer is readable now.')).toBeInTheDocument();
    expect(screen.getByText('Preparing suggestions…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Summarize the overlap' })).not.toBeInTheDocument();
    await act(async () => {
        for (const chunk of [{ type: 'text-end', id: 'text' },
            { type: 'data-library-followups', id: 'library-followups', data: { status: 'ready', questions: ['What else have I saved about routines?'] } },
            { type: 'finish', finishReason: 'stop' }]) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close();
    });
    expect(await screen.findByRole('button', { name: 'What else have I saved about routines?' })).toBeInTheDocument();
    expect(screen.queryByText('Preparing suggestions…')).not.toBeInTheDocument();
    expect(streamFetch).toHaveBeenCalledOnce(); view.unmount();
});

it.each([[], 42])('retains the completed answer with no suggestions or automatic retry when questions are %j', async questions => {
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Question about routines' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce()); await finish('stop', questions);
    expect(await screen.findByText('Synthetic completed Library answer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Summarize the overlap' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(streamFetch).toHaveBeenCalledOnce(); view.unmount(); render(<AskClientPage />);
    expect(screen.getByText('Synthetic completed Library answer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Summarize the overlap' })).not.toBeInTheDocument();
    expect(streamFetch).toHaveBeenCalledOnce();
});

it('does not expose old-account answer suggestions or drafts after switching owners', async () => {
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Account A question' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    await finish('stop', ['What else did I save about my account-A topic?']);
    await screen.findByRole('button', { name: 'What else did I save about my account-A topic?' });
    fireEvent.change(composer(), { target: { value: exact } });
    identity.owner = JSON.stringify(['account-b', 'session-two']); view.rerender(<AskClientPage />);
    expect(screen.queryByText('Synthetic completed Library answer.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'What else did I save about my account-A topic?' })).not.toBeInTheDocument();
    expect(composer()).toHaveValue(''); expect(streamFetch).toHaveBeenCalledOnce();
});
beforeEach(() => {
    vi.restoreAllMocks(); clearLibraryChatSessions(); window.sessionStorage.clear();
    identity.owner = JSON.stringify(['account-a', 'session-one']); identity.valid = true;
    streamFetch.mockReset(); vi.stubGlobal('fetch', streamFetch);
    streamFetch.mockImplementation(async () => responseStream());
});

it('restores completed messages and exact unsent text without a request; keeps suggestions and mode isolation', async () => {
    let view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Please explain that idea.' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce()); await finish();
    await waitFor(() => expect(readLibraryChatSession(identity.owner)?.messages).toHaveLength(2));
    expect(composer()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Summarize the overlap' })).toBeInTheDocument();
    fireEvent.change(composer(), { target: { value: exact } });
    view.rerender(<AskClientPage scope="notes" />);
    expect(screen.getByText('Separate Notes chat')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(exact)).not.toBeInTheDocument();
    view.rerender(<AskClientPage />); expect(composer()).toHaveValue(exact);
    view.unmount(); view = render(<AskClientPage />);
    expect(screen.getByText('Please explain that idea.')).toBeInTheDocument();
    expect(screen.getByText('Synthetic completed Library answer.')).toBeInTheDocument();
    expect(composer()).toHaveValue(exact); expect(streamFetch).toHaveBeenCalledOnce();
    view.unmount();
});

it('restores a failed turn with Retry separately from the newer draft and retries one existing question', async () => {
    streamFetch.mockResolvedValueOnce(new Response('Synthetic rejection', { status: 503 }));
    let view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Original submitted question' } }); send();
    await screen.findByRole('button', { name: 'Try again' });
    expect(composer()).toHaveValue('');
    fireEvent.change(composer(), { target: { value: exact } });
    const before = readLibraryChatSession(identity.owner)!;
    view.unmount(); view = render(<AskClientPage />);
    expect(screen.getByText('Original submitted question')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(composer()).toHaveValue(exact); expect(streamFetch).toHaveBeenCalledOnce();
    for (const button of screen.getAllByRole('button', { name: 'Export chat with QR code' })) expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    const payload = JSON.parse(String(streamFetch.mock.calls[1][1]?.body));
    expect(payload.messages.filter((message: { role: string }) => message.role === 'user')).toHaveLength(1);
    expect(payload.messages[0].id).toBe(before.messages[0].id);
    await finish();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument());
    expect(composer()).toHaveValue(exact);
    expect(readLibraryChatSession(identity.owner)?.failure).toBeNull(); view.unmount();
});

it('does not put submitted or suggested questions into the textbox or erase an unrelated unsent draft', async () => {
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: exact } });
    fireEvent.click(screen.getByRole('button', { name: 'What have I completed in my library?' }));
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    expect(composer()).toHaveValue(exact); await finish();
    expect(composer()).toHaveValue(exact);
    fireEvent.click(screen.getByRole('button', { name: 'Summarize the overlap' }));
    await waitFor(() => expect(streamFetch).toHaveBeenCalledTimes(2));
    expect(composer()).toHaveValue(exact); await finish(); view.unmount();
});

it('restores a pending submission as interrupted, never automatically resumes it or overwrites newer typing', async () => {
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Pending question' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    fireEvent.change(composer(), { target: { value: exact } }); view.unmount();
    render(<AskClientPage />);
    expect(screen.getByText('Pending question')).toBeInTheDocument();
    expect(screen.getByText('The previous response was interrupted. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(composer()).toHaveValue(exact); expect(streamFetch).toHaveBeenCalledOnce();
});

it('does not restore incomplete answer text or offer completed-answer suggestions', async () => {
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Question with incomplete answer' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce()); await finish('length');
    await screen.findByRole('button', { name: 'Try again' }); view.unmount(); render(<AskClientPage />);
    expect(screen.queryByText('Synthetic completed Library answer.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Summarize the overlap' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument(); expect(composer()).toHaveValue('');
});

it('isolates another account and another sign-in session from the old conversation and draft', () => {
    const view = render(<AskClientPage />); fireEvent.change(composer(), { target: { value: exact } });
    identity.owner = JSON.stringify(['account-b', 'session-two']); view.rerender(<AskClientPage />);
    expect(composer()).toHaveValue('');
    identity.owner = JSON.stringify(['account-a', 'new-session']); view.rerender(<AskClientPage />);
    expect(composer()).toHaveValue(''); expect(streamFetch).not.toHaveBeenCalled();
});

it('keeps SPA recovery in memory when storage fails, discloses the reload limit, and guards unloading', () => {
    const view = render(<AskClientPage />);
    vi.spyOn(Object.getPrototypeOf(window.sessionStorage), 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
    fireEvent.change(composer(), { target: { value: exact } });
    expect(screen.getByText(/Reload recovery is unavailable/)).toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    view.unmount(); render(<AskClientPage />); expect(composer()).toHaveValue(exact);
    clearLibraryChatSessions(); expect(readLibraryChatSession(identity.owner)).toBeNull();
});

it('does not let an abandoned request overwrite a newer draft after navigation, even if transport ignores abort', async () => {
    let deliver!: (response: Response) => void;
    streamFetch.mockImplementationOnce(() => new Promise<Response>(resolve => { deliver = resolve; }));
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Old in-flight question' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce()); view.unmount();
    render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: exact } });
    await act(async () => deliver(new Response('Late old failure', { status: 503 })));
    expect(composer()).toHaveValue(exact);
    expect(readLibraryChatSession(identity.owner)?.draft).toBe(exact);
    expect(screen.getByText('The previous response was interrupted. Please try again.')).toBeInTheDocument();
    expect(streamFetch).toHaveBeenCalledOnce();
});

it.each(['success', 'failure'])('retains exact newer typing made during a pending submission after %s', async (outcome) => {
    let deliver!: (response: Response) => void;
    streamFetch.mockImplementationOnce(() => new Promise<Response>(resolve => { deliver = resolve; }));
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'Earlier submitted question' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce());
    expect(composer()).toHaveValue('');
    fireEvent.change(composer(), { target: { value: exact } });
    await act(async () => deliver(outcome === 'success' ? responseStream() : new Response('Failed request', { status: 503 })));
    if (outcome === 'success') await finish();
    else await screen.findByRole('button', { name: 'Try again' });
    expect(composer()).toHaveValue(exact); view.unmount(); render(<AskClientPage />);
    expect(composer()).toHaveValue(exact); expect(streamFetch).toHaveBeenCalledOnce();
});

it('starts a fresh chat explicitly, confirms draft discard, and does not restore the discarded chat on reload', async () => {
    const view = render(<AskClientPage />);
    fireEvent.change(composer(), { target: { value: 'First conversation question' } }); send();
    await waitFor(() => expect(streamFetch).toHaveBeenCalledOnce()); await finish();
    fireEvent.change(composer(), { target: { value: exact } });
    const previousChat = readLibraryChatSession(identity.owner)!.chatId;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start new chat' })[0]);
    expect(composer()).toHaveValue(exact);
    expect(screen.getByText('First conversation question')).toBeInTheDocument();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start new chat' })[0]);
    expect(composer()).toHaveValue('');
    expect(screen.queryByText('First conversation question')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'What have I completed in my library?' })).toBeInTheDocument();
    expect(readLibraryChatSession(identity.owner)?.chatId).not.toBe(previousChat);
    view.unmount(); render(<AskClientPage />);
    expect(composer()).toHaveValue('');
    expect(screen.queryByText('First conversation question')).not.toBeInTheDocument();
    expect(streamFetch).toHaveBeenCalledOnce();
});
