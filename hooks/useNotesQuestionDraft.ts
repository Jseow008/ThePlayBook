'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import type { NotesChatScopePayload } from '@/lib/notes-chat-scope';
import { readNotesChatSession, writeNotesChatSession } from '@/lib/notes-chat-session';
import {
    findFallbackNotesChatContext, newNotesChatContext, readNotesChatContext, writeNotesChatContext,
    type NotesChatContext,
} from '@/lib/notes-chat-context';

function resolveContext(owner: string, scope: NotesChatScopePayload, requested: string | null): NotesChatContext {
    if (requested) return readNotesChatContext(owner, requested) ?? { ...newNotesChatContext(scope), contextId: requested };
    const legacy = readNotesChatSession(owner, scope.signature);
    const context = legacy?.contextId ? readNotesChatContext(owner, legacy.contextId) : findFallbackNotesChatContext(owner, scope.signature);
    if (context?.activeScope.signature === scope.signature) return context;
    const fresh = newNotesChatContext(scope);
    // Existing transcripts remain readable. A stale scope alias must not attach
    // another context's unfinished question to a new chat.
    if (legacy) fresh.messages = legacy.messages;
    return fresh;
}

/** One same-tab Notes context; New chat rotates its chat identity, not its URL. */
export function useNotesQuestionDraft(owner: string, scope: NotesChatScopePayload, requested: string | null, isCurrent: (key: string) => boolean) {
    const [initial] = useState(() => resolveContext(owner, scope, requested));
    const latest = useRef(initial);
    const [draft, setDraft] = useState(initial.draft);
    const [chatId, setChatId] = useState(initial.chatId);
    const [durable, setDurable] = useState(true);
    const pendingWrite = useRef(false);

    const persist = useCallback((context: NotesChatContext) => {
        latest.current = context;
        if (!isCurrent(owner)) { pendingWrite.current = true; return; }
        pendingWrite.current = false;
        setDurable(writeNotesChatContext(owner, context));
        writeNotesChatSession(owner, { activeScope: context.activeScope, messages: context.messages,
            contextId: context.contextId, updatedAt: context.updatedAt });
    }, [isCurrent, owner]);
    const hydrated = useRef(false);
    useEffect(() => {
        if (!isCurrent(owner) || (hydrated.current && !pendingWrite.current)) return;
        hydrated.current = true;
        persist(latest.current);
    }, [initial, isCurrent, owner, persist]);
    useEffect(() => {
        if (durable || !draft.text) return;
        const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', protect);
        return () => window.removeEventListener('beforeunload', protect);
    }, [draft.text, durable]);

    const change = (text: string) => {
        const stored = readNotesChatContext(owner, initial.contextId);
        const current = stored && stored.draft.revision > latest.current.draft.revision ? stored : latest.current;
        if (current.chatId !== latest.current.chatId) return;
        const next = { ...current, draft: { text, revision: current.draft.revision + 1 }, updatedAt: Date.now() };
        persist(next);
        setDraft(next.draft);
    };
    const complete = (submitted: { chatId: string; revision: number }) => {
        if (!isCurrent(owner)) return;
        const current = readNotesChatContext(owner, initial.contextId);
        if (!current || current.chatId !== submitted.chatId || current.draft.revision !== submitted.revision) return;
        const next = { ...current, draft: { text: '', revision: current.draft.revision + 1 }, updatedAt: Date.now() };
        persist(next);
        setDraft(next.draft);
    };
    const saveTranscript = useCallback((activeScope: NotesChatScopePayload, messages: UIMessage[]) => {
        if (!isCurrent(owner)) return;
        const current = readNotesChatContext(owner, initial.contextId) ?? latest.current;
        if (current.chatId !== chatId) return;
        persist({ ...current, activeScope, messages, updatedAt: Date.now() });
    }, [chatId, initial.contextId, isCurrent, owner, persist]);
    const reset = (activeScope: NotesChatScopePayload, keepQuestion: boolean) => {
        if (!isCurrent(owner)) return;
        const next = { ...newNotesChatContext(activeScope), contextId: initial.contextId,
            draft: { text: keepQuestion ? latest.current.draft.text : '', revision: 0 } };
        persist(next);
        setChatId(next.chatId);
        setDraft(next.draft);
    };
    return { initial, contextId: initial.contextId, chatId, draft, durable, change, complete, saveTranscript, reset };
}
