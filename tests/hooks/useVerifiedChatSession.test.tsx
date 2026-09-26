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
