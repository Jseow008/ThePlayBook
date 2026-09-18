import type { ReactNode } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthUserProvider, useAuthSessionIdentity } from '@/hooks/useAuthUser';
import { createNotesChatScope } from '@/lib/notes-chat-scope';
import { getNotesChatStorageKey, writeNotesChatSession } from '@/lib/notes-chat-session';

const auth = vi.hoisted(() => ({
    callback: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
    getUser: vi.fn(),
    unsubscribe: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: {
        getUser: auth.getUser,
        onAuthStateChange: (callback: NonNullable<typeof auth.callback>) => {
            auth.callback = callback;
            return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
        },
    } }),
}));

const user: User = { id: 'account-a', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z' };
const scope = createNotesChatScope({ version: 1, itemType: 'all' });
const owner = JSON.stringify([user.id, 'session-one']);
const oldOwner = JSON.stringify(['account-b', 'old-session']);
const legacyKey = 'netflux_notes_chat_session:v1:old-scope';
const unrelatedKey = 'netflux.unrelated.preference';
const wrapper = ({ children }: { children: ReactNode }) => <AuthUserProvider initialUser={user}>{children}</AuthUserProvider>;

function seedStorage() {
    const payload = { activeScope: scope, messages: [{ id: 'private-question', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Private saved question' }] }], updatedAt: 1 };
    writeNotesChatSession(owner, payload);
    writeNotesChatSession(oldOwner, payload);
    window.sessionStorage.setItem(legacyKey, 'Legacy private transcript');
    window.sessionStorage.setItem(unrelatedKey, 'preserved');
}

beforeEach(() => {
    vi.clearAllMocks();
    auth.callback = null;
    window.sessionStorage.clear();
});

it('synchronously clears every dormant Notes transcript on sign-out without a Notes hook mounted', () => {
    const { result } = renderHook(() => useAuthSessionIdentity(), { wrapper });
    seedStorage();
    const previousEpoch = result.current.sessionEpoch;

    act(() => {
        auth.callback!('SIGNED_OUT', null);
        // Assert immediately after the listener, before React flushes its state updates.
        expect(window.sessionStorage.getItem(getNotesChatStorageKey(owner, scope.signature))).toBeNull();
        expect(window.sessionStorage.getItem(getNotesChatStorageKey(oldOwner, scope.signature))).toBeNull();
        expect(window.sessionStorage.getItem(legacyKey)).toBeNull();
        expect(window.sessionStorage.getItem(unrelatedKey)).toBe('preserved');
    });

    expect(result.current.user).toBeNull();
    expect(result.current.sessionEpoch).toBe(previousEpoch + 1);
    expect(auth.getUser).not.toHaveBeenCalled();
});

it.each(['TOKEN_REFRESHED', 'SIGNED_IN'] as const)('preserves Notes storage during same-session %s', (event) => {
    const { result } = renderHook(() => useAuthSessionIdentity(), { wrapper });
    seedStorage();
    const previous = Object.fromEntries(Object.keys(window.sessionStorage).map(key => [key, window.sessionStorage.getItem(key)]));

    act(() => auth.callback!(event, { user, access_token: 'same-session-new-token' } as Session));

    expect(result.current.user?.id).toBe(user.id);
    expect(Object.fromEntries(Object.keys(window.sessionStorage).map(key => [key, window.sessionStorage.getItem(key)]))).toEqual(previous);
});
