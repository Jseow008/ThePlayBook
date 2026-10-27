import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useVerifiedChatSession } from '@/hooks/useVerifiedChatSession';
import { createNotesChatScope } from '@/lib/notes-chat-scope';
import { readNotesChatSession, writeNotesChatSession } from '@/lib/notes-chat-session';
const auth = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn(), getClaims: vi.fn(), getUser: vi.fn(), callback: null as null | ((event: string, session: unknown) => void), unsubscribe: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc: auth.rpc, auth: { getSession: auth.getSession, getClaims: auth.getClaims, getUser: auth.getUser, onAuthStateChange: (callback: typeof auth.callback) => { auth.callback = callback; return { data: { subscription: { unsubscribe: auth.unsubscribe } } }; } } }) }));
const session = (user = 'a', token = 'one') => ({ user: { id: user }, access_token: token });
const claims = (user = 'a', id = 'session-one') => ({ data: { claims: { sub: user, session_id: id } }, error: null });
const emit = async (event: string, value: unknown) => { await act(async () => { auth.callback?.(event, value); }); };
beforeEach(() => { vi.clearAllMocks(); auth.rpc.mockResolvedValue({ data: { status: "ready" }, error: null }); window.sessionStorage.clear(); auth.getSession.mockResolvedValue({ data: { session: session() } }); auth.getClaims.mockResolvedValue(claims()); auth.getUser.mockResolvedValue({ data: { user: { id: "a" } }, error: null }); });
it('preserves identity and stored chat through ordinary verified token refresh', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.ownerKey).toBe(JSON.stringify(['a', 'session-one'])));
    const owner = result.current.ownerKey!;
    const scope = createNotesChatScope({ version: 1, itemType: 'reflection' });
    writeNotesChatSession(owner, { activeScope: scope, messages: [], updatedAt: 1 });
    await emit('TOKEN_REFRESHED', session('a', 'two'));
    expect(result.current.ownerKey).toBe(owner);
    expect(result.current.isCurrent(owner)).toBe(true);
    expect(readNotesChatSession(owner, scope.signature)).not.toBeNull();
});
it('rejects late claims after logout and clears the prior owner cache', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.ownerKey).not.toBeNull());
    const owner = result.current.ownerKey!;
    const scope = createNotesChatScope({ version: 1, itemType: 'all' });
    writeNotesChatSession(owner, { activeScope: scope, messages: [], updatedAt: 1 });
    let complete!: (value: ReturnType<typeof claims>) => void;
    auth.getClaims.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    await emit('TOKEN_REFRESHED', session());
    await emit('SIGNED_OUT', null);
    await act(async () => { complete(claims()); });
    expect(result.current.ownerKey).toBeNull();
    expect(result.current.isCurrent(owner)).toBe(false);
    expect(readNotesChatSession(owner, scope.signature)).toBeNull();
});
it('discards reversed initial claims and accepts only the newer account session', async () => {
    let complete!: (value: ReturnType<typeof claims>) => void;
    auth.getClaims.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(auth.getClaims).toHaveBeenCalledOnce());
    auth.getClaims.mockResolvedValue(claims('b', 'session-two'));
    auth.getUser.mockResolvedValue({ data: { user: { id: 'b' } }, error: null });
    await emit('SIGNED_IN', session('b', 'two'));
    await act(async () => { complete(claims()); });
    expect(result.current.ownerKey).toBe(JSON.stringify(['b', 'session-two']));
});
it('changes identity when verified session is replaced on the same account', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.ownerKey).not.toBeNull());
    const previous = result.current.ownerKey!;
    auth.getClaims.mockResolvedValue(claims('a', 'replacement'));
    await emit('SIGNED_IN', session());
    expect(result.current.ownerKey).toBe(JSON.stringify(['a', 'replacement']));
    expect(result.current.isCurrent(previous)).toBe(false);
});
it('preserves a chat when SIGNED_IN reconfirms the same verified session', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.ownerKey).not.toBeNull());
    const owner = result.current.ownerKey!;
    const scope = createNotesChatScope({ version: 1, itemType: 'all' });
    writeNotesChatSession(owner, { activeScope: scope, messages: [], updatedAt: 1 });
    let finish!: (value: ReturnType<typeof claims>) => void;
    auth.getClaims.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await emit('SIGNED_IN', session());
    expect(result.current.ownerKey).toBe(owner);
    expect(result.current.isCurrent(owner)).toBe(false);
    await act(async () => { finish(claims()); });
    expect(result.current.ownerKey).toBe(owner);
    expect(result.current.isCurrent(owner)).toBe(true);
    expect(readNotesChatSession(owner, scope.signature)).not.toBeNull();
});

it('does not restore a cached transcript when local claims pass but remote authentication is revoked', async () => {
    const owner = JSON.stringify(['a', 'session-one']);
    const scope = createNotesChatScope({ version: 1, itemType: 'all' });
    writeNotesChatSession(owner, { activeScope: scope, messages: [], updatedAt: 1 });
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('revoked session') });
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.ownerKey).toBeNull();
    expect(result.current.isCurrent(owner)).toBe(false);
});

it('rejects a revoked live session even when claims and getUser still accept its JWT', async () => {
    auth.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.resolved).toBe(true));
    expect(result.current.ownerKey).toBeNull();
});
it('hides the old account immediately while a new account verification is pending', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.ownerKey).not.toBeNull());
    auth.getClaims.mockImplementationOnce(() => new Promise(() => {}));
    await emit('SIGNED_IN', session('b', 'new-token'));
    expect(result.current.ownerKey).toBeNull();
});
it('notifies transcript persistence after an ordinary refresh finishes', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.ownerKey).not.toBeNull());
    const owner = result.current.ownerKey!;
    const before = result.current.isCurrent;
    let finish!: (value: ReturnType<typeof claims>) => void;
    auth.getClaims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await emit('TOKEN_REFRESHED', session('a', 'refreshed-token'));
    expect(result.current.ownerKey).toBe(owner);
    expect(result.current.isCurrent(owner)).toBe(false);
    await act(async () => { finish(claims()); });
    expect(result.current.ownerKey).toBe(owner);
    expect(result.current.isCurrent).not.toBe(before);
    expect(result.current.isCurrent(owner)).toBe(true);
});

it('distinguishes a slow recheck from failure and still accepts its eventual verified result', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.verificationState).toBe('verified'));
    const owner = result.current.ownerKey!;
    let finish!: (value: ReturnType<typeof claims>) => void;
    auth.getClaims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.useFakeTimers();
    try {
        await emit('SIGNED_IN', session());
        expect(result.current.verificationState).toBe('checking');
        expect(result.current.ownerKey).toBe(owner); expect(result.current.isCurrent(owner)).toBe(false);
        await act(async () => { await vi.advanceTimersByTimeAsync(9_999); });
        expect(result.current.verificationState).toBe('checking');
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(result.current.verificationState).toBe('slow');
        expect(result.current.isCurrent(owner)).toBe(false);
        await act(async () => { finish(claims()); });
        expect(result.current.verificationState).toBe('verified'); expect(result.current.isCurrent(owner)).toBe(true);
    } finally { vi.useRealTimers(); }
});

it('offers recovery when initial session lookup hangs, and fences the abandoned lookup', async () => {
    let finish!: (value: { data: { session: ReturnType<typeof session> } }) => void;
    auth.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.useFakeTimers();
    try {
        const { result } = renderHook(() => useVerifiedChatSession());
        await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
        expect(result.current.verificationState).toBe('slow');
        await act(async () => { result.current.retryVerification(); result.current.retryVerification(); });
        expect(auth.getSession).toHaveBeenCalledTimes(2);
        expect(result.current.verificationState).toBe('verified');
        auth.getClaims.mockResolvedValue(claims('b', 'stale-session'));
        await act(async () => { finish({ data: { session: session('b') } }); });
        expect(result.current.ownerKey).toBe(JSON.stringify(['a', 'session-one']));
        expect(auth.getClaims).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
});

it('retains only the unverified owner on service failure and explicitly rechecks the current session', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.verificationState).toBe('verified'));
    const owner = result.current.ownerKey!;
    const scope = createNotesChatScope({ version: 1, itemType: 'all' });
    writeNotesChatSession(owner, { activeScope: scope, messages: [], updatedAt: 1 });
    auth.rpc.mockResolvedValueOnce({ data: null, error: { code: '503', message: 'Unavailable' } });
    await emit('TOKEN_REFRESHED', session());
    expect(result.current.verificationState).toBe('failed'); expect(result.current.ownerKey).toBe(owner);
    expect(result.current.isCurrent(owner)).toBe(false); expect(readNotesChatSession(owner, scope.signature)).not.toBeNull();
    await act(async () => { result.current.retryVerification(); });
    expect(auth.getSession).toHaveBeenCalledTimes(2); expect(result.current.verificationState).toBe('verified');
});

it('hides and clears the old account before recovery verifies a changed account', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.verificationState).toBe('verified'));
    const owner = result.current.ownerKey!;
    const scope = createNotesChatScope({ version: 1, itemType: 'all' });
    writeNotesChatSession(owner, { activeScope: scope, messages: [], updatedAt: 1 });
    auth.rpc.mockResolvedValueOnce({ data: null, error: { code: '503' } }); await emit('SIGNED_IN', session());
    let finish!: (value: ReturnType<typeof claims>) => void;
    auth.getSession.mockResolvedValueOnce({ data: { session: session('b') }, error: null });
    auth.getClaims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'b' } }, error: null });
    await act(async () => { result.current.retryVerification(); });
    expect(result.current.ownerKey).toBeNull(); expect(result.current.verificationState).toBe('checking');
    expect(result.current.isCurrent(owner)).toBe(false); expect(readNotesChatSession(owner, scope.signature)).toBeNull();
    await act(async () => { finish(claims('b', 'session-two')); });
    expect(result.current.ownerKey).toBe(JSON.stringify(['b', 'session-two']));
});

it('ignores late old-session completion after slow-check recovery changes session identity', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.verificationState).toBe('verified'));
    const previous = result.current.ownerKey!;
    let finish!: (value: ReturnType<typeof claims>) => void;
    auth.getClaims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    vi.useFakeTimers();
    try {
        await emit('SIGNED_IN', session()); await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
        auth.getClaims.mockResolvedValue(claims('a', 'replacement'));
        await act(async () => { result.current.retryVerification(); });
        expect(result.current.ownerKey).toBe(JSON.stringify(['a', 'replacement']));
        await act(async () => { finish(claims()); });
        expect(result.current.isCurrent(previous)).toBe(false); expect(result.current.verificationState).toBe('verified');
        expect(result.current.ownerKey).toBe(JSON.stringify(['a', 'replacement']));
    } finally { vi.useRealTimers(); }
});


it('retains the original unverified identity on retryable auth transport failure but clears it on rejection', async () => {
    const { result } = renderHook(() => useVerifiedChatSession());
    await waitFor(() => expect(result.current.verificationState).toBe('verified'));
    const owner = result.current.ownerKey!;
    const scope = createNotesChatScope({ version: 1, itemType: 'all' });
    writeNotesChatSession(owner, { activeScope: scope, messages: [], updatedAt: 1 });
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthRetryableFetchError('Synthetic offline', 0) });
    await emit('TOKEN_REFRESHED', session());
    expect(result.current.verificationState).toBe('failed'); expect(result.current.ownerKey).toBe(owner);
    expect(result.current.isCurrent(owner)).toBe(false);
    auth.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await act(async () => { result.current.retryVerification(); });
    expect(result.current.ownerKey).toBeNull(); expect(result.current.verificationState).toBe('signed-out');
    expect(readNotesChatSession(owner, scope.signature)).toBeNull();
});
