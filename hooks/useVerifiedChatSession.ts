'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAuthRetryableFetchError, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import { clearLegacyNotesChatSessions, clearNotesChatOwner } from '@/lib/notes-chat-session';

export const CHAT_SESSION_SLOW_MS = 10_000;
export type ChatSessionVerification = 'checking' | 'slow' | 'failed' | 'verified' | 'signed-out';

/** Browser storage and pending streams belong to a verified account + Auth session. */
export function useVerifiedChatSession() {
    const [verificationVersion, setVerificationVersion] = useState(0);
    const [resolved, setResolved] = useState(false);
    const [ownerKey, setOwnerKey] = useState<string | null>(null);
    const [verificationState, setVerificationState] = useState<ChatSessionVerification>('checking');
    const verified = useRef<string | null>(null);
    const prior = useRef<string | null>(null);
    const restart = useRef<(() => void) | null>(null);
    useEffect(() => {
        const supabase = createClient();
        // SSR 0.5 has the earlier generic order; RPC still uses generated signatures.
        const sessionClient = supabase as unknown as Pick<SupabaseClient<Database>, 'rpc'>;
        let generation = 0;
        let mounted = true;
        let phase: ChatSessionVerification = 'checking';
        let timer: ReturnType<typeof setTimeout> | undefined;
        clearLegacyNotesChatSessions();
        const current = (ticket: number) => mounted && ticket === generation;
        const update = (state: ChatSessionVerification) => { phase = state; setVerificationState(state); };
        const clearOwner = () => {
            if (prior.current) clearNotesChatOwner(prior.current);
            prior.current = null; setOwnerKey(null);
        };
        const apply = (key: string | null) => {
            clearTimeout(timer);
            if (prior.current && prior.current !== key) clearOwner();
            prior.current = key; verified.current = key; setOwnerKey(key); setResolved(true);
            update(key ? 'verified' : 'signed-out');
            setVerificationVersion(version => version + 1);
        };
        const fail = (ticket: number) => {
            if (!current(ticket)) return;
            clearTimeout(timer); verified.current = null; setResolved(true); update('failed');
        };
        const begin = () => {
            const ticket = ++generation;
            clearTimeout(timer); verified.current = null; update('checking');
            timer = setTimeout(() => { if (current(ticket)) update('slow'); }, CHAT_SESSION_SLOW_MS);
            return ticket;
        };
        const resolve = async (session: Session | null, ticket: number) => {
            if (!current(ticket)) return;
            // Recovery re-reads the session. Hide the previous account before any
            // new account's asynchronous checks can resolve or restore a draft.
            if (prior.current && session?.user.id !== JSON.parse(prior.current)[0]) clearOwner();
            if (!session) { apply(null); return; }
            try {
                const [{ data, error }, { data: userData, error: userError }, { error: sessionError }] = await Promise.all([
                    supabase.auth.getClaims(session.access_token),
                    supabase.auth.getUser(session.access_token),
                    // This RPC checks auth.sessions; getUser can accept a revoked but unexpired JWT.
                    sessionClient.rpc('personal_evidence_index_status', { p_scope: { version: 1, itemType: 'all' } }),
                ]);
                if (!current(ticket)) return;
                if (error || userError || sessionError) {
                    // Confirmed authentication rejection still clears its cache.
                    // A transport/service failure retains only the unverified
                    // original owner's local draft; it never permits submission.
                    if ((error && !isAuthRetryableFetchError(error)) || (userError && !isAuthRetryableFetchError(userError))
                        || sessionError?.code === '42501') apply(null);
                    else fail(ticket);
                    return;
                }
                const claims = data?.claims;
                apply(userData.user?.id === session.user.id && claims?.sub === session.user.id && typeof claims.session_id === 'string'
                    ? JSON.stringify([claims.sub, claims.session_id]) : null);
            } catch { fail(ticket); }
        };
        const checkSession = () => {
            const ticket = begin();
            void supabase.auth.getSession().then(({ data, error }) => {
                if (!current(ticket)) return;
                if (error) { fail(ticket); return; }
                return resolve(data.session, ticket);
            }).catch(() => fail(ticket));
        };
        restart.current = () => { if (mounted && (phase === 'slow' || phase === 'failed')) checkSession(); };
        checkSession();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            const ticket = begin();
            // Logout/account changes clear immediately. Same-session rechecks
            // preserve editing, but remain visibly blocked until fully verified.
            if (event === 'SIGNED_OUT') { apply(null); return; }
            if (prior.current && session?.user.id !== JSON.parse(prior.current)[0]) clearOwner();
            // Supabase calls must run outside the synchronous auth callback.
            queueMicrotask(() => { void resolve(session, ticket); });
        });
        return () => { mounted = false; generation++; clearTimeout(timer); verified.current = null; restart.current = null; subscription.unsubscribe(); };
    }, []);
    const isCurrent = useCallback((key: string) => {
        // Changing the callback after verification also persists any final stream
        // update that arrived while a same-session refresh was being checked.
        void verificationVersion;
        return verified.current === key;
    }, [verificationVersion]);
    const retryVerification = useCallback(() => { restart.current?.(); }, []);
    return { ownerKey, isCurrent, resolved, verificationState, retryVerification };
}
