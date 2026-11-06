'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { newLibraryChatSession, readLibraryChatSession, writeLibraryChatSession,
    type LibraryChatSession } from '@/lib/library-chat-session';

/** One active Library conversation per verified account/session in this tab. */
export function useLibraryChatRecovery(owner: string, isCurrent: (owner: string) => boolean) {
    const [initial] = useState(() => readLibraryChatSession(owner) ?? newLibraryChatSession());
    const latest = useRef(initial);
    const [session, setSession] = useState(initial);
    const [durable, setDurable] = useState(true);
    const persist = useCallback((next: LibraryChatSession) => {
        latest.current = next;
        setSession(next);
        // Same-session checks may briefly suspend writes. Never persist under an
        // unverified identity; the effect flushes only if this owner is verified again.
        if (isCurrent(owner)) setDurable(writeLibraryChatSession(owner, next));
    }, [isCurrent, owner]);
    useEffect(() => {
        if (isCurrent(owner)) setDurable(writeLibraryChatSession(owner, latest.current));
    }, [isCurrent, owner]);
    useEffect(() => {
        if (durable || (!session.draft && !session.messages.length)) return;
        const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', protect);
        return () => window.removeEventListener('beforeunload', protect);
    }, [durable, session.draft, session.messages.length]);

    const changeDraft = (draft: string) => persist({ ...latest.current, draft });
    const begin = (messages: UIMessage[], questionId: string, submittedText?: string) => {
        const current = latest.current;
        persist({ ...current, messages, pendingQuestionId: questionId, failure: null,
            // Suggestions and Retry never replace another unfinished question.
            draft: submittedText === current.draft ? '' : current.draft });
    };
    const fail = (questionId: string, message: string) => {
        if (latest.current.pendingQuestionId !== questionId) return;
        persist({ ...latest.current, pendingQuestionId: null, failure: { questionId, message } });
    };
    const complete = (questionId: string, messages: UIMessage[]) => {
        if (latest.current.pendingQuestionId !== questionId) return;
        persist({ ...latest.current, messages, pendingQuestionId: null, failure: null });
    };
    const reset = () => persist(newLibraryChatSession());
    return { session, durable, changeDraft, begin, fail, complete, reset };
}
