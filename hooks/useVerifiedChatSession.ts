'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { createClient } from '@/lib/supabase/client';
import { clearLegacyNotesChatSessions, clearNotesChatOwner } from '@/lib/notes-chat-session';

/** Browser storage and pending streams belong to a verified account + Auth session. */
export function useVerifiedChatSession() {
    const [verificationVersion, setVerificationVersion] = useState(0);
    const [resolved, setResolved] = useState(false);
    const [ownerKey, setOwnerKey] = useState<string | null>(null);
    const verified = useRef<string | null>(null);
    const prior = useRef<string | null>(null);
    useEffect(() => {
        const supabase = createClient();
        // SSR 0.5 has the earlier generic order; RPC still uses generated signatures.
        const sessionClient = supabase as unknown as Pick<SupabaseClient<Database>, "rpc">;
        let generation = 0;
        let mounted = true;
        clearLegacyNotesChatSessions();
        const apply = (key: string | null) => {
            if (prior.current && prior.current !== key) clearNotesChatOwner(prior.current);
            prior.current = key; verified.current = key; setOwnerKey(key); setResolved(true);
            setVerificationVersion((version) => version + 1);
        };
        const resolve = async (session: Session | null, ticket: number) => {
            if (!mounted || ticket !== generation) return;
            if (!session) { apply(null); return; }
            try {
                const [{ data, error }, { data: userData, error: userError }, { error: sessionError }] = await Promise.all([
                    supabase.auth.getClaims(session.access_token),
                    supabase.auth.getUser(session.access_token),
                    // This RPC checks auth.sessions; getUser can accept a revoked but unexpired JWT.
                    sessionClient.rpc("personal_evidence_index_status", { p_scope: { version: 1, itemType: "all" } }),
                ]);
                if (!mounted || ticket !== generation) return;
                const claims = data?.claims;
                apply(!error && !userError && !sessionError && userData.user?.id === session.user.id && claims?.sub === session.user.id && typeof claims.session_id === 'string'
                    ? JSON.stringify([claims.sub, claims.session_id]) : null);
            } catch { if (mounted && ticket === generation) apply(null); }
        };
        const initialTicket = ++generation;
        void supabase.auth.getSession().then(({ data }) => resolve(data.session, initialTicket)).catch(() => {
            if (mounted && initialTicket === generation) apply(null);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            const ticket = ++generation;
            // Logout clears immediately. Reconfirmation and token refresh preserve
            // the transcript until claims establish a different session identity.
            verified.current = null;
            if (event === 'SIGNED_OUT' || (prior.current && session?.user.id !== JSON.parse(prior.current)[0])) apply(null);
            queueMicrotask(() => { void resolve(session, ticket); });
        });
        return () => { mounted = false; generation++; verified.current = null; subscription.unsubscribe(); };
    }, []);
    const isCurrent = useCallback((key: string) => {
        // Changing the callback after verification also persists any final stream
        // update that arrived while a same-session refresh was being checked.
        void verificationVersion;
        return verified.current === key;
    }, [verificationVersion]);
    return { ownerKey, isCurrent, resolved };
}
